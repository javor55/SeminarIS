import type { ClassChangeReason } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import {
  DEFAULT_STUDY_YEARS,
  entryYearForGrade,
  gradeOf,
  schoolYearStartForDate,
} from "@/lib/school";

// Serverové dotazy nad školní strukturou pro jádro i ostatní moduly.
// Bez autorizace – volající server action ji řeší sama.

/** Aktuální školní rok. Když žádný není označený, dopočítá se z data (id = null). */
export async function getCurrentSchoolYear(): Promise<{ id: string | null; startYear: number }> {
  const current = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (current) return { id: current.id, startYear: current.startYear };
  return { id: null, startYear: schoolYearStartForDate() };
}

/** Aktuální školní rok jako záznam v DB (založí ho, pokud ještě neexistuje). */
export async function ensureCurrentSchoolYear() {
  const current = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (current) return current;
  const startYear = schoolYearStartForDate();
  return prisma.schoolYear.upsert({
    where: { startYear },
    update: { isCurrent: true },
    create: { startYear, isCurrent: true },
  });
}

/** Ročník studenta v aktuálním školním roce, nebo null (bez třídy / mimo studium). */
export async function getStudentGrade(userId: string, currentStartYear?: number): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { classGroup: true, studyStatus: true },
  });
  if (!user?.classGroup || user.studyStatus !== "ACTIVE") return null;
  const startYear = currentStartYear ?? (await getCurrentSchoolYear()).startYear;
  const grade = gradeOf(user.classGroup, startYear);
  const studyYears = user.classGroup.studyYears ?? DEFAULT_STUDY_YEARS;
  return grade >= 1 && grade <= studyYears ? grade : null;
}

/** Podmínka pro `prisma.user.findMany`: aktivní (studující) studenti. */
export const activeStudentsWhere = {
  role: "STUDENT" as const,
  isActive: true,
  studyStatus: "ACTIVE" as const,
};

/** Podmínka pro `prisma.user.findMany`: studující studenti tříd v daných ročnících. */
export function studentsInGradesWhere(grades: readonly number[], currentStartYear: number) {
  return {
    ...activeStudentsWhere,
    classGroup: { entryYear: { in: grades.map((g) => entryYearForGrade(g, currentStartYear)) } },
  };
}

/**
 * Zařadí studenta do třídy (nebo ho z třídy vyřadí) v daném školním roce.
 * Jediné místo, které mění User.classGroupId – současně udržuje historii (ClassMembership).
 * Bez `reason`: první zařazení v roce = ASSIGNED, změna během roku = MOVED.
 */
export async function setStudentClass(
  db: TxClient,
  args: {
    userId: string;
    classGroupId: string | null;
    schoolYear: { id: string; startYear: number };
    reason?: ClassChangeReason;
  }
) {
  const { userId, classGroupId, schoolYear } = args;
  if (!classGroupId) {
    await db.classMembership.deleteMany({ where: { userId, schoolYearId: schoolYear.id } });
    await db.user.update({ where: { id: userId }, data: { classGroupId: null } });
    return;
  }

  const cls = await db.classGroup.findUnique({ where: { id: classGroupId } });
  if (!cls) throw new Error("Třída nenalezena.");
  const grade = gradeOf(cls, schoolYear.startYear);

  const existing = await db.classMembership.findUnique({
    where: { userId_schoolYearId: { userId, schoolYearId: schoolYear.id } },
  });
  if (existing?.classGroupId !== classGroupId || args.reason) {
    const reason = args.reason ?? (existing ? "MOVED" : "ASSIGNED");
    await db.classMembership.upsert({
      where: { userId_schoolYearId: { userId, schoolYearId: schoolYear.id } },
      update: { classGroupId, grade, reason },
      create: { userId, classGroupId, schoolYearId: schoolYear.id, grade, reason },
    });
  }
  await db.user.update({ where: { id: userId }, data: { classGroupId } });
}

/** Třída podle ročníku a písmene v aktuálním školním roce; založí ji, pokud neexistuje. */
export async function findOrCreateClass(grade: number, letter: string, currentStartYear: number) {
  const entryYear = entryYearForGrade(grade, currentStartYear);
  return prisma.classGroup.upsert({
    where: { entryYear_letter: { entryYear, letter } },
    update: {},
    create: { entryYear, letter, studyYears: DEFAULT_STUDY_YEARS },
  });
}
