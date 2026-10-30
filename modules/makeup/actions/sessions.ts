"use server";

import { safeAction } from "@/lib/safe-action";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { requirePermission } from "@/lib/session";
import { audit, describeChanges } from "@/lib/audit";
import { formatMinutes, formatTimeRange } from "@/lib/datetime";
import { classLabel } from "@/lib/school";
import { getSetting } from "@/lib/settings-registry";
import { can } from "@/modules/registry";
import { getCurrentSchoolYear } from "@/modules/core/school";
import {
  MAX_CAPACITY,
  MAX_SERIES_SIZE,
  canManageSession,
  findStudentConflict,
  fullName,
  overlappingWhere,
  registrationInclude,
  sessionInclude,
  toRegistrationItem,
  toSessionItem,
} from "@/modules/makeup/data";
import {
  notifyRegistrationMoved,
  notifyRegistrationRemoved,
  notifySessionChanged,
  notifySessionsCancelled,
} from "@/modules/makeup/notifications";
import {
  ATTENDANCE_LABELS,
  type MakeupAttendanceValue,
  type MakeupRegistrationItem,
  type MakeupSessionItem,
  type SessionInput,
} from "@/modules/makeup/types";

function revalidateMakeup() {
  revalidatePath("/makeup", "layout");
  revalidatePath("/dashboard");
}

// === ČTENÍ ===

/**
 * Nadcházející termíny (konec v budoucnosti). Zrušené termíny vidí jen ten, kdo je
 * spravuje, a student, který na ně byl zapsaný.
 */
export async function getUpcomingSessions(): Promise<MakeupSessionItem[]> {
  const user = await requirePermission("makeup.view");
  const sessions = await prisma.makeupSession.findMany({
    where: { endsAt: { gte: new Date() } },
    include: {
      ...sessionInclude,
      registrations: { where: { studentId: user.id }, select: { id: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  return sessions
    .map((s) => toSessionItem(s, user, s.registrations[0]?.id ?? null))
    .filter((s) => !s.cancelledAt || s.canManage || s.myRegistrationId);
}

/** Detail termínu se seznamem zapsaných – jen pro toho, kdo termín spravuje. */
export async function getSessionDetail(
  sessionId: string
): Promise<{ session: MakeupSessionItem; registrations: MakeupRegistrationItem[] } | null> {
  const user = await requirePermission("makeup.sessions.manage");
  const s = await prisma.makeupSession.findUnique({
    where: { id: sessionId },
    include: {
      ...sessionInclude,
      registrations: { include: registrationInclude },
    },
  });
  if (!s || !canManageSession(user, s)) return null;
  return {
    session: toSessionItem(s, user),
    registrations: s.registrations
      .map((r) => toRegistrationItem(r))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "cs")),
  };
}

/**
 * Podklady pro formulář termínu: aktivní předměty (s ročníky), předměty z úvazků dozorujících
 * učitelů (aktuální školní rok) a pro admina seznam učitelů.
 */
export async function getSessionFormOptions() {
  const user = await requirePermission("makeup.sessions.manage");
  const manageAll = can(user.role, "makeup.sessions.manageAll");
  const year = await getCurrentSchoolYear();
  const [subjects, teachers, assignments] = await Promise.all([
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    manageAll
      ? prisma.user.findMany({
          where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    year.id
      ? prisma.teachingAssignment.findMany({
          where: { schoolYearId: year.id, ...(manageAll ? {} : { teacherId: user.id }) },
          select: { teacherId: true, subjectId: true },
          distinct: ["teacherId", "subjectId"],
        })
      : Promise.resolve([]),
  ]);
  const teacherSubjects: Record<string, string[]> = {};
  for (const a of assignments) (teacherSubjects[a.teacherId] ??= []).push(a.subjectId);
  return {
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code, grades: s.grades })),
    // předměty z úvazků podle učitele (dozorujícího), pro zobrazení nahoře ve výběru
    teacherSubjects,
    teachers: teachers.map((t) => ({ id: t.id, name: fullName(t) })),
    canChooseTeacher: manageAll,
    currentUserId: user.id,
    // Výchozí hodnoty nového termínu (Administrace → Dopisování)
    defaults: {
      capacity: await getSetting<number>("makeup.defaultCapacity"),
      changeDeadlineMinutes: Number(await getSetting<string>("makeup.defaultChangeDeadlineMinutes")),
    },
  };
}

/** Kdo dopisuje písemky přihlášenému vyučujícímu (podle úvazků), nadcházející + posledních 60 dní. */
export async function getMySubjectRegistrations() {
  const user = await requirePermission("makeup.subjectTeacher");
  const since = new Date(Date.now() - 60 * 24 * 3600_000);
  const rows = await prisma.makeupRegistrationSubject.findMany({
    where: { subjectTeacherId: user.id, registration: { session: { endsAt: { gte: since } } } },
    include: {
      subject: true,
      registration: {
        include: {
          student: { include: { classGroup: true } },
          session: { include: { teacher: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });
  return rows
    .map((r) => ({
      registrationId: r.registrationId,
      studentName: fullName(r.registration.student),
      classLabel: r.registration.student.classGroup ? classLabel(r.registration.student.classGroup) : null,
      subjectName: r.subject.name,
      note: r.registration.note,
      attendance: r.registration.attendance as MakeupAttendanceValue,
      startsAt: r.registration.session.startsAt.toISOString(),
      endsAt: r.registration.session.endsAt.toISOString(),
      room: r.registration.session.room,
      supervisorName: fullName(r.registration.session.teacher),
      cancelled: !!r.registration.session.cancelledAt,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// === TERMÍNY ===

type CleanInput = Required<Omit<SessionInput, "teacherId" | "note">> & { teacherId: string; note: string | null };

async function validateInput(user: User, input: SessionInput): Promise<CleanInput> {
  const room = input.room?.trim();
  if (!room) throw new Error("Vyplňte učebnu.");
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new Error(`Kapacita musí být 1–${MAX_CAPACITY}.`);
  }
  const deadline = Number(input.changeDeadlineMinutes);
  if (!Number.isInteger(deadline) || deadline < 0 || deadline > 14 * 24 * 60) {
    throw new Error("Neplatná uzávěrka.");
  }
  const subjectIds = [...new Set(input.subjectIds ?? [])];
  if (subjectIds.length === 0) throw new Error("Vyberte alespoň jeden předmět.");
  const found = await prisma.subject.count({ where: { id: { in: subjectIds } } });
  if (found !== subjectIds.length) throw new Error("Neplatný předmět.");

  // Učitel vypisuje sobě; jinému jen admin
  let teacherId = user.id;
  if (input.teacherId && input.teacherId !== user.id) {
    if (!can(user.role, "makeup.sessions.manageAll")) throw new Error("Termín můžete vypsat jen sobě.");
    const t = await prisma.user.findUnique({ where: { id: input.teacherId }, select: { role: true } });
    if (!t || (t.role !== "TEACHER" && t.role !== "ADMIN")) throw new Error("Vybraný uživatel není učitel.");
    teacherId = input.teacherId;
  }
  return { room, capacity, changeDeadlineMinutes: deadline, subjectIds, teacherId, note: input.note?.trim() || null };
}

function parseInterval(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Neplatné datum nebo čas.");
  if (end <= start) throw new Error("Konec musí být po začátku.");
  if (end.getTime() - start.getTime() > 12 * 3600_000) throw new Error("Termín může trvat nejvýš 12 hodin.");
  return { start, end };
}

/** Učitel nesmí mít dva termíny současně a učebna nesmí být obsazená dvakrát. */
async function assertNoSessionConflict(teacherId: string, room: string, start: Date, end: Date, exceptId?: string) {
  const conflict = await prisma.makeupSession.findFirst({
    where: {
      ...overlappingWhere(start, end),
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [{ teacherId }, { room: { equals: room, mode: "insensitive" } }],
    },
  });
  if (conflict) {
    const what = conflict.teacherId === teacherId ? "Dozor má v tu dobu jiný termín" : `Učebna ${conflict.room} je v tu dobu obsazená`;
    throw new Error(`${what} (${formatTimeRange(conflict.startsAt, conflict.endsAt)}).`);
  }
}

/**
 * Vytvoří jeden termín, nebo opakovanou řadu (např. každé úterý do konce pololetí).
 * Časy výskytů počítá prohlížeč v místním čase, aby seděly i přes změnu letního času.
 */
export async function createSessions(input: SessionInput & { occurrences: { startsAt: string; endsAt: string }[] }) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const clean = await validateInput(user, input);
    if (!input.occurrences?.length) throw new Error("Zadejte datum a čas.");
    if (input.occurrences.length > MAX_SERIES_SIZE) throw new Error(`Řada může mít nejvýš ${MAX_SERIES_SIZE} termínů.`);

    const intervals = input.occurrences.map((o) => parseInterval(o.startsAt, o.endsAt));
    const now = new Date();
    if (intervals.some((i) => i.start <= now)) throw new Error("Termín musí být v budoucnosti.");
    for (const i of intervals) {
      await assertNoSessionConflict(clean.teacherId, clean.room, i.start, i.end);
    }

    const seriesId = intervals.length > 1 ? randomUUID() : null;
    await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const i of intervals) {
        const created = await tx.makeupSession.create({
          data: {
            teacherId: clean.teacherId,
            startsAt: i.start,
            endsAt: i.end,
            room: clean.room,
            capacity: clean.capacity,
            changeDeadlineMinutes: clean.changeDeadlineMinutes,
            note: clean.note,
            seriesId,
            createdById: user.id,
            subjects: { create: clean.subjectIds.map((subjectId) => ({ subjectId })) },
          },
          select: { id: true },
        });
        ids.push(created.id);
      }
      const [teacher, subjects] = await Promise.all([
        tx.user.findUnique({ where: { id: clean.teacherId }, select: { firstName: true, lastName: true } }),
        tx.subject.findMany({ where: { id: { in: clean.subjectIds } }, select: { name: true } }),
      ]);
      await audit(tx, user, {
        action: "makeup.session.create",
        entityType: "makeupSession",
        entityId: ids[0],
        summary:
          intervals.length === 1
            ? `Vypsán termín dopisování ${formatTimeRange(intervals[0].start, intervals[0].end)}, učebna ${clean.room}, dozor ${teacher ? fullName(teacher) : ""}`
            : `Vypsána řada ${intervals.length} termínů dopisování od ${formatTimeRange(intervals[0].start, intervals[0].end)}, učebna ${clean.room}, dozor ${teacher ? fullName(teacher) : ""}`,
        data: { sessionIds: ids, seriesId, room: clean.room, capacity: clean.capacity, subjects: subjects.map((x) => x.name), teacherId: clean.teacherId },
      });
    });
    revalidateMakeup();
    return intervals.length;
  });
}

async function loadManagedSession(user: User, sessionId: string) {
  const s = await prisma.makeupSession.findUnique({
    where: { id: sessionId },
    include: {
      teacher: { select: { firstName: true, lastName: true } },
      registrations: { include: { subjects: true, student: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!s || !canManageSession(user, s)) throw new Error("Termín nenalezen.");
  return s;
}

/**
 * Úprava termínu – i když jsou na něm zapsaní studenti. Kapacita nesmí klesnout pod
 * počet zapsaných a nelze odebrat předmět, který si některý student zvolil.
 */
export async function updateSession(
  sessionId: string,
  input: SessionInput & { startsAt: string; endsAt: string }
) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const s = await loadManagedSession(user, sessionId);
    if (s.cancelledAt) throw new Error("Zrušený termín nelze upravovat.");
    const clean = await validateInput(user, { ...input, teacherId: input.teacherId ?? s.teacherId });
    const { start, end } = parseInterval(input.startsAt, input.endsAt);

    if (clean.capacity < s.registrations.length) {
      throw new Error(`Na termínu je zapsáno ${s.registrations.length} studentů – kapacita nemůže být menší.`);
    }
    const removed = s.registrations.filter((r) => r.subjects.some((x) => !clean.subjectIds.includes(x.subjectId)));
    if (removed.length > 0) {
      throw new Error(
        `Předmět nelze odebrat – zvolili si ho: ${removed.map((r) => fullName(r.student)).join(", ")}. Nejdřív je přesuňte nebo odepište.`
      );
    }
    await assertNoSessionConflict(clean.teacherId, clean.room, start, end, s.id);

    const timeOrRoomChanged =
      start.getTime() !== s.startsAt.getTime() || end.getTime() !== s.endsAt.getTime() || clean.room !== s.room;
    await prisma.$transaction(async (tx) => {
      await tx.makeupSessionSubject.deleteMany({ where: { sessionId: s.id, subjectId: { notIn: clean.subjectIds } } });
      await tx.makeupSessionSubject.createMany({
        data: clean.subjectIds.map((subjectId) => ({ sessionId: s.id, subjectId })),
        skipDuplicates: true,
      });
      await tx.makeupSession.update({
        where: { id: s.id },
        data: {
          teacherId: clean.teacherId,
          startsAt: start,
          endsAt: end,
          room: clean.room,
          capacity: clean.capacity,
          changeDeadlineMinutes: clean.changeDeadlineMinutes,
          note: clean.note,
        },
      });
      const newTeacher =
        clean.teacherId === s.teacherId ? s.teacher : await tx.user.findUnique({ where: { id: clean.teacherId }, select: { firstName: true, lastName: true } });
      const oldSubjects = await tx.makeupSessionSubject.findMany({ where: { sessionId: s.id }, include: { subject: { select: { name: true } } } });
      const before = {
        termin: formatTimeRange(s.startsAt, s.endsAt),
        ucebna: s.room,
        dozor: fullName(s.teacher),
        kapacita: s.capacity,
        uzaverka: formatMinutes(s.changeDeadlineMinutes),
        poznamka: s.note,
      };
      const after = {
        termin: formatTimeRange(start, end),
        ucebna: clean.room,
        dozor: newTeacher ? fullName(newTeacher) : "",
        kapacita: clean.capacity,
        uzaverka: formatMinutes(clean.changeDeadlineMinutes),
        poznamka: clean.note,
      };
      const changes = describeChanges(before, after, {
        termin: "termín",
        ucebna: "učebna",
        dozor: "dozor",
        kapacita: "kapacita",
        uzaverka: "uzávěrka změn",
        poznamka: "poznámka",
      });
      await audit(tx, user, {
        action: "makeup.session.update",
        entityType: "makeupSession",
        entityId: s.id,
        summary: `Upraven termín dopisování ${before.termin}${changes ? `: ${changes}` : " (předměty)"}`,
        data: { before, after, subjects: oldSubjects.map((x) => x.subject.name) },
      });
    });
    // Změna času nebo učebny: dát vědět zapsaným studentům (po commitu)
    if (timeOrRoomChanged && s.registrations.length > 0) {
      await notifySessionChanged(s.id, { startsAt: s.startsAt, endsAt: s.endsAt, room: s.room });
    }
    revalidateMakeup();
  });
}

/**
 * Zruší termín (zapsaní studenti ho uvidí jako zrušený a mohou se přepsat jinam).
 * S `wholeSeries` zruší i všechny další budoucí termíny stejné řady.
 */
export async function cancelSession(sessionId: string, reason: string, wholeSeries = false) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const s = await loadManagedSession(user, sessionId);
    const where =
      wholeSeries && s.seriesId
        ? { seriesId: s.seriesId, startsAt: { gte: s.startsAt }, cancelledAt: null }
        : { id: s.id };
    const targets = await prisma.makeupSession.findMany({ where: { ...where, cancelledAt: null }, include: { teacher: { select: { firstName: true, lastName: true } }, _count: { select: { registrations: true } } } });
    const allowed = targets.filter((t) => canManageSession(user, t));
    const cancelReason = reason.trim() || null;
    const res = await prisma.$transaction(async (tx) => {
      const upd = await tx.makeupSession.updateMany({
        where: { id: { in: allowed.map((t) => t.id) } },
        data: { cancelledAt: new Date(), cancelReason },
      });
      if (allowed.length > 0) {
        const first = allowed[0];
        const registered = allowed.reduce((n, t) => n + t._count.registrations, 0);
        await audit(tx, user, {
          action: "makeup.session.cancel",
          entityType: "makeupSession",
          entityId: first.id,
          summary:
            allowed.length === 1
              ? `Zrušen termín dopisování ${formatTimeRange(first.startsAt, first.endsAt)} (dozor ${fullName(first.teacher)}, zapsáno ${registered})${cancelReason ? `, důvod: ${cancelReason}` : ""}`
              : `Zrušena řada ${allowed.length} termínů dopisování od ${formatTimeRange(first.startsAt, first.endsAt)} (dozor ${fullName(first.teacher)}, zapsáno ${registered})${cancelReason ? `, důvod: ${cancelReason}` : ""}`,
          data: { sessionIds: allowed.map((t) => t.id), reason: cancelReason },
        });
      }
      return upd;
    });
    // Zapsaným studentům dát vědět (po commitu)
    await notifySessionsCancelled(allowed.map((t) => t.id), cancelReason);
    revalidateMakeup();
    return res.count;
  });
}

/** Smazání termínu – jen pokud na něm nikdo není zapsaný (jinak zrušení). */
export async function deleteSession(sessionId: string) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const s = await loadManagedSession(user, sessionId);
    if (s.registrations.length > 0) throw new Error("Na termínu jsou zapsaní studenti – termín místo smazání zrušte.");
    await prisma.$transaction(async (tx) => {
      await tx.makeupSession.delete({ where: { id: s.id } });
      await audit(tx, user, {
        action: "makeup.session.delete",
        entityType: "makeupSession",
        entityId: s.id,
        summary: `Smazán termín dopisování ${formatTimeRange(s.startsAt, s.endsAt)}, učebna ${s.room} (dozor ${fullName(s.teacher)})`,
        data: { startsAt: s.startsAt, endsAt: s.endsAt, room: s.room },
      });
    });
    revalidateMakeup();
  });
}

// === ZÁPISY Z POHLEDU DOZORU ===

async function loadManagedRegistration(user: User, registrationId: string) {
  const r = await prisma.makeupRegistration.findUnique({
    where: { id: registrationId },
    include: {
      session: { include: { teacher: { select: { firstName: true, lastName: true } } } },
      subjects: { include: { subject: { select: { name: true } } } },
      student: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!r || !canManageSession(user, r.session)) throw new Error("Zápis nenalezen.");
  return r;
}

/** Dozor odepíše studenta z termínu (kdykoliv). */
export async function removeRegistration(registrationId: string) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const r = await loadManagedRegistration(user, registrationId);
    const subjectNames = r.subjects.map((x) => x.subject.name);
    await prisma.$transaction(async (tx) => {
      await tx.makeupRegistration.delete({ where: { id: r.id } });
      await audit(tx, user, {
        action: "makeup.registration.remove",
        entityType: "makeupRegistration",
        entityId: r.id,
        summary: `${fullName(user)} odepsal(a) studenta ${fullName(r.student)} z termínu dopisování ${formatTimeRange(r.session.startsAt, r.session.endsAt)} (${subjectNames.join(", ")})`,
        data: { studentId: r.studentId, sessionId: r.sessionId, subjects: subjectNames, attendance: r.attendance },
      });
    });
    await notifyRegistrationRemoved({ student: r.student, session: r.session, subjectNames }, user);
    revalidateMakeup();
  });
}

/**
 * Dozor přesune studenta na jiný termín (i cizí – kapacita a předměty cílového termínu
 * musí sedět; uzávěrka cílového termínu se u učitele nekontroluje).
 */
export async function moveRegistration(registrationId: string, targetSessionId: string) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const r = await loadManagedRegistration(user, registrationId);
    if (r.sessionId === targetSessionId) return;
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.makeupSession.findUnique({
          where: { id: targetSessionId },
          include: { subjects: true, _count: { select: { registrations: true } } },
        });
        if (!target || target.cancelledAt) throw new Error("Cílový termín neexistuje nebo je zrušený.");
        if (target.startsAt <= new Date()) throw new Error("Cílový termín už začal.");
        if (target._count.registrations >= target.capacity) throw new Error("Cílový termín je plný.");
        const allowed = new Set(target.subjects.map((x) => x.subjectId));
        if (r.subjects.some((x) => !allowed.has(x.subjectId))) {
          throw new Error("Na cílovém termínu nelze dopisovat všechny předměty, které si student zvolil.");
        }
        if (await tx.makeupRegistration.findUnique({ where: { sessionId_studentId: { sessionId: target.id, studentId: r.studentId } } })) {
          throw new Error("Student už je na cílovém termínu zapsaný.");
        }
        const conflict = await findStudentConflict(tx, r.studentId, target.startsAt, target.endsAt, r.id);
        if (conflict) throw new Error(`Student má v tu dobu jiný zápis (${formatTimeRange(conflict.session.startsAt, conflict.session.endsAt)}).`);
        await tx.makeupRegistration.update({
          where: { id: r.id },
          data: { sessionId: target.id, attendance: "REGISTERED" },
        });
        await audit(tx, user, {
          action: "makeup.registration.move",
          entityType: "makeupRegistration",
          entityId: r.id,
          summary: `${fullName(user)} přesunul(a) studenta ${fullName(r.student)} z termínu ${formatTimeRange(r.session.startsAt, r.session.endsAt)} na termín ${formatTimeRange(target.startsAt, target.endsAt)}`,
          data: { studentId: r.studentId, fromSessionId: r.sessionId, toSessionId: target.id },
        });
      },
      { isolationLevel: "Serializable" }
    );
    await notifyRegistrationMoved(r.id, r.session, user);
    revalidateMakeup();
  });
}

/** Docházka po začátku termínu: dopsal(a) / nedostavil(a) se. */
export async function setAttendance(registrationId: string, attendance: MakeupAttendanceValue) {
  return safeAction(async () => {
    const user = await requirePermission("makeup.sessions.manage");
    const r = await loadManagedRegistration(user, registrationId);
    if (!["REGISTERED", "ATTENDED", "NO_SHOW"].includes(attendance)) throw new Error("Neplatný stav.");
    if (r.session.startsAt > new Date()) throw new Error("Docházku lze zapsat až po začátku termínu.");
    await prisma.$transaction(async (tx) => {
      await tx.makeupRegistration.update({ where: { id: r.id }, data: { attendance } });
      await audit(tx, user, {
        action: "makeup.attendance.set",
        entityType: "makeupRegistration",
        entityId: r.id,
        summary: `Docházka studenta ${fullName(r.student)} na termínu ${formatTimeRange(r.session.startsAt, r.session.endsAt)}: ${ATTENDANCE_LABELS[r.attendance as MakeupAttendanceValue]} → ${ATTENDANCE_LABELS[attendance]}`,
        data: { studentId: r.studentId, before: r.attendance, after: attendance },
      });
    });
    revalidateMakeup();
  });
}
