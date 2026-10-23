"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { computeEnrollmentStatus } from "@/lib/utils";
import { assertNotImpersonating, requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { can } from "@/modules/registry";
import { syncEnrollmentWindowStatus } from "@/modules/seminars/window-status";
import { isWindowForGrade } from "@/modules/seminars/eligibility";
import { getStudentGrade } from "@/modules/core/school";

// Pozn.: tyto dvě akce nepoužívají safeAction (vracejí { success } | { error }), proto si
// režim „zobrazit jako“ (jen pro čtení) hlídají samy.

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  try {
    await assertNotImpersonating();
    // Hosté nemohou zapisovat
    const user = await requirePermission("seminars.enroll.self");
    // Zamezit studentům zápis jiných studentů
    if (user.id !== studentId && !can(user.role, "seminars.enroll.others")) {
      throw new Error("Unauthorized mapping");
    }

    // Celá logika zápisu v transakci – zamezení race condition při kontrole kapacity
    const res = await prisma.$transaction(async (tx) => {
      // Načteme cílový výskyt s kontextem
      const targetOcc = await tx.subjectOccurrence.findUnique({
        where: { id: subjectOccurrenceId },
        include: {
          subject: true,
          block: {
            include: { enrollmentWindow: true }
          },
          studentEnrollments: {
            where: { deletedAt: null }
          }
        }
      });

      if (!targetOcc || targetOcc.deletedAt) throw new Error("Předmět nenalezen.");

      // 0. Zápis musí být určen pro ročník studenta (učitel/admin může zapsat kohokoliv)
      if (!can(user.role, "seminars.enroll.others")) {
        const grade = await getStudentGrade(studentId);
        if (!isWindowForGrade(targetOcc.block.enrollmentWindow.targetGrades, grade)) {
          throw new Error("Tento zápis není určen pro váš ročník.");
        }
      }

      // 1. Kontrola kapacity
      if (targetOcc.capacity !== null && targetOcc.studentEnrollments.length >= targetOcc.capacity) {
        throw new Error("Kapacita předmětu je již naplněna.");
      }

      // 2. Kontrola, zda už není zapsán v tomto bloku
      const alreadyInBlock = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          deletedAt: null,
          subjectOccurrence: {
            blockId: targetOcc.blockId
          }
        }
      });
      if (alreadyInBlock) {
        throw new Error("V tomto bloku již máte zapsaný jiný předmět. Nejdříve se odepište.");
      }

      // 3. Kontrola duplicity predmetu v ramci stejneho okna (podle subjectId, nezavisle na subCode)
      const sameSubjectInWindow = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          deletedAt: null,
          subjectOccurrence: {
            subjectId: targetOcc.subjectId,
            block: {
              enrollmentWindowId: targetOcc.block.enrollmentWindowId
            },
          }
        }
      });

      if (sameSubjectInWindow) {
        throw new Error("Tento předmět už máte zapsaný v jiném bloku tohoto zápisu.");
      }

      // 4. Kontrola, zda je zápisové okno otevřené (pokud uživatel není ADMIN)
      if (!can(user.role, "seminars.enroll.anytime")) {
        const ew = targetOcc.block.enrollmentWindow;
        const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);

        // Lazy update: synchronizujeme stav v DB s reálným časem
        await syncEnrollmentWindowStatus(ew);

        if (computed.is === "closed") {
          if (ew.status === "DRAFT") throw new Error("Zápis je momentálně v přípravě (Koncept).");
          const now = new Date();
          if (now > new Date(ew.endsAt)) throw new Error("Zápis již byl ukončen.");
          throw new Error("Zápis není otevřen.");
        }
        if (computed.is === "planned") {
          throw new Error("Zápis ještě nebyl zahájen.");
        }
      }

      const created = await tx.studentEnrollment.create({
        data: {
          studentId,
          subjectOccurrenceId,
          createdById: user.id as string,
        },
      });
      const student = await tx.user.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } });
      const what = `předmětu „${targetOcc.subject.name}“ (blok „${targetOcc.block.name}“, zápis „${targetOcc.block.enrollmentWindow.name}“)`;
      await audit(tx, user, {
        action: "seminars.enrollment.add",
        entityType: "studentEnrollment",
        entityId: created.id,
        summary:
          user.id === studentId
            ? `${student ? fullName(student) : "Student"} se zapsal(a) do ${what}`
            : `${fullName(user)} zapsal(a) studenta ${student ? fullName(student) : studentId} do ${what}`,
        data: { studentId, subjectOccurrenceId, subjectId: targetOcc.subjectId, blockId: targetOcc.blockId, windowId: targetOcc.block.enrollmentWindowId, byOther: user.id !== studentId },
      });
      return created;
    }, {
      isolationLevel: 'Serializable',
    });

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
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        subjectOccurrence: {
          include: {
            subject: true,
            block: {
              include: { enrollmentWindow: true }
            }
          }
        }
      }
    });

    if (!enrollment) return { error: "Zápis nenalezen." };
    // Student může odepsat jen sebe, ADMIN/TEACHER kohokoliv
    const canManageOthers = can(user.role, "seminars.enroll.others");
    if (enrollment.studentId !== user.id && !canManageOthers) {
      throw new Error("Unauthorized mapping");
    }

    // Kontrola, zda je zápisové okno otevřené (pro studenty)
    if (!canManageOthers) {
      const ew = enrollment.subjectOccurrence.block.enrollmentWindow;
      const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);

      // Lazy update: synchronizujeme stav v DB s reálným časem
      await syncEnrollmentWindowStatus(ew);

      if (computed.is === "closed") {
        throw new Error("Zápis je uzavřen – odepsání již není možné.");
      }
      if (computed.is === "planned") {
        throw new Error("Zápis ještě nebyl zahájen.");
      }
    }

    // Smazání zápisu a záznam do historie změn v jedné transakci
    const res = await prisma.$transaction(async (tx) => {
      const deleted = await tx.studentEnrollment.delete({ where: { id: enrollmentId } });
      const occ = enrollment.subjectOccurrence;
      const what = `z předmětu „${occ.subject.name}“ (blok „${occ.block.name}“, zápis „${occ.block.enrollmentWindow.name}“)`;
      await audit(tx, user, {
        action: "seminars.enrollment.remove",
        entityType: "studentEnrollment",
        entityId: enrollmentId,
        summary:
          enrollment.studentId === user.id
            ? `${fullName(enrollment.student)} se odepsal(a) ${what}`
            : `${fullName(user)} odepsal(a) studenta ${fullName(enrollment.student)} ${what}`,
        data: { studentId: enrollment.studentId, subjectOccurrenceId: occ.id, subjectId: occ.subjectId, blockId: occ.blockId, windowId: occ.block.enrollmentWindowId, byOther: enrollment.studentId !== user.id },
      });
      return deleted;
    });
    revalidatePath("/", "layout");
    return { success: true, data: res };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Nepodařilo se zrušit zápis." };
  }
}
