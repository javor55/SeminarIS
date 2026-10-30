"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { subjectGradesLabel } from "@/lib/school";

export type PickerSubject = { id: string; name: string; code: string | null; grades: number[] };

type Group = { key: string; title: string; subjects: PickerSubject[] };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Výběr předmětů termínu: nahoře předměty dozorujícího učitele (z úvazků), pak ostatní seskupené
 * podle ročníků, s vyhledáváním. Každý předmět je v seznamu jednou (v „mých“ se neopakuje níže).
 */
export function SubjectPicker({
  subjects,
  mineIds,
  selected,
  onToggle,
}: {
  subjects: PickerSubject[];
  // předměty dozorujícího z úvazků
  mineIds: string[];
  selected: string[];
  onToggle: (_id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo<Group[]>(() => {
    const q = norm(query.trim());
    const visible = subjects.filter((s) => !q || selected.includes(s.id) || norm(`${s.name} ${s.code ?? ""}`).includes(q));
    const mine = new Set(mineIds);
    const result: Group[] = [];
    const mineSubjects = visible.filter((s) => mine.has(s.id));
    if (mineSubjects.length > 0) result.push({ key: "mine", title: "Předměty dozorujícího (z úvazků)", subjects: mineSubjects });
    const byGrades = new Map<string, PickerSubject[]>();
    for (const s of visible.filter((s) => !mine.has(s.id))) {
      const key = [...s.grades].sort((a, b) => a - b).join("-") || "all";
      byGrades.set(key, [...(byGrades.get(key) ?? []), s]);
    }
    const rank = (key: string) => (key === "all" ? 99 : Number(key.split("-")[0]));
    for (const [key, list] of [...byGrades.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))) {
      result.push({ key: `grades-${key}`, title: key === "all" ? "Všechny ročníky" : `${subjectGradesLabel(list[0].grades)} ročník`, subjects: list });
    }
    return result;
  }, [subjects, mineIds, selected, query]);

  return (
    <div className="space-y-2" id="ms-subjects">
      <Input
        id="ms-subject-search"
        type="search"
        placeholder="Hledat předmět podle názvu nebo zkratky…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-60 space-y-3 overflow-y-auto rounded-md border p-2">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">Žádný předmět neodpovídá hledání.</p>}
        {groups.map((g) => (
          <div key={g.key} data-group={g.key}>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{g.title}</div>
            <div className="flex flex-wrap gap-2">
              {g.subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-subject={s.code ?? s.id}
                  onClick={() => onToggle(s.id)}
                  aria-pressed={selected.includes(s.id)}
                  className={`rounded-md border px-3 py-1 text-sm ${selected.includes(s.id) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="ms-selected-count">Vybráno: {selected.length}</p>
    </div>
  );
}
