"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_STUDY_YEARS } from "@/lib/school";
import { getAudienceOptions, previewAudience, searchAudienceStudents } from "@/modules/seminars/actions/windows";
import type { AudienceDraft } from "@/modules/seminars/audience";
import { Chip } from "@/components/ui/chip";

const GRADES = Array.from({ length: DEFAULT_STUDY_YEARS }, (_, i) => i + 1);

type Person = { id: string; name: string; email: string };
type ClassOption = { id: string; grade: number; label: string };

/** Stav výběru publika ve formuláři: draft + popisky vybraných studentů. */
export type AudienceState = { draft: AudienceDraft; users: Person[]; excluded: Person[] };

export function emptyAudienceState(): AudienceState {
  return { draft: { grades: [], classIds: [], userIds: [], excludeUserIds: [] }, users: [], excluded: [] };
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Vyhledávání studentů podle jména nebo e-mailu; vybraný student se předá nahoru. */
function StudentSearch({
  idPrefix,
  placeholder,
  onPick,
  hidden,
}: {
  idPrefix: string;
  placeholder: string;
   
  onPick: (p: Person) => void;
  hidden: Set<string>;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<(Person & { classLabel: string | null })[]>([]);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchAudienceStudents(q);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const visible = results.filter((r) => !hidden.has(r.id));
  return (
    <div className="space-y-1">
      <Input id={`${idPrefix}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {visible.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-md border text-sm" data-testid={`${idPrefix}-results`}>
          {visible.map((r) => (
            <li key={r.id}>
              <Button
                type="button"
                variant="ghost"
                data-testid={`${idPrefix}-result`}
                data-email={r.email}
                className="h-auto w-full items-baseline justify-between gap-2 whitespace-normal rounded-none px-3 py-1.5 text-left font-normal"
                onClick={() => {
                  onPick({ id: r.id, name: r.name, email: r.email });
                  setQ("");
                  setResults([]);
                }}
              >
                <span>{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.classLabel ?? "bez třídy"} · {r.email}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

 
function Chips({ items, testId, onRemove }: { items: { id: string; label: string }[]; testId: string; onRemove: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i.id} data-testid={testId} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs">
          {i.label}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Odebrat ${i.label}`}
            onClick={() => onRemove(i.id)}
            className="h-4 w-4 rounded-full hover:bg-transparent hover:text-danger"
          >
            <X className="h-3 w-3" />
          </Button>
        </span>
      ))}
    </div>
  );
}

/**
 * Výběr publika zápisového okna: ročníky, třídy, konkrétní studenti a výjimky. Prázdný výběr = všichni
 * aktivní studenti. Pod výběrem je živý počet a seznam studentů, kterých se zápis týká (vyhodnocuje server).
 */
export function AudiencePicker({ value, onChange }: { value: AudienceState; onChange: (_: AudienceState) => void }) {
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [preview, setPreview] = React.useState<{ count: number; truncated: boolean; students: { id: string; name: string; classLabel: string | null }[] } | null>(null);
  const { draft } = value;

  React.useEffect(() => {
    getAudienceOptions().then(setClasses).catch(() => setClasses([]));
  }, []);

  const draftKey = JSON.stringify(draft);
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const p = await previewAudience(JSON.parse(draftKey));
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draftKey]);

  const set = (patch: Partial<AudienceState>) => onChange({ ...value, ...patch });
  const setDraft = (patch: Partial<AudienceDraft>) => set({ draft: { ...draft, ...patch } });
  const classById = new Map(classes.map((c) => [c.id, c]));
  const picked = new Set([...draft.userIds, ...draft.excludeUserIds]);

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="audience-picker">
      <div>
        <Label className="text-sm font-medium">Publikum zápisu (komu je určen)</Label>
        <p className="text-xs text-muted-foreground">
          Zápis uvidí a mohou se do něj zapsat studenti z vybraných ročníků, tříd a konkrétní studenti, kromě vynechaných. Nevybráno nic = všichni
          aktivní studenti.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Ročníky</Label>
        <div className="flex flex-wrap gap-2" id="audience-grades">
          {GRADES.map((g) => {
            const active = draft.grades.includes(g);
            return (
              <Chip key={g}
                data-grade={g} pressed={active} onClick={() => setDraft({ grades: toggle(draft.grades, g).sort((a, b) => a - b) })}>
                {g}. ročník
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Třídy</Label>
        {classes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Žádné třídy.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" id="audience-classes">
            {classes.map((c) => {
              const active = draft.classIds.includes(c.id);
              return (
                <Chip key={c.id}
                  data-class={c.label} pressed={active} size="sm" onClick={() => setDraft({ classIds: toggle(draft.classIds, c.id) })}>
                  {c.label}
                </Chip>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground" htmlFor="audience-user-search">Další studenti (jmenovitě)</Label>
        <StudentSearch
          idPrefix="audience-user"
          placeholder="Hledat studenta podle jména nebo e-mailu…"
          hidden={picked}
          onPick={(p) => set({ users: [...value.users, p], draft: { ...draft, userIds: [...draft.userIds, p.id] } })}
        />
        <Chips
          testId="audience-user-chip"
          items={value.users.filter((u) => draft.userIds.includes(u.id)).map((u) => ({ id: u.id, label: u.name }))}
          onRemove={(id) => setDraft({ userIds: draft.userIds.filter((x) => x !== id) })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground" htmlFor="audience-exclude-search">Kromě těchto studentů</Label>
        <StudentSearch
          idPrefix="audience-exclude"
          placeholder="Vynechat studenta (jméno nebo e-mail)…"
          hidden={picked}
          onPick={(p) => set({ excluded: [...value.excluded, p], draft: { ...draft, excludeUserIds: [...draft.excludeUserIds, p.id] } })}
        />
        <Chips
          testId="audience-exclude-chip"
          items={value.excluded.filter((u) => draft.excludeUserIds.includes(u.id)).map((u) => ({ id: u.id, label: u.name }))}
          onRemove={(id) => setDraft({ excludeUserIds: draft.excludeUserIds.filter((x) => x !== id) })}
        />
      </div>

      <div className="space-y-1 border-t pt-2">
        <p className="text-sm" data-testid="audience-count">
          {preview == null ? "Počítám…" : preview.count === 0 ? "Zápis se nikoho netýká." : `Zápis je určen ${preview.count} ${preview.count === 1 ? "studentovi" : "studentům"}.`}
        </p>
        {preview && preview.count > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Zobrazit seznam studentů</summary>
            <ul className="mt-1 max-h-48 overflow-auto rounded-md border" data-testid="audience-list">
              {preview.students.map((s) => (
                <li key={s.id} className="flex justify-between gap-2 border-b px-3 py-1 last:border-b-0" data-testid="audience-student">
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.classLabel ?? "bez třídy"}</span>
                </li>
              ))}
              {preview.truncated && <li className="px-3 py-1 text-xs text-muted-foreground">… a další (zobrazeno prvních {preview.students.length})</li>}
            </ul>
          </details>
        )}
        {classById.size > 0 && draft.classIds.some((id) => !classById.has(id)) && <p className="text-xs text-danger">Některá z vybraných tříd už neexistuje.</p>}
      </div>
      {(draft.grades.length > 0 || draft.classIds.length > 0 || draft.userIds.length > 0 || draft.excludeUserIds.length > 0) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(emptyAudienceState())}>
          Vymazat výběr (všichni studenti)
        </Button>
      )}
    </div>
  );
}
