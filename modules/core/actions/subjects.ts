"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { isModuleEnabled } from "@/lib/modules";
import { can } from "@/modules/registry";
import { sanitizeGrades, subjectInGrade } from "@/lib/school";
import { getCurrentSchoolYear, getStudentGrade } from "@/modules/core/school";
import { getSubjectWindows, type SubjectWindowRef } from "@/modules/seminars/subject-windows";

export type SubjectListItem = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  grades: number[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // „v zápisu“: zápisová okna, ve kterých je předmět nabízen
  windows: SubjectWindowRef[];
  // vyučující podle úvazků v aktuálním školním roce
  teachers: string[];
  // jen v seznamu pro učitele a admina (export katalogu sylabů) a v detailu
  syllabus?: string | null;
};

export type SubjectDetail = SubjectListItem & {
  createdByName: string | null;
  updatedByName: string | null;
};

export type SubjectInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  syllabus?: string | null;
  grades?: number[];
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

function revalidateSubjects() {
  revalidatePath("/", "layout");
}

async function seminarsOn() {
  return isModuleEnabled("seminars");
}

type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  syllabus: string | null;
  grades: number[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  teachingAssignments: { teacher: { firstName: string; lastName: string } }[];
  createdBy?: { firstName: string; lastName: string } | null;
  updatedBy?: { firstName: string; lastName: string } | null;
};

function toItem(s: SubjectRow, windows: SubjectWindowRef[]): SubjectListItem {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    description: s.description,
    grades: s.grades,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    windows,
    teachers: [...new Set(s.teachingAssignments.map((a) => fullName(a.teacher)))].sort((a, b) => a.localeCompare(b, "cs")),
  };
}

async function teachingInclude() {
  const { id } = await getCurrentSchoolYear();
  return {
    teachingAssignments: {
      where: { schoolYearId: id ?? "" },
      select: { teacher: { select: { firstName: true, lastName: true } } },
    },
  };
}

// === ČTENÍ ===

/**
 * Seznam předmětů. Učitel a admin vidí všechny (i archivované), student aktivní předměty
 * svého ročníku a předměty nabízené v jemu viditelném zápisu.
 */
export async function getSubjects(): Promise<SubjectListItem[]> {
  const user = await requirePermission("core.subjects.view");
  const privileged = can(user.role, "core.subjects.edit");
  const withWindows = await seminarsOn();

  const subjects = await prisma.subject.findMany({
    where: privileged ? {} : { isActive: true },
    orderBy: { name: "asc" },
    include: await teachingInclude(),
  });
  const windows = withWindows ? await getSubjectWindows(user) : new Map<string, SubjectWindowRef[]>();

  if (privileged) return subjects.map((s) => ({ ...toItem(s, windows.get(s.id) ?? []), syllabus: s.syllabus }));

  const grade = await getStudentGrade(user.id);
  return subjects
    .filter((s) => (grade != null && subjectInGrade(s.grades, grade)) || windows.has(s.id))
    .map((s) => toItem(s, windows.get(s.id) ?? []));
}

/** Předměty pro výběr (aktivní): zápisové okno, dopisování, … */
export async function getSubjectOptions(): Promise<{ id: string; name: string; code: string | null }[]> {
  await requirePermission("core.subjects.view");
  const subjects = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
  return subjects;
}

/** Detail předmětu, nebo null, když neexistuje / není pro uživatele viditelný. */
export async function getSubjectDetail(id: string): Promise<SubjectDetail | null> {
  const user = await requirePermission("core.subjects.view");
  const privileged = can(user.role, "core.subjects.edit");
  const s = await prisma.subject.findUnique({
    where: { id },
    include: {
      ...(await teachingInclude()),
      createdBy: { select: { firstName: true, lastName: true } },
      updatedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!s) return null;
  const windows = (await seminarsOn()) ? ((await getSubjectWindows(user, [id])).get(id) ?? []) : [];
  if (!privileged) {
    const grade = await getStudentGrade(user.id);
    const visible = s.isActive && ((grade != null && subjectInGrade(s.grades, grade)) || windows.length > 0);
    if (!visible) return null;
  }
  return {
    ...toItem(s, windows),
    syllabus: s.syllabus,
    createdByName: s.createdBy ? fullName(s.createdBy) : null,
    updatedByName: s.updatedBy ? fullName(s.updatedBy) : null,
  };
}

// === ZMĚNY ===

function cleanInput(data: SubjectInput) {
  const name = data.name?.trim();
  if (!name) throw new Error("Vyplňte název předmětu.");
  return {
    name,
    // zkratka je nepovinná, ale jedinečná
    code: data.code?.trim().toUpperCase() || null,
    description: data.description?.trim() || null,
    syllabus: data.syllabus?.trim() || null,
    grades: sanitizeGrades(data.grades),
  };
}

async function assertCodeFree(code: string | null, exceptId?: string) {
  if (!code) return;
  const exists = await prisma.subject.findUnique({ where: { code } });
  if (exists && exists.id !== exceptId) throw new Error(`Předmět se zkratkou ${code} už existuje.`);
}

export async function createSubject(data: SubjectInput) {
  return safeAction(async () => {
    const user = await requirePermission("core.subjects.edit");
    const clean = cleanInput(data);
    await assertCodeFree(clean.code);
    const res = await prisma.subject.create({ data: { ...clean, createdById: user.id }, select: { id: true } });
    revalidateSubjects();
    return res;
  });
}

export async function updateSubject(id: string, data: SubjectInput) {
  return safeAction(async () => {
    const user = await requirePermission("core.subjects.edit");
    const clean = cleanInput(data);
    await assertCodeFree(clean.code, id);
    const res = await prisma.subject.update({ where: { id }, data: { ...clean, updatedById: user.id }, select: { id: true } });
    revalidateSubjects();
    return res;
  });
}

export async function toggleSubjectActive(id: string) {
  return safeAction(async () => {
    await requirePermission("core.subjects.archive");
    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new Error("Předmět nenalezen.");
    await prisma.subject.update({ where: { id }, data: { isActive: !subject.isActive } });
    revalidateSubjects();
  });
}

/**
 * Trvale smaže předmět včetně výskytů v zápisových oknech, zápisů studentů, úvazků
 * a vazeb dopisování. Kaskáda je zajištěna na úrovni DB. Pouze ADMIN.
 */
export async function deleteSubjectPermanently(id: string) {
  return safeAction(async () => {
    await requirePermission("core.subjects.archive");
    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new Error("Předmět nenalezen.");
    await prisma.subject.delete({ where: { id } });
    revalidateSubjects();
  });
}
