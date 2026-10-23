"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { DEFAULT_STUDY_YEARS, classLabel, compareClasses, parseLetters, sanitizeGrades } from "@/lib/school";

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

function revalidateClasses() {
  revalidatePath("/users");
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

/** Generátor tříd: všechny kombinace vybraných ročníků a písmen (např. 1–4 × A, B, C). Existující se přeskočí. */
export async function createClasses(input: { grades: number[]; letters: string }) {
  return safeAction(async () => {
    await requirePermission("core.users.manage");
    const grades = sanitizeGrades(input.grades);
    if (grades.length === 0) throw new Error(`Vyberte alespoň jeden ročník (1–${DEFAULT_STUDY_YEARS}).`);
    const letters = parseLetters(input.letters);
    const res = await prisma.classGroup.createMany({
      data: grades.flatMap((grade) => letters.map((letter) => ({ grade, letter }))),
      skipDuplicates: true,
    });
    revalidateClasses();
    return { created: res.count, total: grades.length * letters.length };
  });
}

/** Smaže prázdnou třídu (bez studentů a bez historie zařazení). Úvazky třídy se smažou. */
export async function deleteClass(classGroupId: string) {
  return safeAction(async () => {
    await requirePermission("core.users.manage");
    const cls = await prisma.classGroup.findUnique({
      where: { id: classGroupId },
      include: { _count: { select: { students: true, classMemberships: true } } },
    });
    if (!cls) throw new Error("Třída nenalezena.");
    if (cls._count.students > 0) throw new Error(`Ve třídě ${classLabel(cls)} jsou studenti – nejdřív je přesuňte.`);
    if (cls._count.classMemberships > 0) throw new Error(`Třída ${classLabel(cls)} má historii zařazení studentů, smazat ji nelze.`);
    await prisma.classGroup.delete({ where: { id: classGroupId } });
    revalidateClasses();
  });
}
