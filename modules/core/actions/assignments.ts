"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { classLabel, compareClasses, schoolYearLabel, subjectInGrade, DEFAULT_STUDY_YEARS } from "@/lib/school";
import { ensureCurrentSchoolYear } from "@/modules/core/school";

// Úvazky: učitel × předmět × třída × školní rok. Upravují se z detailu předmětu a z Uživatelé → Úvazky,
// vždy pro aktuální školní rok. Čtení je dostupné všem, kdo vidí předměty.

const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

function revalidateAssignments() {
  revalidatePath("/", "layout");
}

export type SubjectTeaching = {
  yearLabel: string;
  // Ročníky, ve kterých se předmět vyučuje (prázdné `grades` = všechny)
  grades: number[];
  classes: { id: string; grade: number; letter: string; label: string }[];
  assignments: { id: string; teacherId: string; teacherName: string; classGroupId: string }[];
  // Učitelé k výběru; jen pro toho, kdo smí úvazky upravovat
  teachers: { id: string; name: string }[] | null;
};

async function listTeachers() {
  const teachers = await prisma.user.findMany({
    where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
  return teachers.map((t) => ({ id: t.id, name: fullName(t) }));
}

/** Mřížka tříd předmětu s učiteli pro aktuální školní rok (detail předmětu). */
export async function getSubjectTeaching(subjectId: string): Promise<SubjectTeaching> {
  const user = await requirePermission("core.subjects.view");
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { grades: true } });
  if (!subject) throw new Error("Předmět nenalezen.");
  const year = await ensureCurrentSchoolYear();
  const [classes, assignments] = await Promise.all([
    prisma.classGroup.findMany(),
    prisma.teachingAssignment.findMany({
      where: { subjectId, schoolYearId: year.id },
      include: { teacher: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const grades = subject.grades.length > 0 ? subject.grades : Array.from({ length: DEFAULT_STUDY_YEARS }, (_, i) => i + 1);
  return {
    yearLabel: schoolYearLabel(year.startYear),
    grades,
    classes: classes
      .filter((c) => grades.includes(c.grade))
      .sort(compareClasses)
      .map((c) => ({ id: c.id, grade: c.grade, letter: c.letter, label: classLabel(c) })),
    assignments: assignments
      .map((a) => ({ id: a.id, teacherId: a.teacherId, teacherName: fullName(a.teacher), classGroupId: a.classGroupId }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "cs")),
    teachers: can(user.role, "core.school.manage") ? await listTeachers() : null,
  };
}

export type TeacherAssignments = {
  yearLabel: string;
  subjects: { id: string; name: string; code: string | null; grades: number[] }[];
  classes: { id: string; grade: number; label: string }[];
  // Úvazky seskupené podle předmětu
  assignments: { id: string; subjectId: string; classGroupId: string; classLabel: string }[];
};

/** Úvazky učitele v aktuálním školním roce (dialog Uživatelé → Úvazky). */
export async function getTeacherAssignments(teacherId: string): Promise<TeacherAssignments> {
  await requirePermission("core.school.manage");
  const year = await ensureCurrentSchoolYear();
  const [subjects, classes, assignments] = await Promise.all([
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, grades: true } }),
    prisma.classGroup.findMany(),
    prisma.teachingAssignment.findMany({
      where: { teacherId, schoolYearId: year.id },
      include: { classGroup: true },
    }),
  ]);
  return {
    yearLabel: schoolYearLabel(year.startYear),
    subjects,
    classes: classes.sort(compareClasses).map((c) => ({ id: c.id, grade: c.grade, label: classLabel(c) })),
    assignments: assignments
      .sort((a, b) => compareClasses(a.classGroup, b.classGroup))
      .map((a) => ({ id: a.id, subjectId: a.subjectId, classGroupId: a.classGroupId, classLabel: classLabel(a.classGroup) })),
  };
}

async function assertTeacher(teacherId: string) {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { role: true } });
  if (!teacher || (teacher.role !== "TEACHER" && teacher.role !== "ADMIN")) {
    throw new Error("Vybraný uživatel není učitel.");
  }
}

/** Přidá úvazky učitele pro předmět ve vybraných třídách v aktuálním školním roce. */
export async function createTeachingAssignments(data: { teacherId: string; subjectId: string; classGroupIds: string[] }) {
  return safeAction(async () => {
    await requirePermission("core.school.manage");
    if (!data.teacherId || !data.subjectId || data.classGroupIds.length === 0) {
      throw new Error("Vyberte učitele, předmět a alespoň jednu třídu.");
    }
    await assertTeacher(data.teacherId);
    const [subject, classes] = await Promise.all([
      prisma.subject.findUnique({ where: { id: data.subjectId } }),
      prisma.classGroup.findMany({ where: { id: { in: data.classGroupIds } } }),
    ]);
    if (!subject) throw new Error("Předmět nenalezen.");
    if (classes.length !== new Set(data.classGroupIds).size) throw new Error("Třída nenalezena.");
    const bad = classes.find((c) => !subjectInGrade(subject.grades, c.grade));
    if (bad) throw new Error(`Předmět ${subject.name} se v ${bad.grade}. ročníku nevyučuje.`);

    const year = await ensureCurrentSchoolYear();
    const res = await prisma.teachingAssignment.createMany({
      data: classes.map((c) => ({
        teacherId: data.teacherId,
        subjectId: data.subjectId,
        classGroupId: c.id,
        schoolYearId: year.id,
      })),
      skipDuplicates: true,
    });
    revalidateAssignments();
    return res.count;
  });
}

/** Stejný učitel pro všechny třídy daného ročníku (detail předmětu, tlačítko u řádku). */
export async function assignTeacherToGrade(data: { teacherId: string; subjectId: string; grade: number }) {
  return safeAction(async () => {
    await requirePermission("core.school.manage");
    await assertTeacher(data.teacherId);
    const classes = await prisma.classGroup.findMany({ where: { grade: data.grade } });
    if (classes.length === 0) throw new Error(`V ${data.grade}. ročníku nejsou žádné třídy.`);
    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject) throw new Error("Předmět nenalezen.");
    if (!subjectInGrade(subject.grades, data.grade)) throw new Error(`Předmět ${subject.name} se v ${data.grade}. ročníku nevyučuje.`);
    const year = await ensureCurrentSchoolYear();
    const res = await prisma.teachingAssignment.createMany({
      data: classes.map((c) => ({
        teacherId: data.teacherId,
        subjectId: data.subjectId,
        classGroupId: c.id,
        schoolYearId: year.id,
      })),
      skipDuplicates: true,
    });
    revalidateAssignments();
    return res.count;
  });
}

export async function deleteTeachingAssignment(id: string) {
  return safeAction(async () => {
    await requirePermission("core.school.manage");
    await prisma.teachingAssignment.deleteMany({ where: { id } });
    revalidateAssignments();
  });
}
