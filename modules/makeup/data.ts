import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { classLabel } from "@/lib/school";
import { can } from "@/modules/registry";
import { getCurrentSchoolYear } from "@/modules/core/school";
import type { MakeupRegistrationItem, MakeupSessionItem } from "@/modules/makeup/types";

// Interní serverové funkce modulu Dopisování (bez "use server" – nevolatelné z klienta).

export const MAX_SERIES_SIZE = 60;
export const MAX_CAPACITY = 500;

export const sessionInclude = {
  teacher: { select: { id: true, firstName: true, lastName: true } },
  subjects: { include: { subject: true } },
  _count: { select: { registrations: true } },
} satisfies Prisma.MakeupSessionInclude;

type SessionRow = Prisma.MakeupSessionGetPayload<{ include: typeof sessionInclude }>;

export const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

export function changeDeadlineOf(s: { startsAt: Date; changeDeadlineMinutes: number }): Date {
  return new Date(s.startsAt.getTime() - s.changeDeadlineMinutes * 60_000);
}

export function canManageSession(user: User, session: { teacherId: string }): boolean {
  if (can(user.role, "makeup.sessions.manageAll")) return true;
  return can(user.role, "makeup.sessions.manage") && session.teacherId === user.id;
}

export function toSessionItem(s: SessionRow, user: User, myRegistrationId: string | null = null): MakeupSessionItem {
  return {
    id: s.id,
    teacherId: s.teacherId,
    teacherName: fullName(s.teacher),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    room: s.room,
    capacity: s.capacity,
    registeredCount: s._count.registrations,
    changeDeadlineMinutes: s.changeDeadlineMinutes,
    changeDeadline: changeDeadlineOf(s).toISOString(),
    note: s.note,
    seriesId: s.seriesId,
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    subjects: s.subjects
      .map((x) => ({ id: x.subject.id, name: x.subject.name, code: x.subject.code }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs")),
    canManage: canManageSession(user, s),
    myRegistrationId,
  };
}

export const registrationInclude = {
  student: { select: { firstName: true, lastName: true, classGroup: true } },
  subjects: {
    include: {
      subject: true,
      subjectTeacher: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.MakeupRegistrationInclude;

type RegistrationRow = Prisma.MakeupRegistrationGetPayload<{ include: typeof registrationInclude }>;

export function toRegistrationItem(r: RegistrationRow, currentStartYear: number): MakeupRegistrationItem {
  return {
    id: r.id,
    sessionId: r.sessionId,
    studentId: r.studentId,
    studentName: fullName(r.student),
    classLabel: r.student.classGroup ? classLabel(r.student.classGroup, currentStartYear) : null,
    note: r.note,
    attendance: r.attendance,
    subjects: r.subjects
      .map((x) => ({
        id: x.subject.id,
        name: x.subject.name,
        code: x.subject.code,
        subjectTeacherName: x.subjectTeacher ? fullName(x.subjectTeacher) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs")),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Podmínka: neodvolaný termín, který se časově překrývá s intervalem. */
export function overlappingWhere(startsAt: Date, endsAt: Date) {
  return { cancelledAt: null, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
}

/** Má student v daném čase jiný zápis? (kromě `exceptRegistrationId`) */
export async function findStudentConflict(
  db: TxClient,
  studentId: string,
  startsAt: Date,
  endsAt: Date,
  exceptRegistrationId?: string
) {
  return db.makeupRegistration.findFirst({
    where: {
      studentId,
      ...(exceptRegistrationId ? { id: { not: exceptRegistrationId } } : {}),
      session: overlappingWhere(startsAt, endsAt),
    },
    include: { session: true },
  });
}

/**
 * Vyučující, kterému student daný předmět dopisuje – z úvazků (předmět × třída
 * studenta × aktuální školní rok). Null, pokud úvazek není zadaný.
 */
export async function resolveSubjectTeachers(
  db: TxClient,
  studentId: string,
  subjectIds: string[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>(subjectIds.map((id) => [id, null]));
  const student = await db.user.findUnique({ where: { id: studentId }, select: { classGroupId: true } });
  const year = await getCurrentSchoolYear();
  if (!student?.classGroupId || !year.id) return result;
  const assignments = await db.teachingAssignment.findMany({
    where: { classGroupId: student.classGroupId, schoolYearId: year.id, subjectId: { in: subjectIds } },
    orderBy: { createdAt: "asc" },
  });
  for (const a of assignments) {
    if (!result.get(a.subjectId)) result.set(a.subjectId, a.teacherId);
  }
  return result;
}

/** Předměty, které student podle úvazků své třídy má (pro zvýraznění v nabídce). */
export async function getStudentSubjectIds(studentId: string): Promise<string[]> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { classGroupId: true } });
  const year = await getCurrentSchoolYear();
  if (!student?.classGroupId || !year.id) return [];
  const rows = await prisma.teachingAssignment.findMany({
    where: { classGroupId: student.classGroupId, schoolYearId: year.id },
    select: { subjectId: true },
    distinct: ["subjectId"],
  });
  return rows.map((r) => r.subjectId);
}
