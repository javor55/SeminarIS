"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { requirePermission } from "@/lib/session";
import { formatMinutes, formatTimeRange } from "@/lib/datetime";
import { getCurrentSchoolYear } from "@/modules/core/school";
import {
  changeDeadlineOf,
  findStudentConflict,
  getStudentSubjectIds,
  registrationInclude,
  resolveSubjectTeachers,
  sessionInclude,
  toRegistrationItem,
  toSessionItem,
} from "@/modules/makeup/data";
import type { MyRegistrationItem } from "@/modules/makeup/types";

// Zápisy z pohledu studenta: zápis, úprava, odhlášení a přepis na jiný termín.
// Vše jen do uzávěrky termínu (nastavuje ji dozor, např. 30 min nebo 24 h před začátkem).

function revalidateMakeup() {
  revalidatePath("/makeup", "layout");
  revalidatePath("/dashboard");
}

const MAX_NOTE = 500;

function cleanNote(note?: string | null) {
  const n = note?.trim() || null;
  if (n && n.length > MAX_NOTE) throw new Error(`Poznámka může mít nejvýš ${MAX_NOTE} znaků.`);
  return n;
}

function assertBeforeDeadline(session: { startsAt: Date; changeDeadlineMinutes: number }, what: string) {
  if (new Date() > changeDeadlineOf(session)) {
    const limit = session.changeDeadlineMinutes > 0 ? `${formatMinutes(session.changeDeadlineMinutes)} před začátkem` : "do začátku";
    throw new Error(`${what} je možné nejpozději ${limit}.`);
  }
}

async function requireStudyingStudent() {
  const user = await requirePermission("makeup.register");
  const student = await prisma.user.findUnique({ where: { id: user.id }, select: { studyStatus: true } });
  if (student?.studyStatus !== "ACTIVE") throw new Error("Zapisovat se mohou jen studující studenti.");
  return user;
}

function assertSubjectsAllowed(subjectIds: string[], allowed: { subjectId: string }[]) {
  if (subjectIds.length === 0) throw new Error("Vyberte, který předmět chcete dopisovat.");
  const set = new Set(allowed.map((x) => x.subjectId));
  if (subjectIds.some((id) => !set.has(id))) throw new Error("Tento předmět se na termínu nedopisuje.");
}

/** Moje zápisy (nadcházející i proběhlé za posledních 120 dní) a předměty mé třídy. */
export async function getMyRegistrations(): Promise<{ registrations: MyRegistrationItem[]; mySubjectIds: string[] }> {
  const user = await requirePermission("makeup.register");
  const since = new Date(Date.now() - 120 * 24 * 3600_000);
  const [rows, mySubjectIds] = await Promise.all([
    prisma.makeupRegistration.findMany({
      where: { studentId: user.id, session: { endsAt: { gte: since } } },
      include: { ...registrationInclude, session: { include: sessionInclude } },
      orderBy: { session: { startsAt: "asc" } },
    }),
    getStudentSubjectIds(user.id),
  ]);
  const { startYear } = await getCurrentSchoolYear();
  return {
    registrations: rows.map((r) => ({
      ...toRegistrationItem(r, startYear),
      session: toSessionItem(r.session, user, r.id),
    })),
    mySubjectIds,
  };
}

/** Zápis na termín: vybrané předměty (z povolených na termínu) + volitelná poznámka. */
export async function registerForSession(sessionId: string, subjectIds: string[], note?: string) {
  return safeAction(async () => {
    const user = await requireStudyingStudent();
    const ids = [...new Set(subjectIds)];
    const cleanedNote = cleanNote(note);

    await prisma.$transaction(
      async (tx) => {
        const s = await tx.makeupSession.findUnique({
          where: { id: sessionId },
          include: { subjects: true, _count: { select: { registrations: true } } },
        });
        if (!s || s.cancelledAt) throw new Error("Termín neexistuje nebo byl zrušen.");
        assertBeforeDeadline(s, "Zápis");
        assertSubjectsAllowed(ids, s.subjects);
        if (await tx.makeupRegistration.findUnique({ where: { sessionId_studentId: { sessionId, studentId: user.id } } })) {
          throw new Error("Na tento termín už jste zapsaní.");
        }
        if (s._count.registrations >= s.capacity) throw new Error("Termín je plně obsazený.");
        const conflict = await findStudentConflict(tx, user.id, s.startsAt, s.endsAt);
        if (conflict) {
          throw new Error(`V tu dobu už máte jiný zápis (${formatTimeRange(conflict.session.startsAt, conflict.session.endsAt)}).`);
        }

        const teachers = await resolveSubjectTeachers(tx, user.id, ids);
        await tx.makeupRegistration.create({
          data: {
            sessionId,
            studentId: user.id,
            note: cleanedNote,
            createdById: user.id,
            subjects: {
              create: ids.map((subjectId) => ({ subjectId, subjectTeacherId: teachers.get(subjectId) ?? null })),
            },
          },
        });
      },
      // Souběžné zápisy na poslední volné místo
      { isolationLevel: "Serializable" }
    );
    revalidateMakeup();
  });
}

async function loadMyRegistration(user: User, registrationId: string) {
  const r = await prisma.makeupRegistration.findUnique({
    where: { id: registrationId },
    include: { session: { include: { subjects: true } }, subjects: true },
  });
  if (!r || r.studentId !== user.id) throw new Error("Zápis nenalezen.");
  return r;
}

/** Změna předmětů nebo poznámky u vlastního zápisu (do uzávěrky). */
export async function updateMyRegistration(registrationId: string, subjectIds: string[], note?: string) {
  return safeAction(async () => {
    const user = await requireStudyingStudent();
    const r = await loadMyRegistration(user, registrationId);
    if (r.session.cancelledAt) throw new Error("Termín byl zrušen.");
    assertBeforeDeadline(r.session, "Úprava zápisu");
    const ids = [...new Set(subjectIds)];
    assertSubjectsAllowed(ids, r.session.subjects);
    const cleanedNote = cleanNote(note);

    await prisma.$transaction(async (tx) => {
      const teachers = await resolveSubjectTeachers(tx, user.id, ids);
      await tx.makeupRegistrationSubject.deleteMany({ where: { registrationId: r.id } });
      await tx.makeupRegistrationSubject.createMany({
        data: ids.map((subjectId) => ({ registrationId: r.id, subjectId, subjectTeacherId: teachers.get(subjectId) ?? null })),
      });
      await tx.makeupRegistration.update({ where: { id: r.id }, data: { note: cleanedNote } });
    });
    revalidateMakeup();
  });
}

/** Odhlášení z termínu (do uzávěrky; ze zrušeného termínu kdykoliv). */
export async function cancelMyRegistration(registrationId: string) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.register");
    const r = await loadMyRegistration(user, registrationId);
    if (!r.session.cancelledAt) assertBeforeDeadline(r.session, "Odhlášení");
    await prisma.makeupRegistration.delete({ where: { id: r.id } });
    revalidateMakeup();
  });
}

/**
 * Přepis na jiný termín: uzávěrka platí pro původní (pokud nebyl zrušen) i cílový termín,
 * cílový musí mít volné místo a povolovat zvolené předměty.
 */
export async function moveMyRegistration(registrationId: string, targetSessionId: string) {
  return safeAction(async () => {
    const user = await requireStudyingStudent();
    const r = await loadMyRegistration(user, registrationId);
    if (r.sessionId === targetSessionId) return;
    if (!r.session.cancelledAt) assertBeforeDeadline(r.session, "Přepis z tohoto termínu");

    await prisma.$transaction(
      async (tx) => {
        const target = await tx.makeupSession.findUnique({
          where: { id: targetSessionId },
          include: { subjects: true, _count: { select: { registrations: true } } },
        });
        if (!target || target.cancelledAt) throw new Error("Cílový termín neexistuje nebo byl zrušen.");
        assertBeforeDeadline(target, "Zápis na cílový termín");
        assertSubjectsAllowed(r.subjects.map((x) => x.subjectId), target.subjects);
        if (await tx.makeupRegistration.findUnique({ where: { sessionId_studentId: { sessionId: target.id, studentId: user.id } } })) {
          throw new Error("Na cílový termín už jste zapsaní.");
        }
        if (target._count.registrations >= target.capacity) throw new Error("Cílový termín je plně obsazený.");
        const conflict = await findStudentConflict(tx, user.id, target.startsAt, target.endsAt, r.id);
        if (conflict) {
          throw new Error(`V tu dobu už máte jiný zápis (${formatTimeRange(conflict.session.startsAt, conflict.session.endsAt)}).`);
        }
        await tx.makeupRegistration.update({ where: { id: r.id }, data: { sessionId: target.id } });
      },
      { isolationLevel: "Serializable" }
    );
    revalidateMakeup();
  });
}
