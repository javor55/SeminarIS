import type { ClassChangeReason } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { DEFAULT_STUDY_YEARS, classLabel, compareClasses, schoolYearLabel, schoolYearStartForDate } from "@/lib/school";

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

export type SchoolYearInfo = {
  currentYear: { startYear: number; label: string };
  // Rok lze nastavit ručně jen před prvním zařazením studentů (pak jen uzavřením roku)
  canSetYearManually: boolean;
  years: { startYear: number; label: string; isCurrent: boolean }[];
};

/** Aktuální školní rok pro administraci, včetně nabídky sousedních let pro počáteční nastavení. */
export async function getSchoolYearInfo(): Promise<SchoolYearInfo> {
  const current = await ensureCurrentSchoolYear();
  const [years, membershipCount] = await Promise.all([
    prisma.schoolYear.findMany({ orderBy: { startYear: "desc" } }),
    prisma.classMembership.count(),
  ]);
  // Nabídka sousedních školních let pro přepnutí, i když ještě nejsou v DB
  const yearSet = new Map(years.map((y) => [y.startYear, y.isCurrent]));
  for (const y of [current.startYear - 1, current.startYear, current.startYear + 1]) {
    if (!yearSet.has(y)) yearSet.set(y, false);
  }
  return {
    currentYear: { startYear: current.startYear, label: schoolYearLabel(current.startYear) },
    canSetYearManually: membershipCount === 0,
    years: [...yearSet.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, isCurrent]) => ({ startYear: y, label: schoolYearLabel(y), isCurrent })),
  };
}

/** Ročník studenta v aktuálním školním roce, nebo null (bez třídy / mimo studium). */
export async function getStudentGrade(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { classGroup: true, studyStatus: true },
  });
  if (!user?.classGroup || user.studyStatus !== "ACTIVE") return null;
  return user.classGroup.grade;
}

/** Podmínka pro `prisma.user.findMany`: aktivní (studující) studenti. */
export const activeStudentsWhere = {
  role: "STUDENT" as const,
  isActive: true,
  studyStatus: "ACTIVE" as const,
};

/** Podmínka pro `prisma.user.findMany`: studující studenti tříd v daných ročnících. */
export function studentsInGradesWhere(grades: readonly number[]) {
  return {
    ...activeStudentsWhere,
    classGroup: { grade: { in: [...grades] } },
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
    schoolYear: { id: string };
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
  const grade = cls.grade;

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

/** Třída podle ročníku a písmene; založí ji, pokud neexistuje. */
export async function findOrCreateClass(grade: number, letter: string, db: TxClient = prisma) {
  if (!Number.isInteger(grade) || grade < 1 || grade > DEFAULT_STUDY_YEARS) {
    throw new Error(`Ročník musí být 1–${DEFAULT_STUDY_YEARS}.`);
  }
  return db.classGroup.upsert({
    where: { grade_letter: { grade, letter } },
    update: {},
    create: { grade, letter },
  });
}

/** Třídy nabízené při registraci a ve výzvě na dashboardu (bez autorizace – jen ročník a písmeno). */
export async function getPublicClassOptions(): Promise<{ id: string; label: string; grade: number; letter: string }[]> {
  const classes = await prisma.classGroup.findMany();
  return classes.sort(compareClasses).map((c) => ({ id: c.id, label: classLabel(c), grade: c.grade, letter: c.letter }));
}
