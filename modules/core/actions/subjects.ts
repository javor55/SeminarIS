"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { audit, describeChanges } from "@/lib/audit";
import { can } from "@/modules/registry";
import { sanitizeGrades, subjectGradesLabel, subjectInGrade } from "@/lib/school";
import { getCurrentSchoolYear, getStudentGrade } from "@/modules/core/school";
import { collectSubjectBadges, collectSubjectUsage } from "@/modules/core/extensions";
import type { SubjectBadge, SubjectUsageItem } from "@/modules/types";

export type SubjectListItem = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  grades: number[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // štítky z modulů (např. „v zápisu“), viz getSubjectBadges
  badges: SubjectBadge[];
  // vyučující podle úvazků v aktuálním školním roce
  teachers: string[];
  // jen v seznamu pro učitele a admina (export katalogu sylabů) a v detailu
  syllabus?: string | null;
};

export type SubjectDetail = SubjectListItem & {
  createdByName: string | null;
  updatedByName: string | null;
  // kde se předmět používá v modulech; jen pro toho, kdo ho smí archivovat/mazat
  usage: SubjectUsageItem[];
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

/** Předmět nabízený modulem v jemu viditelném místě je viditelný i studentovi mimo jeho ročník. */
const grantsAccess = (badges: SubjectBadge[] | undefined) => !!badges?.some((b) => b.grantsAccess);

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

function toItem(s: SubjectRow, badges: SubjectBadge[]): SubjectListItem {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    description: s.description,
    grades: s.grades,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    badges,
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

/** Použití předmětu: úvazky v jádru + všechny moduly (i vypnuté, viz collectSubjectUsage). */
async function getFullUsage(subjectId: string): Promise<SubjectUsageItem[]> {
  const assignments = await prisma.teachingAssignment.count({ where: { subjectId } });
  const core: SubjectUsageItem[] = [{ id: "core.assignments", label: "Úvazky vyučujících", count: assignments, href: `/subjects/${subjectId}?tab=teaching` }];
  return [...core.filter((u) => u.count > 0), ...(await collectSubjectUsage(subjectId))];
}

const usageText = (usage: SubjectUsageItem[]) => usage.map((u) => `${u.label}: ${u.count}`).join("; ");

// === ČTENÍ ===

/**
 * Seznam předmětů. Učitel a admin vidí všechny (i archivované), student aktivní předměty
 * svého ročníku a předměty nabízené v jemu viditelném zápisu.
 */
export async function getSubjects(): Promise<SubjectListItem[]> {
  const user = await requirePermission("core.subjects.view");
  const privileged = can(user.role, "core.subjects.edit");

  const subjects = await prisma.subject.findMany({
    where: privileged ? {} : { isActive: true },
    orderBy: { name: "asc" },
    include: await teachingInclude(),
  });
  const badges = await collectSubjectBadges(subjects.map((s) => s.id), user);

  if (privileged) return subjects.map((s) => ({ ...toItem(s, badges.get(s.id) ?? []), syllabus: s.syllabus }));

  const grade = await getStudentGrade(user.id);
  return subjects
    .filter((s) => (grade != null && subjectInGrade(s.grades, grade)) || grantsAccess(badges.get(s.id)))
    .map((s) => toItem(s, badges.get(s.id) ?? []));
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
  const badges = (await collectSubjectBadges([id], user)).get(id) ?? [];
  if (!privileged) {
    const grade = await getStudentGrade(user.id);
    const visible = s.isActive && ((grade != null && subjectInGrade(s.grades, grade)) || grantsAccess(badges));
    if (!visible) return null;
  }
  return {
    ...toItem(s, badges),
    syllabus: s.syllabus,
    usage: can(user.role, "core.subjects.archive") ? await getFullUsage(id) : [],
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
    const res = await prisma.$transaction(async (tx) => {
      const created = await tx.subject.create({ data: { ...clean, createdById: user.id }, select: { id: true } });
      await audit(tx, user, {
        action: "subjects.subject.create",
        entityType: "subject",
        entityId: created.id,
        summary: `Vytvořen předmět „${clean.name}“${clean.code ? ` (${clean.code})` : ""}, ročníky: ${subjectGradesLabel(clean.grades)}`,
        data: { name: clean.name, code: clean.code, grades: clean.grades },
      });
      return created;
    });
    revalidateSubjects();
    return res;
  });
}

export async function updateSubject(id: string, data: SubjectInput) {
  return safeAction(async () => {
    const user = await requirePermission("core.subjects.edit");
    const clean = cleanInput(data);
    await assertCodeFree(clean.code, id);
    const res = await prisma.$transaction(async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw new Error("Předmět nenalezen.");
      const updated = await tx.subject.update({ where: { id }, data: { ...clean, updatedById: user.id }, select: { id: true } });
      const changes = describeChanges(
        { name: before.name, code: before.code, grades: subjectGradesLabel(before.grades), description: before.description, syllabus: before.syllabus },
        { name: clean.name, code: clean.code, grades: subjectGradesLabel(clean.grades), description: clean.description, syllabus: clean.syllabus },
        { name: "název", code: "zkratka", grades: "ročníky", description: "popis", syllabus: "sylabus" },
        (v) => (v == null || v === "" ? "—" : String(v).length > 60 ? "upraveno" : String(v))
      );
      await audit(tx, user, {
        action: "subjects.subject.update",
        entityType: "subject",
        entityId: id,
        summary: `Upraven předmět „${before.name}“${changes ? `: ${changes}` : " (beze změny)"}`,
        data: { before: { name: before.name, code: before.code, grades: before.grades }, after: { name: clean.name, code: clean.code, grades: clean.grades } },
      });
      return updated;
    });
    revalidateSubjects();
    return res;
  });
}

export async function toggleSubjectActive(id: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.subjects.archive");
    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new Error("Předmět nenalezen.");
    await prisma.$transaction(async (tx) => {
      await tx.subject.update({ where: { id }, data: { isActive: !subject.isActive } });
      await audit(tx, admin, {
        action: "subjects.subject.archive",
        entityType: "subject",
        entityId: id,
        summary: `${subject.isActive ? "Archivován" : "Obnoven"} předmět „${subject.name}“`,
        data: { before: subject.isActive, after: !subject.isActive },
      });
    });
    revalidateSubjects();
  });
}

/**
 * Trvale smaže předmět, který se nikde nepoužívá (žádné úvazky ani data modulů – zápisová okna,
 * dopisování …). Použitý předmět nejde smazat ani vynuceně, nabídne se archivace. Pouze ADMIN.
 */
export async function deleteSubjectPermanently(id: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.subjects.archive");
    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new Error("Předmět nenalezen.");
    const usage = await getFullUsage(id);
    if (usage.length > 0) {
      throw new Error(`Předmět se používá, nelze ho smazat (${usageText(usage)}). Archivujte ho, nebo nejdřív použití odstraňte.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.subject.delete({ where: { id } });
      await audit(tx, admin, {
        action: "subjects.subject.delete",
        entityType: "subject",
        entityId: id,
        summary: `Trvale smazán nepoužitý předmět „${subject.name}“`,
        data: { name: subject.name, code: subject.code },
      });
    });
    revalidateSubjects();
  });
}
