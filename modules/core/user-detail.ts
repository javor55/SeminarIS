import { prisma } from "@/lib/prisma";
import { auditAreaLabel, auditUserWhere } from "@/lib/audit";
import { getEmailEvent } from "@/lib/email/events";
import { classLabel, schoolYearLabel, studyStatusLabel, type ClassChangeReasonValue, type StudyEndReasonValue, type StudyStatusValue } from "@/lib/school";

// Data detailu uživatele (`/users/[id]`). Bez kontroly oprávnění – volá ji stránka, která ji udělala.

export type UserDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "GUEST" | "STUDENT" | "TEACHER" | "ADMIN";
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  receiveOptionalEmails: boolean;
  classGroupId: string | null;
  classLabel: string | null;
  requestedClassLabel: string | null;
  studyStatus: StudyStatusValue;
  studyLabel: string | null;
  studyEndedAt: string | null;
  studyEndNote: string | null;
  studyEndReason: StudyEndReasonValue | null;
  // počet úvazků v aktuálním školním roce (pro dialog úvazků)
  assignmentCount: number;
  classHistory: { id: string; yearLabel: string; classLabel: string; grade: number; reason: ClassChangeReasonValue }[];
  assignments: { id: string; yearLabel: string; isCurrent: boolean; subjectId: string; subjectName: string; subjectCode: string | null; classLabel: string }[];
};

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      classGroup: true,
      requestedClassGroup: true,
      classMemberships: { include: { classGroup: true, schoolYear: true }, orderBy: { schoolYear: { startYear: "desc" } } },
      teachingAssignments: { include: { subject: true, classGroup: true, schoolYear: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    receiveOptionalEmails: u.receiveOptionalEmails,
    classGroupId: u.classGroupId,
    classLabel: u.classGroup ? classLabel(u.classGroup) : null,
    requestedClassLabel: u.requestedClassGroup ? classLabel(u.requestedClassGroup) : null,
    studyStatus: u.studyStatus,
    studyLabel: u.role === "STUDENT" ? studyStatusLabel(u.studyStatus, u.studyEndReason) : null,
    studyEndedAt: u.studyEndedAt?.toISOString() ?? null,
    studyEndNote: u.studyEndNote,
    studyEndReason: u.studyEndReason,
    assignmentCount: u.teachingAssignments.filter((a) => a.schoolYear.isCurrent).length,
    classHistory: u.classMemberships.map((m) => ({
      id: m.id,
      yearLabel: schoolYearLabel(m.schoolYear.startYear),
      classLabel: classLabel(m.classGroup),
      grade: m.grade,
      reason: m.reason,
    })),
    assignments: u.teachingAssignments
      .sort((a, b) => b.schoolYear.startYear - a.schoolYear.startYear || a.subject.name.localeCompare(b.subject.name, "cs") || a.classGroup.grade - b.classGroup.grade || a.classGroup.letter.localeCompare(b.classGroup.letter))
      .map((a) => ({
        id: a.id,
        yearLabel: schoolYearLabel(a.schoolYear.startYear),
        isCurrent: a.schoolYear.isCurrent,
        subjectId: a.subjectId,
        subjectName: a.subject.name,
        subjectCode: a.subject.code,
        classLabel: classLabel(a.classGroup),
      })),
  };
}

export const USER_DETAIL_LIST_LIMIT = 50;

export type UserAuditEntry = { id: string; createdAt: string; actorName: string | null; areaLabel: string; summary: string };

/** Posledních N záznamů historie změn týkajících se uživatele. */
export async function getUserAudit(userId: string): Promise<{ rows: UserAuditEntry[]; total: number }> {
  const where = auditUserWhere(userId);
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: USER_DETAIL_LIST_LIMIT }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), actorName: r.actorName, areaLabel: auditAreaLabel(r.action), summary: r.summary })),
  };
}

export type UserEmailEntry = { id: string; createdAt: string; event: string; eventLabel: string; subject: string; status: string; error: string | null };

/** Posledních N e-mailů, které aplikace uživateli poslala (nebo se je pokusila poslat). */
export async function getUserEmails(userId: string, email: string): Promise<{ rows: UserEmailEntry[]; total: number }> {
  const where = { OR: [{ recipientUserId: userId }, { recipient: { equals: email, mode: "insensitive" as const } }] };
  const [rows, total] = await Promise.all([
    prisma.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, take: USER_DETAIL_LIST_LIMIT }),
    prisma.emailLog.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      event: r.event,
      eventLabel: getEmailEvent(r.event)?.label ?? r.event,
      subject: r.subject,
      status: r.status,
      error: r.error,
    })),
  };
}
