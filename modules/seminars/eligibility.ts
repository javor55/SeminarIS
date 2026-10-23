import type { User } from "@/lib/types";
import { sanitizeGrades } from "@/lib/school";
import { can } from "@/modules/registry";
import { getStudentGrade } from "@/modules/core/school";

// Cílení zápisových oken na ročníky (EnrollmentWindow.targetGrades, prázdné = všichni).

/** Očistí vstup z formuláře: celá čísla 1–4, bez duplicit, seřazená. */
export const sanitizeTargetGrades = sanitizeGrades;

/**
 * Ročník, podle kterého se uživateli filtrují zápisová okna.
 * `undefined` = nefiltrovat (učitelé a admini vidí vše), `null` = student bez třídy.
 */
export async function getViewerGrade(user: User): Promise<number | null | undefined> {
  if (can(user.role, "seminars.windows.view")) return undefined;
  return getStudentGrade(user.id);
}

/** Prisma podmínka na EnrollmentWindow: okna určená pro daný ročník (nebo všem). */
export function windowsForGradeWhere(grade: number | null) {
  return grade == null
    ? { targetGrades: { isEmpty: true } }
    : { OR: [{ targetGrades: { isEmpty: true } }, { targetGrades: { has: grade } }] };
}

export function isWindowForGrade(targetGrades: readonly number[] | null | undefined, grade: number | null): boolean {
  if (!targetGrades || targetGrades.length === 0) return true;
  return grade != null && targetGrades.includes(grade);
}
