// Čisté výpočty nad školní strukturou (bez DB) – použitelné na serveru i v klientu.

export const DEFAULT_STUDY_YEARS = 4;

export const GRADES: readonly number[] = Array.from({ length: DEFAULT_STUDY_YEARS }, (_, i) => i + 1);

export type ClassGroupLike = {
  grade: number;
  letter: string;
};

/** Školní rok začíná 1. září: 15. 10. 2026 → 2026 (2026/27), 15. 3. 2027 → 2026. */
export function schoolYearStartForDate(date: Date = new Date()): number {
  return date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

/** 2026 → "2026/27" */
export function schoolYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "3.A" */
export function classLabel(cls: ClassGroupLike): string {
  return `${cls.grade}.${cls.letter}`;
}

/** Řazení tříd: podle ročníku, pak písmene. */
export function compareClasses(a: ClassGroupLike, b: ClassGroupLike): number {
  return a.grade - b.grade || a.letter.localeCompare(b.letter, "cs");
}

/** "3.A" / "3. A" / "3a" → { grade: 3, letter: "A" }, jinak null. */
export function parseClassLabel(label: string): { grade: number; letter: string } | null {
  const m = label.trim().match(/^(\d{1,2})\s*\.?\s*([A-Za-z])$/);
  if (!m) return null;
  const grade = parseInt(m[1], 10);
  if (grade < 1) return null;
  return { grade, letter: m[2].toUpperCase() };
}

/** Písmena tříd z textu "A, B C" → ["A","B","C"]; jinak vyhodí chybu. */
export function parseLetters(letters: string): string[] {
  const list = letters
    .split(/[\s,;]+/)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0 || list.some((l) => !/^[A-Z]$/.test(l))) {
    throw new Error("Zadejte písmena tříd, např. „A, B, C“.");
  }
  return [...new Set(list)];
}

/** Platný ročník předmětu / zápisu: celá čísla 1–4, bez duplicit, seřazená. */
export function sanitizeGrades(grades: unknown): number[] {
  if (!Array.isArray(grades)) return [];
  const valid = grades.map((g) => Number(g)).filter((g) => Number.isInteger(g) && g >= 1 && g <= DEFAULT_STUDY_YEARS);
  return [...new Set(valid)].sort((a, b) => a - b);
}

/** Vyučuje se předmět v daném ročníku? (prázdné `grades` = ve všech) */
export function subjectInGrade(grades: readonly number[], grade: number): boolean {
  return grades.length === 0 || grades.includes(grade);
}

/** [] → "všechny ročníky", [2,3] → "2., 3." */
export function subjectGradesLabel(grades: readonly number[]): string {
  if (grades.length === 0) return "všechny ročníky";
  return [...grades].sort((a, b) => a - b).map((g) => `${g}.`).join(", ");
}

// === Stav studia ===

export type StudyStatusValue = "ACTIVE" | "GRADUATED" | "LEFT";
export type StudyEndReasonValue = "GRADUATED" | "TRANSFER" | "WITHDRAWAL" | "EXPULSION" | "OTHER";
export type ClassChangeReasonValue = "ASSIGNED" | "PROMOTED" | "REPEATED" | "MOVED";

export const STUDY_END_REASON_LABELS: Record<StudyEndReasonValue, string> = {
  GRADUATED: "absolvoval",
  TRANSFER: "přestup",
  WITHDRAWAL: "zanechání studia",
  EXPULSION: "vyloučení",
  OTHER: "jiný důvod",
};

export const CLASS_CHANGE_REASON_LABELS: Record<ClassChangeReasonValue, string> = {
  ASSIGNED: "zařazen",
  PROMOTED: "postup",
  REPEATED: "opakuje ročník",
  MOVED: "přeřazen",
};

/** Krátký popis stavu studia: "absolvent", "ukončil (přestup)"; u studujících null. */
export function studyStatusLabel(status: StudyStatusValue, reason?: StudyEndReasonValue | null): string | null {
  if (status === "GRADUATED") return "absolvent";
  if (status === "LEFT") return `ukončil${reason ? ` (${STUDY_END_REASON_LABELS[reason]})` : ""}`;
  return null;
}

// === Role ===

export const ROLE_LABELS: Record<string, string> = {
  GUEST: "host",
  STUDENT: "student",
  TEACHER: "učitel",
  ADMIN: "administrátor",
};
