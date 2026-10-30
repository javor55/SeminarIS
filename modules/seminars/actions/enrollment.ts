"use server";

import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { computeEnrollmentStatus } from "@/lib/utils";
import { assertNotImpersonating, requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import { syncEnrollmentWindowStatus } from "@/modules/seminars/window-status";
import { getStudentAudienceInfo, isStudentInWindowAudience } from "@/modules/seminars/eligibility";
import { isInOccurrenceAudience } from "@/modules/seminars/audience";
import { checkStudentCanChange } from "@/modules/seminars/window-rules";

// Pozn.: tyto akce nepoužívají safeAction (vracejí { success } | { error }), proto si
// režim „zobrazit jako“ (jen pro čtení) hlídají samy.
//
// Všechna pravidla (publikum, otevřenost okna, omezení výskytu, kapacita, počet zápisů v bloku,
// odepisování a termín změn) se vyhodnocují tady na serveru, v transakci. UI je jen zobrazuje.

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Serializable transakce se při souběhu může odmítnout (P2034); pak se zkusí znovu a dostane správné výsledky kontrol. */
// eslint-disable-next-line no-unused-vars
async function serializable<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      if (attempt < 4 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") continue;
      throw e;
    }
  }
}

type EnrollmentWindowLike = { id: string; status: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED"; startsAt: Date; endsAt: Date };

/** Student (bez práva zapisovat kdykoli) smí pracovat jen s otevřeným oknem. */
async function assertWindowOpen(ew: EnrollmentWindowLike) {
  const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
  // Lazy update: synchronizujeme stav v DB s reálným časem
  await syncEnrollmentWindowStatus(ew);
  if (computed.is === "closed") {
    if (ew.status === "DRAFT") throw new Error("Zápis je momentálně v přípravě (Koncept).");
    if (new Date() > new Date(ew.endsAt)) throw new Error("Zápis již byl ukončen.");
    throw new Error("Zápis není otevřen.");
  }
  if (computed.is === "planned") throw new Error("Zápis ještě nebyl zahájen.");
}

/** Zápis studenta do výskytu uvnitř transakce; vyhodí chybu s českým textem, když něco nesedí. */
async function enrollInTx(tx: TxClient, user: User, studentId: string, subjectOccurrenceId: string) {
  const occ = await tx.subjectOccurrence.findUnique({
    where: { id: subjectOccurrenceId },
    include: {
      subject: true,
      restrictClasses: { select: { id: true } },
      block: { include: { enrollmentWindow: true } },
    },
  });
  if (!occ || occ.deletedAt || occ.block.deletedAt) throw new Error("Předmět nenalezen.");
  const ew = occ.block.enrollmentWindow;
  const privileged = can(user.role, "seminars.enroll.others");

  // 1. Okno musí být otevřené (admin smí zapisovat kdykoli)
  if (!can(user.role, "seminars.enroll.anytime")) await assertWindowOpen(ew);

  // 2. Okno i výskyt musí být určeny tomuto studentovi (učitel/admin může zapsat kohokoliv)
  if (!privileged) {
    if (!(await isStudentInWindowAudience(ew.id, studentId, tx))) throw new Error("Tento zápis pro vás není určen.");
    if (!isInOccurrenceAudience(occ, await getStudentAudienceInfo(studentId, tx))) {
      throw new Error("Tento předmět není určen pro váš ročník nebo třídu.");
    }
  }

  // 3. Kapacita (v serializable transakci, takže se souběžné zápisy na poslední místo vzájemně neprojdou)
  const taken = await tx.studentEnrollment.count({ where: { subjectOccurrenceId, deletedAt: null } });
  if (occ.capacity !== null && taken >= occ.capacity) throw new Error("Kapacita předmětu je již naplněna.");

  // 4. Počet zápisů studenta v bloku (max); stejný výskyt dvakrát nelze
  const inBlock = await tx.studentEnrollment.findMany({
    where: { studentId, deletedAt: null, subjectOccurrence: { blockId: occ.blockId, deletedAt: null } },
    select: { subjectOccurrenceId: true },
  });
  if (inBlock.some((e) => e.subjectOccurrenceId === subjectOccurrenceId)) throw new Error("Na tento předmět už jste zapsáni.");
  if (inBlock.length >= occ.block.maxEnrollments) {
    throw new Error(
      occ.block.maxEnrollments === 1
        ? "V tomto bloku již máte zapsaný jiný předmět. Nejdříve se odepište."
        : `V tomto bloku už máte nejvyšší povolený počet zápisů (${occ.block.maxEnrollments}). Nejdříve se odepište.`
    );
  }

  // 5. Stejný předmět nesmí být v rámci okna zapsán dvakrát (podle subjectId, nezávisle na subCode)
  const sameSubjectInWindow = await tx.studentEnrollment.findFirst({
    where: {
      studentId,
      deletedAt: null,
      subjectOccurrence: { subjectId: occ.subjectId, deletedAt: null, block: { enrollmentWindowId: ew.id } },
    },
  });
  if (sameSubjectInWindow) throw new Error("Tento předmět už máte zapsaný v jiném bloku tohoto zápisu.");

  const created = await tx.studentEnrollment.create({
    data: { studentId, subjectOccurrenceId, createdById: user.id as string },
  });
  const student = await tx.user.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } });
  const what = `předmětu „${occ.subject.name}“ (blok „${occ.block.name}“, zápis „${ew.name}“)`;
  await audit(tx, user, {
    action: "seminars.enrollment.add",
    entityType: "studentEnrollment",
    entityId: created.id,
    summary:
      user.id === studentId
        ? `${student ? fullName(student) : "Student"} se zapsal(a) do ${what}`
        : `${fullName(user)} zapsal(a) studenta ${student ? fullName(student) : studentId} do ${what}`,
    data: { studentId, subjectOccurrenceId, subjectId: occ.subjectId, blockId: occ.blockId, windowId: ew.id, byOther: user.id !== studentId },
  });
  return created;
}

/** Odepsání uvnitř transakce včetně pravidel okna pro studenta (otevřené okno, smí se odepsat, termín změn). */
async function unenrollInTx(tx: TxClient, user: User, enrollmentId: string) {
  const enrollment = await tx.studentEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { select: { firstName: true, lastName: true } },
      subjectOccurrence: { include: { subject: true, block: { include: { enrollmentWindow: true } } } },
    },
  });
  if (!enrollment || enrollment.deletedAt) throw new Error("Zápis nenalezen.");
  // Student může odepsat jen sebe, ADMIN/TEACHER kohokoliv
  const canManageOthers = can(user.role, "seminars.enroll.others");
  if (enrollment.studentId !== user.id && !canManageOthers) throw new Error("Unauthorized mapping");

  const occ = enrollment.subjectOccurrence;
  const ew = occ.block.enrollmentWindow;
  if (!canManageOthers) {
    // Okno musí být otevřené, student se smí odepsat a nesmí uplynout termín změn
    const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
    await syncEnrollmentWindowStatus(ew);
    if (computed.is === "closed") throw new Error("Zápis je uzavřen – odepsání již není možné.");
    if (computed.is === "planned") throw new Error("Zápis ještě nebyl zahájen.");
    const allowed = checkStudentCanChange(ew);
    if (!allowed.ok) throw new Error(allowed.reason ?? "Změna zápisu není možná.");
  }

  // Smazání zápisu a záznam do historie změn v jedné transakci
  await tx.studentEnrollment.delete({ where: { id: enrollmentId } });
  const what = `z předmětu „${occ.subject.name}“ (blok „${occ.block.name}“, zápis „${ew.name}“)`;
  await audit(tx, user, {
    action: "seminars.enrollment.remove",
    entityType: "studentEnrollment",
    entityId: enrollmentId,
    summary:
      enrollment.studentId === user.id
        ? `${fullName(enrollment.student)} se odepsal(a) ${what}`
        : `${fullName(user)} odepsal(a) studenta ${fullName(enrollment.student)} ${what}`,
    data: { studentId: enrollment.studentId, subjectOccurrenceId: occ.id, subjectId: occ.subjectId, blockId: occ.blockId, windowId: ew.id, byOther: enrollment.studentId !== user.id },
  });
  return { studentId: enrollment.studentId, blockId: occ.blockId };
}

export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  try {
    await assertNotImpersonating();
    // Hosté nemohou zapisovat
    const user = await requirePermission("seminars.enroll.self");
    // Zamezit studentům zápis jiných studentů
    if (user.id !== studentId && !can(user.role, "seminars.enroll.others")) {
      throw new Error("Unauthorized mapping");
    }

    const res = await serializable((tx) => enrollInTx(tx, user, studentId, subjectOccurrenceId));

    revalidatePath("/", "layout");
    return { success: true, data: res };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Nepodařilo se provést zápis." };
  }
}


export async function unenrollStudent(enrollmentId: string) {
  try {
    await assertNotImpersonating();
    // Hosté nemohou odepisovat
    const user = await requirePermission("seminars.enroll.self");
    const res = await serializable((tx) => unenrollInTx(tx, user, enrollmentId));
    revalidatePath("/", "layout");
    return { success: true, data: res };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Nepodařilo se zrušit zápis." };
  }
}

/**
 * Přepsání zápisu v rámci jednoho bloku (odepsat z jednoho výskytu a zapsat do jiného) v jediné transakci:
 * když se nový zápis nepovede (kapacita, pravidla), původní zápis zůstane.
 */
export async function switchEnrollment(fromEnrollmentId: string, toSubjectOccurrenceId: string) {
  try {
    await assertNotImpersonating();
    const user = await requirePermission("seminars.enroll.self");
    const res = await serializable(async (tx) => {
      const from = await tx.studentEnrollment.findUnique({
        where: { id: fromEnrollmentId },
        select: { studentId: true, deletedAt: true, subjectOccurrence: { select: { blockId: true } } },
      });
      if (!from || from.deletedAt) throw new Error("Zápis nenalezen.");
      if (from.studentId !== user.id && !can(user.role, "seminars.enroll.others")) throw new Error("Unauthorized mapping");
      const target = await tx.subjectOccurrence.findUnique({ where: { id: toSubjectOccurrenceId }, select: { blockId: true } });
      if (!target) throw new Error("Předmět nenalezen.");
      if (target.blockId !== from.subjectOccurrence.blockId) throw new Error("Zápis lze přepsat jen na jiný předmět ve stejném bloku.");
      await unenrollInTx(tx, user, fromEnrollmentId);
      return enrollInTx(tx, user, from.studentId, toSubjectOccurrenceId);
    });
    revalidatePath("/", "layout");
    return { success: true, data: res };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Nepodařilo se přepsat zápis." };
  }
}
