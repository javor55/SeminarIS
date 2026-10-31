import type { TxClient } from "@/lib/prisma";
import { readTable } from "@/lib/csv";
import { DEFAULT_STUDY_YEARS, sanitizeGrades, subjectGradesLabel } from "@/lib/school";
import type { ImportPlan, ImportPreviewRow } from "./types";

// Import předmětů (název, zkratka, ročníky). Klíč = zkratka; předmět bez zkratky se páruje
// podle názvu (bez ohledu na velikost písmen). Ročníky: „1,2,3“, „2-4“, prázdné nebo „všechny“ = všechny.

export type SubjectsImportOptions = { update: boolean };

const FIELDS = {
  name: ["nazev", "name", "predmet"],
  code: ["kod", "zkratka", "code"],
  grades: ["rocniky", "rocnik", "grades", "grade"],
};
const LABELS = { name: "nazev", code: "kod", grades: "rocniky" };

/** "1, 2" / "2-4" / "1.,3." / "vsechny" → [1,2] …; null = neplatné */
export function parseGrades(text: string): number[] | null {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!t || t === "vsechny" || t === "vse" || t === "all") return [];
  const out: number[] = [];
  for (const part of t.split(/[\s,;/]+/).filter(Boolean)) {
    const m = part.match(/^(\d)\.?(?:-(\d)\.?)?$/);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to > DEFAULT_STUDY_YEARS || from > to) return null;
    for (let g = from; g <= to; g++) out.push(g);
  }
  return sanitizeGrades(out);
}

const sameGrades = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((g, i) => g === b[i]);

export async function planSubjectsImport(
  db: TxClient,
  content: string,
  options: SubjectsImportOptions,
  actor: { id: string }
): Promise<ImportPlan> {
  const table = readTable(content, FIELDS, ["name"], LABELS);
  if (table.fileError) return { rows: [], fileError: table.fileError, apply: async () => ({}) };

  const subjects = await db.subject.findMany();
  const byCode = new Map(subjects.filter((s) => s.code).map((s) => [s.code!.toUpperCase(), s]));
  const byName = new Map(subjects.map((s) => [s.name.toLowerCase(), s]));

  const rows: ImportPreviewRow[] = [];
  const creates: { name: string; code: string | null; grades: number[] }[] = [];
  const updates: { id: string; name?: string; grades?: number[] }[] = [];
  const seen = new Map<string, number>();

  for (const { line, v } of table.rows) {
    const name = v.name.trim();
    const code = v.code.trim().toUpperCase() || null;
    const title = `${name || "?"}${code ? ` (${code})` : ""}`;
    const fail = (error: string) => rows.push({ line, status: "error", title, changes: [], error });
    if (!name) { fail("chybí název"); continue; }
    const grades = parseGrades(v.grades);
    if (!grades) { fail(`neplatné ročníky „${v.grades.trim()}“, očekává se např. 1,2,3 nebo 2-4`); continue; }
    const key = code ? `c:${code}` : `n:${name.toLowerCase()}`;
    if (seen.has(key)) { fail(`stejný předmět je v souboru už na řádku ${seen.get(key)}`); continue; }
    seen.set(key, line);

    const existing = code ? byCode.get(code) : byName.get(name.toLowerCase());
    if (!existing) {
      creates.push({ name, code, grades });
      rows.push({ line, status: "new", title, changes: [`ročníky: ${subjectGradesLabel(grades)}`] });
      continue;
    }
    if (!options.update) {
      rows.push({ line, status: "unchanged", title, changes: ["předmět už existuje, aktualizace je vypnutá"] });
      continue;
    }
    const changes: string[] = [];
    const patch: { id: string; name?: string; grades?: number[] } = { id: existing.id };
    if (name !== existing.name) {
      patch.name = name;
      changes.push(`název: ${existing.name} → ${name}`);
    }
    // prázdná buňka u existujícího předmětu ročníky nemění (všechny ročníky = „všechny“)
    if (v.grades.trim() && !sameGrades(grades, [...existing.grades].sort((a, b) => a - b))) {
      patch.grades = grades;
      changes.push(`ročníky: ${subjectGradesLabel(existing.grades)} → ${subjectGradesLabel(grades)}`);
    }
    if (changes.length === 0) rows.push({ line, status: "unchanged", title, changes: [] });
    else {
      updates.push(patch);
      rows.push({ line, status: "change", title, changes });
    }
  }

  return {
    rows,
    apply: async (tx) => {
      for (const c of creates) await tx.subject.create({ data: { ...c, createdById: actor.id } });
      for (const u of updates) {
        await tx.subject.update({
          where: { id: u.id },
          data: { ...(u.name ? { name: u.name } : {}), ...(u.grades ? { grades: u.grades } : {}), updatedById: actor.id },
        });
      }
      return { created: creates.length, updated: updates.length };
    },
  };
}
