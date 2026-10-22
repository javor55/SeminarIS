"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import {
  DEFAULT_STUDY_YEARS,
  classLabel,
  classStatus,
  gradeOf,
  schoolYearLabel,
  type ClassStatus,
} from "@/lib/school";
import { ensureCurrentSchoolYear, findOrCreateClass, getCurrentSchoolYear } from "@/modules/core/school";

export type ClassOption = {
  id: string;
  label: string;
  status: ClassStatus;
};

export type SchoolOverview = {
  currentYear: { startYear: number; label: string };
  years: { startYear: number; label: string; isCurrent: boolean }[];
  classes: (ClassOption & { letter: string; entryYear: number; grade: number; studentCount: number })[];
  subjects: { id: string; name: string; code: string; isActive: boolean; assignmentCount: number }[];
  teachers: { id: string; name: string }[];
  assignments: { id: string; teacherId: string; teacherName: string; subjectId: string; subjectName: string; classGroupId: string; classLabel: string }[];
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

function revalidateSchool() {
  revalidatePath("/school");
  revalidatePath("/users");
}

// === PŘEHLED ===

export async function getSchoolOverview(): Promise<SchoolOverview> {
  await requirePermission("core.school.manage");
  const current = await ensureCurrentSchoolYear();
  const startYear = current.startYear;

  const [years, classes, subjects, teachers, assignments] = await Promise.all([
    prisma.schoolYear.findMany({ orderBy: { startYear: "desc" } }),
    prisma.classGroup.findMany({
      orderBy: [{ entryYear: "desc" }, { letter: "asc" }],
      include: { _count: { select: { students: true } } },
    }),
    prisma.subject.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { teachingAssignments: { where: { schoolYearId: current.id } } } } },
    }),
    prisma.user.findMany({
      where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolYearId: current.id },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        subject: { select: { name: true } },
        classGroup: true,
      },
    }),
  ]);

  // Nabídka sousedních školních let pro přepnutí, i když ještě nejsou v DB
  const yearSet = new Map(years.map((y) => [y.startYear, y.isCurrent]));
  for (const y of [startYear - 1, startYear, startYear + 1]) {
    if (!yearSet.has(y)) yearSet.set(y, false);
  }

  return {
    currentYear: { startYear, label: schoolYearLabel(startYear) },
    years: [...yearSet.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, isCurrent]) => ({ startYear: y, label: schoolYearLabel(y), isCurrent })),
    classes: classes.map((c) => ({
      id: c.id,
      letter: c.letter,
      entryYear: c.entryYear,
      grade: gradeOf(c, startYear),
      label: classLabel(c, startYear),
      status: classStatus(c, startYear),
      studentCount: c._count.students,
    })),
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      isActive: s.isActive,
      assignmentCount: s._count.teachingAssignments,
    })),
    teachers: teachers.map((t) => ({ id: t.id, name: fullName(t) })),
    assignments: assignments
      .map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: fullName(a.teacher),
        subjectId: a.subjectId,
        subjectName: a.subject.name,
        classGroupId: a.classGroupId,
        classLabel: classLabel(a.classGroup, startYear),
      }))
      .sort((a, b) =>
        a.teacherName.localeCompare(b.teacherName, "cs") ||
        a.subjectName.localeCompare(b.subjectName, "cs") ||
        a.classLabel.localeCompare(b.classLabel, "cs")
      ),
  };
}

/** Třídy pro výběr u uživatele (aktuální a budoucí; absolventi jen pokud už tam uživatel je). */
export async function getClassOptions(): Promise<ClassOption[]> {
  await requirePermission("core.users.manage");
  const { startYear } = await getCurrentSchoolYear();
  const classes = await prisma.classGroup.findMany({ orderBy: [{ entryYear: "desc" }, { letter: "asc" }] });
  return classes.map((c) => ({ id: c.id, label: classLabel(c, startYear), status: classStatus(c, startYear) }));
}

// === ŠKOLNÍ ROK ===

/**
 * Přepne aktuální školní rok. Ročníky tříd se tím posunou samy
 * (počítají se z roku nástupu), třídy po posledním ročníku se stanou absolventy.
 */
export async function setCurrentSchoolYear(startYear: number) {
  await requirePermission("core.school.manage");
  if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
    throw new Error("Neplatný školní rok.");
  }
  await prisma.$transaction([
    prisma.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
    prisma.schoolYear.upsert({
      where: { startYear },
      update: { isCurrent: true },
      create: { startYear, isCurrent: true },
    }),
  ]);
  revalidatePath("/", "layout");
}

// === TŘÍDY ===

function parseLetters(letters: string): string[] {
  const list = letters
    .split(/[\s,;]+/)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0 || list.some((l) => !/^[A-Z]$/.test(l))) {
    throw new Error("Zadejte písmena tříd, např. „A, B, C“.");
  }
  return [...new Set(list)];
}

/** Založí třídy daného ročníku v aktuálním školním roce, např. 1. ročník „A, B, C“. */
export async function createClasses(grade: number, letters: string) {
  await requirePermission("core.school.manage");
  if (!Number.isInteger(grade) || grade < 1 || grade > DEFAULT_STUDY_YEARS) {
    throw new Error(`Ročník musí být 1–${DEFAULT_STUDY_YEARS}.`);
  }
  const { startYear } = await ensureCurrentSchoolYear();
  const list = parseLetters(letters);
  for (const letter of list) {
    await findOrCreateClass(grade, letter, startYear);
  }
  revalidateSchool();
  return list.length;
}

/** Smaže třídu. Studenti zůstanou, jen nebudou zařazeni; úvazky třídy se smažou. */
export async function deleteClass(classGroupId: string) {
  await requirePermission("core.school.manage");
  await prisma.classGroup.delete({ where: { id: classGroupId } });
  revalidateSchool();
}

// === ŠKOLNÍ PŘEDMĚTY ===

function cleanSubjectInput(data: { name: string; code: string }) {
  const name = data.name.trim();
  const code = data.code.trim().toUpperCase();
  if (!name || !code) throw new Error("Vyplňte název i zkratku předmětu.");
  return { name, code };
}

export async function createSchoolSubject(data: { name: string; code: string }) {
  await requirePermission("core.school.manage");
  const clean = cleanSubjectInput(data);
  const exists = await prisma.subject.findUnique({ where: { code: clean.code } });
  if (exists) throw new Error(`Předmět se zkratkou ${clean.code} už existuje.`);
  await prisma.subject.create({ data: clean });
  revalidateSchool();
}

export async function updateSchoolSubject(id: string, data: { name: string; code: string }) {
  await requirePermission("core.school.manage");
  const clean = cleanSubjectInput(data);
  const exists = await prisma.subject.findUnique({ where: { code: clean.code } });
  if (exists && exists.id !== id) throw new Error(`Předmět se zkratkou ${clean.code} už existuje.`);
  await prisma.subject.update({ where: { id }, data: clean });
  revalidateSchool();
}

export async function toggleSchoolSubjectActive(id: string) {
  await requirePermission("core.school.manage");
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) throw new Error("Předmět nenalezen.");
  await prisma.subject.update({ where: { id }, data: { isActive: !subject.isActive } });
  revalidateSchool();
}

export async function deleteSchoolSubject(id: string) {
  await requirePermission("core.school.manage");
  await prisma.subject.delete({ where: { id } });
  revalidateSchool();
}

// === ÚVAZKY (kdo co učí) ===

/** Přidá úvazky učitele pro předmět ve vybraných třídách v aktuálním školním roce. */
export async function createTeachingAssignments(data: { teacherId: string; subjectId: string; classGroupIds: string[] }) {
  await requirePermission("core.school.manage");
  if (!data.teacherId || !data.subjectId || data.classGroupIds.length === 0) {
    throw new Error("Vyberte učitele, předmět a alespoň jednu třídu.");
  }
  const teacher = await prisma.user.findUnique({ where: { id: data.teacherId }, select: { role: true } });
  if (!teacher || (teacher.role !== "TEACHER" && teacher.role !== "ADMIN")) {
    throw new Error("Vybraný uživatel není učitel.");
  }
  const year = await ensureCurrentSchoolYear();
  const res = await prisma.teachingAssignment.createMany({
    data: data.classGroupIds.map((classGroupId) => ({
      teacherId: data.teacherId,
      subjectId: data.subjectId,
      classGroupId,
      schoolYearId: year.id,
    })),
    skipDuplicates: true,
  });
  revalidateSchool();
  return res.count;
}

export async function deleteTeachingAssignment(id: string) {
  await requirePermission("core.school.manage");
  await prisma.teachingAssignment.delete({ where: { id } });
  revalidateSchool();
}
