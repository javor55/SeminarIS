// Čisté výpočty nad školní strukturou (bez DB) – použitelné na serveru i v klientu.

export const DEFAULT_STUDY_YEARS = 4;

export type ClassGroupLike = {
  letter: string;
  entryYear: number;
  studyYears?: number | null;
};

/** Školní rok začíná 1. září: 15. 10. 2026 → 2026 (2026/27), 15. 3. 2027 → 2026. */
export function schoolYearStartForDate(date: Date = new Date()): number {
  return date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

/** 2026 → "2026/27" */
export function schoolYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Ročník třídy v daném školním roce (může být < 1 nebo > počet let studia). */
export function gradeOf(cls: ClassGroupLike, currentStartYear: number): number {
  return currentStartYear - cls.entryYear + 1;
}

export type ClassStatus = "future" | "active" | "graduated";

export function classStatus(cls: ClassGroupLike, currentStartYear: number): ClassStatus {
  const grade = gradeOf(cls, currentStartYear);
  if (grade < 1) return "future";
  if (grade > (cls.studyYears ?? DEFAULT_STUDY_YEARS)) return "graduated";
  return "active";
}

/** "3.A"; absolventi "4.A (abs. 2027)". */
export function classLabel(cls: ClassGroupLike, currentStartYear: number): string {
  const studyYears = cls.studyYears ?? DEFAULT_STUDY_YEARS;
  const status = classStatus(cls, currentStartYear);
  if (status === "graduated") {
    return `${studyYears}.${cls.letter} (abs. ${cls.entryYear + studyYears})`;
  }
  if (status === "future") {
    return `1.${cls.letter} (od ${schoolYearLabel(cls.entryYear)})`;
  }
  return `${gradeOf(cls, currentStartYear)}.${cls.letter}`;
}

/** Rok nástupu třídy, která je v daném školním roce v ročníku `grade`. */
export function entryYearForGrade(grade: number, currentStartYear: number): number {
  return currentStartYear - grade + 1;
}

/** "3.A" / "3. A" / "3a" → { grade: 3, letter: "A" }, jinak null. */
export function parseClassLabel(label: string): { grade: number; letter: string } | null {
  const m = label.trim().match(/^(\d{1,2})\s*\.?\s*([A-Za-z])$/);
  if (!m) return null;
  const grade = parseInt(m[1], 10);
  if (grade < 1) return null;
  return { grade, letter: m[2].toUpperCase() };
}

/** Popis cílových ročníků zápisu: [] → "všechny ročníky", [3] → "3. ročník", [2,3] → "2. a 3. ročník". */
export function targetGradesLabel(grades: readonly number[]): string {
  if (!grades || grades.length === 0) return "všechny ročníky";
  const sorted = [...grades].sort((a, b) => a - b).map((g) => `${g}.`);
  if (sorted.length === 1) return `${sorted[0]} ročník`;
  return `${sorted.slice(0, -1).join(", ")} a ${sorted[sorted.length - 1]} ročník`;
}
