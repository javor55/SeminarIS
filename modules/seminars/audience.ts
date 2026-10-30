// Publikum zápisového okna a omezení výskytů: čistá data a funkce bez závislosti na DB
// (použitelné i v klientských komponentách). Dotazy do databáze jsou v `eligibility.ts`,
// které je jediným místem, kudy se způsobilost studentů vyhodnocuje.

export type AudienceType = "GRADE" | "CLASS" | "USER" | "EXCLUDE_USER";

/** Položka publika (řádek EnrollmentWindowAudience). */
export type AudienceEntry = {
  type: AudienceType;
  grade?: number | null;
  classGroupId?: string | null;
  userId?: string | null;
};

/** Student z pohledu publika (předpokládá se aktivní student). */
export type AudienceStudent = { id: string; classGroupId: string | null; grade: number | null };

/** Publikum v podobě, jak ho upravuje formulář okna. */
export type AudienceDraft = {
  grades: number[];
  classIds: string[];
  userIds: string[];
  excludeUserIds: string[];
};

export const EMPTY_AUDIENCE: AudienceDraft = { grades: [], classIds: [], userIds: [], excludeUserIds: [] };

export function audienceKey(e: AudienceEntry): string {
  switch (e.type) {
    case "GRADE":
      return `GRADE:${e.grade}`;
    case "CLASS":
      return `CLASS:${e.classGroupId}`;
    default:
      return `${e.type}:${e.userId}`;
  }
}

export function entriesFromDraft(d: AudienceDraft): AudienceEntry[] {
  return [
    ...d.grades.map((grade) => ({ type: "GRADE" as const, grade })),
    ...d.classIds.map((classGroupId) => ({ type: "CLASS" as const, classGroupId })),
    ...d.userIds.map((userId) => ({ type: "USER" as const, userId })),
    ...d.excludeUserIds.map((userId) => ({ type: "EXCLUDE_USER" as const, userId })),
  ];
}

export function draftFromEntries(entries: readonly AudienceEntry[]): AudienceDraft {
  const d: AudienceDraft = { grades: [], classIds: [], userIds: [], excludeUserIds: [] };
  for (const e of entries) {
    if (e.type === "GRADE" && e.grade != null) d.grades.push(e.grade);
    else if (e.type === "CLASS" && e.classGroupId) d.classIds.push(e.classGroupId);
    else if (e.type === "USER" && e.userId) d.userIds.push(e.userId);
    else if (e.type === "EXCLUDE_USER" && e.userId) d.excludeUserIds.push(e.userId);
  }
  d.grades.sort((a, b) => a - b);
  return d;
}

/** Má publikum nějakou „kladnou“ položku (ročník, třídu, studenta)? Ne = všichni aktivní studenti. */
export function hasIncludes(entries: readonly AudienceEntry[]): boolean {
  return entries.some((e) => e.type !== "EXCLUDE_USER");
}

/**
 * Je (aktivní) student v publiku? Publikum = (ročníky ∪ třídy ∪ studenti) \ vynechaní;
 * bez kladných položek jsou to všichni. Stejnou logiku v SQL má `audienceWhere` (eligibility.ts).
 */
export function isInAudience(entries: readonly AudienceEntry[], student: AudienceStudent): boolean {
  if (entries.some((e) => e.type === "EXCLUDE_USER" && e.userId === student.id)) return false;
  if (!hasIncludes(entries)) return true;
  return entries.some(
    (e) =>
      (e.type === "GRADE" && student.grade != null && e.grade === student.grade) ||
      (e.type === "CLASS" && student.classGroupId != null && e.classGroupId === student.classGroupId) ||
      (e.type === "USER" && e.userId === student.id)
  );
}

/** Omezení výskytu na ročníky a třídy (sjednocení); obojí prázdné = bez omezení. */
export type OccurrenceRestriction = { restrictGrades: readonly number[]; restrictClasses: readonly { id: string }[] };

export function isInOccurrenceAudience(occ: OccurrenceRestriction, student: AudienceStudent | null): boolean {
  if (occ.restrictGrades.length === 0 && occ.restrictClasses.length === 0) return true;
  if (!student) return false;
  return (
    (student.grade != null && occ.restrictGrades.includes(student.grade)) ||
    (student.classGroupId != null && occ.restrictClasses.some((c) => c.id === student.classGroupId))
  );
}

/** Podoba publika pro klienta (formulář okna, hlavička): draft + popisky vybraných tříd a studentů. */
export type AudienceView = {
  draft: AudienceDraft;
  classes: { id: string; label: string }[];
  users: { id: string; name: string; email: string }[];
  excluded: { id: string; name: string; email: string }[];
  // Čitelný popis pro přehledy, např. „3. ročník, třídy 2.A, 4.B, +2 studenti, kromě 1“
  summary: string;
};

const GRADES_FORMS = (grades: readonly number[]) => {
  const sorted = [...grades].sort((a, b) => a - b).map((g) => `${g}.`);
  return sorted.length === 1 ? `${sorted[0]} ročník` : `${sorted.slice(0, -1).join(", ")} a ${sorted[sorted.length - 1]} ročník`;
};

const studentsWord = (n: number) => (n === 1 ? "student" : n >= 2 && n <= 4 ? "studenti" : "studentů");

export function audienceSummary(d: AudienceDraft, classLabels: readonly string[]): string {
  const parts: string[] = [];
  if (d.grades.length) parts.push(GRADES_FORMS(d.grades));
  if (classLabels.length) parts.push(`${classLabels.length === 1 ? "třída" : "třídy"} ${classLabels.join(", ")}`);
  if (d.userIds.length) parts.push(`+${d.userIds.length} ${studentsWord(d.userIds.length)}`);
  let text = parts.length ? parts.join(", ") : "všichni studenti";
  if (d.excludeUserIds.length) text += `, kromě ${d.excludeUserIds.length}`;
  return text;
}
