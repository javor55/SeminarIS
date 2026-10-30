"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { DEFAULT_STUDY_YEARS, classLabel, compareClasses, parseLetters, sanitizeGrades, studyStatusLabel } from "@/lib/school";

export type ClassOption = {
  id: string;
  label: string;
  grade: number;
  letter: string;
};

export type ClassOverview = ClassOption & {
  // studující studenti (ne absolventi a ukončení)
  studentCount: number;
};

/** Student zařazený do třídy (rozkliknutí třídy v administraci). */
export type ClassStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  classGroupId: string;
  // „absolvent“, „ukončil studium“…; null = studuje
  studyLabel: string | null;
};

function revalidateClasses() {
  revalidatePath("/users");
  revalidatePath("/admin/school-year");
  revalidatePath("/", "layout");
}

/** Třídy pro výběr (úprava uživatele, přesun, schválení, průvodce). */
export async function getClassOptions(): Promise<ClassOption[]> {
  await requirePermission("core.users.manage");
  const classes = await prisma.classGroup.findMany();
  return classes.sort(compareClasses).map((c) => ({ id: c.id, label: classLabel(c), grade: c.grade, letter: c.letter }));
}

/** Přehled tříd s počty studujících (záložka Třídy). */
export async function getClassesOverview(): Promise<ClassOverview[]> {
  await requirePermission("core.users.view");
  const classes = await prisma.classGroup.findMany({
    include: { _count: { select: { students: { where: { role: "STUDENT", studyStatus: "ACTIVE" } } } } },
  });
  return classes
    .sort(compareClasses)
    .map((c) => ({ id: c.id, label: classLabel(c), grade: c.grade, letter: c.letter, studentCount: c._count.students }));
}

/** Studenti zařazení do tříd (včetně absolventů, kteří si třídu ponechali), seřazení podle jména. */
export async function getClassStudents(): Promise<ClassStudent[]> {
  await requirePermission("core.users.view");
  const users = await prisma.user.findMany({
    where: { role: "STUDENT", classGroupId: { not: null } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true, classGroupId: true, studyStatus: true, studyEndReason: true },
  });
  return users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    classGroupId: u.classGroupId as string,
    studyLabel: studyStatusLabel(u.studyStatus, u.studyEndReason),
  }));
}

/** Generátor tříd: všechny kombinace vybraných ročníků a písmen (např. 1–4 × A, B, C). Existující se přeskočí. */
export async function createClasses(input: { grades: number[]; letters: string }) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const grades = sanitizeGrades(input.grades);
    if (grades.length === 0) throw new Error(`Vyberte alespoň jeden ročník (1–${DEFAULT_STUDY_YEARS}).`);
    const letters = parseLetters(input.letters);
    const wanted = grades.flatMap((grade) => letters.map((letter) => ({ grade, letter })));
    const res = await prisma.$transaction(async (tx) => {
      const existing = await tx.classGroup.findMany({ where: { OR: wanted } });
      const have = new Set(existing.map((c) => classLabel(c)));
      const missing = wanted.filter((c) => !have.has(classLabel(c)));
      const created = await tx.classGroup.createMany({ data: missing, skipDuplicates: true });
      if (created.count > 0) {
        await audit(tx, admin, {
          action: "school.class.create",
          entityType: "classGroup",
          summary: `Založeny třídy: ${missing.map((c) => classLabel(c)).sort().join(", ")}`,
          data: { classes: missing.map((c) => classLabel(c)) },
        });
      }
      return created;
    });
    revalidateClasses();
    return { created: res.count, total: wanted.length };
  });
}

/** Smaže prázdnou třídu (bez studentů a bez historie zařazení). Úvazky třídy se smažou. */
export async function deleteClass(classGroupId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const cls = await prisma.classGroup.findUnique({
      where: { id: classGroupId },
      include: { _count: { select: { students: true, classMemberships: true } } },
    });
    if (!cls) throw new Error("Třída nenalezena.");
    if (cls._count.students > 0) throw new Error(`Ve třídě ${classLabel(cls)} jsou studenti – nejdřív je přesuňte.`);
    if (cls._count.classMemberships > 0) throw new Error(`Třída ${classLabel(cls)} má historii zařazení studentů, smazat ji nelze.`);
    await prisma.$transaction(async (tx) => {
      await tx.classGroup.delete({ where: { id: classGroupId } });
      await audit(tx, admin, {
        action: "school.class.delete",
        entityType: "classGroup",
        entityId: classGroupId,
        summary: `Smazána prázdná třída ${classLabel(cls)}`,
      });
    });
    revalidateClasses();
  });
}
