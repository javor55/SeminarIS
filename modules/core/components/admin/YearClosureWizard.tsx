"use client";

import { unwrap } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  closeSchoolYear,
  type AssignmentMode,
  type YearClosureDecision,
  type YearClosurePreview,
  type YearClosureStudent,
  type YearOutcome,
} from "@/modules/core/actions/school";
import { STUDY_END_REASON_LABELS, type StudyEndReasonValue } from "@/lib/school";
import { PageHeader } from "@/components/page-header";
import { NativeSelect } from "@/components/ui/native-select";

const LEAVE_REASONS: StudyEndReasonValue[] = ["TRANSFER", "WITHDRAWAL", "EXPULSION", "OTHER"];

const OUTCOME_LABELS: Record<YearOutcome, string> = {
  PROMOTE: "Postoupí",
  REPEAT: "Opakuje ročník",
  GRADUATE: "Absolvuje",
  LEAVE: "Ukončí studium",
};

// Cíl studenta: výsledek + písmeno cílové třídy (u postupu a opakování)
type Choice = { outcome: YearOutcome; letter: string; leaveReason: StudyEndReasonValue; leaveNote: string };

// Hodnota výběru cíle: "PROMOTE:B", "REPEAT:A", "GRADUATE", "LEAVE"
const encode = (c: Choice) => (c.outcome === "PROMOTE" || c.outcome === "REPEAT" ? `${c.outcome}:${c.letter}` : c.outcome);

export function YearClosureWizard({ preview }: { preview: YearClosurePreview }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(preview.assignmentCount > 0 ? "WITH_CLASS" : "NONE");
  const [busy, setBusy] = useState(false);
  // Jen to, co se liší od výchozího (postup do stejného písmene / absolvování)
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  const defaultChoice = (s: YearClosureStudent): Choice => ({
    outcome: s.defaultOutcome,
    letter: s.letter,
    leaveReason: "TRANSFER",
    leaveNote: "",
  });
  const choiceFor = (s: YearClosureStudent): Choice => choices[s.id] ?? defaultChoice(s);
  const setChoice = (s: YearClosureStudent, patch: Partial<Choice>) =>
    setChoices((prev) => ({ ...prev, [s.id]: { ...choiceFor(s), ...patch } }));

  /** Písmena cílových tříd daného ročníku: existující + písmeno studenta (chybějící třída se založí). */
  const lettersFor = (grade: number, own: string) => {
    const existing = preview.classes.filter((c) => c.grade === grade).map((c) => c.letter);
    return [...new Set([...existing, own])].sort();
  };
  const classExists = (grade: number, letter: string) => preview.classes.some((c) => c.grade === grade && c.letter === letter);

  const byClass = useMemo(() => {
    const map = new Map<string, YearClosureStudent[]>();
    for (const s of preview.students) map.set(s.classLabel, [...(map.get(s.classLabel) ?? []), s]);
    return [...map.entries()];
  }, [preview.students]);

  function applyEncoded(s: YearClosureStudent, value: string) {
    const [outcome, letter] = value.split(":") as [YearOutcome, string | undefined];
    setChoice(s, { outcome, letter: letter ?? s.letter });
  }

  // Souhrn: kam kdo půjde
  const summary = useMemo(() => {
    const targets = new Map<string, { grade: number; letter: string; count: number }>();
    const counts: Record<YearOutcome, number> = { PROMOTE: 0, REPEAT: 0, GRADUATE: 0, LEAVE: 0 };
    const graduates: string[] = [];
    const leavers: { name: string; reason: StudyEndReasonValue }[] = [];
    for (const s of preview.students) {
      const c = choices[s.id] ?? { outcome: s.defaultOutcome, letter: s.letter, leaveReason: "TRANSFER" as const, leaveNote: "" };
      counts[c.outcome]++;
      if (c.outcome === "PROMOTE" || c.outcome === "REPEAT") {
        const grade = c.outcome === "PROMOTE" ? s.grade + 1 : s.grade;
        const key = `${grade}.${c.letter}`;
        targets.set(key, { grade, letter: c.letter, count: (targets.get(key)?.count ?? 0) + 1 });
      } else if (c.outcome === "GRADUATE") graduates.push(s.name);
      else leavers.push({ name: s.name, reason: c.leaveReason });
    }
    const sortedTargets = [...targets.entries()]
      .map(([label, t]) => ({ label, ...t, isNew: !classExists(t.grade, t.letter) }))
      .sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter));
    // Upozornění: nově zakládané třídy a třídy 2.–4. ročníku, které zůstanou prázdné
    const warnings: string[] = [];
    const created = sortedTargets.filter((t) => t.isNew).map((t) => t.label);
    if (created.length > 0) warnings.push(`Nově se založí třídy: ${created.join(", ")}.`);
    const empty = preview.classes.filter((c) => c.grade > 1 && !targets.has(`${c.grade}.${c.letter}`)).map((c) => c.label);
    if (empty.length > 0) warnings.push(`Po uzavření roku nebudou mít žádné studenty třídy: ${empty.join(", ")}.`);
    if (preview.unassignedCount > 0) {
      warnings.push(`${preview.unassignedCount} studujících nemá přiřazenou třídu – uzavření roku se jich netýká.`);
    }
    return { counts, targets: sortedTargets, graduates, leavers, warnings };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, preview]);

  async function submit() {
    setBusy(true);
    try {
      const decisions: YearClosureDecision[] = preview.students
        .filter((s) => {
          const c = choices[s.id];
          return c && (c.outcome !== s.defaultOutcome || c.letter !== s.letter);
        })
        .map((s) => {
          const c = choices[s.id];
          return {
            userId: s.id,
            outcome: c.outcome,
            targetLetter: c.outcome === "PROMOTE" || c.outcome === "REPEAT" ? c.letter : undefined,
            leaveReason: c.outcome === "LEAVE" ? c.leaveReason : undefined,
            leaveNote: c.outcome === "LEAVE" ? c.leaveNote : undefined,
          };
        });
      const res = unwrap(await closeSchoolYear({
        expectedStartYear: preview.currentYear.startYear,
        assignmentMode,
        decisions,
      }));
      toast.success(
        `Školní rok ${res.nextYearLabel} zahájen: postoupilo ${res.promoted}, opakuje ${res.repeated}, absolvovalo ${res.graduated}, odešlo ${res.left}.`
      );
      router.push("/admin/school-year");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Uzavření roku se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <PageHeader
      back={{ href: "/admin/school-year", label: "Zpět na Školní rok a třídy" }}
      title={`Uzavření školního roku ${preview.currentYear.label} → ${preview.nextYear.label}`}
      description={
        step === 1
          ? "Zkontrolujte cíl u každého studenta. Výchozí je postup do stejného písmene o ročník výš a absolvování 4. ročníku; upravte jen výjimky (změna písmene, opakování ročníku, odchod ze školy)."
          : "Souhrn změn. Potvrzením se vše provede najednou a nelze to vrátit zpět."
      }
    />
  );

  if (step === 1) {
    return (
      <div className="space-y-6" data-step="students">
        {header}

        {preview.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Žádní studenti zařazení do tříd.</p>
        ) : (
          byClass.map(([label, students]) => {
            const first = students[0];
            const isLast = first.defaultOutcome === "GRADUATE";
            return (
              <Card key={label} className="shadow-sm" data-class={label}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-lg">
                    {label} <span className="text-sm font-normal text-muted-foreground">· {students.length} studentů</span>
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm">
                    <Label htmlFor={`bulk-${label}`} className="text-xs text-muted-foreground">Všem:</Label>
                    <NativeSelect
                      id={`bulk-${label}`}
                      compact
                      className="w-[170px]"
                      aria-label={`Všem ve třídě ${label}`}
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        setChoices((prev) => {
                          const next = { ...prev };
                          for (const s of students) {
                            const [outcome, letter] = value.split(":") as [YearOutcome, string | undefined];
                            next[s.id] = { ...(prev[s.id] ?? defaultChoice(s)), outcome, letter: letter ?? s.letter };
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="">vyberte…</option>
                      {isLast ? (
                        <option value="GRADUATE">absolvování</option>
                      ) : (
                        lettersFor(first.grade + 1, first.letter).map((l) => (
                          <option key={l} value={`PROMOTE:${l}`}>{`postup do ${first.grade + 1}.${l}`}</option>
                        ))
                      )}
                    </NativeSelect>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Cíl</TableHead>
                        <TableHead>Podrobnosti</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((s) => {
                        const c = choiceFor(s);
                        const last = s.defaultOutcome === "GRADUATE";
                        const promoteLetters = lettersFor(s.grade + 1, s.letter);
                        const repeatLetters = lettersFor(s.grade, s.letter);
                        return (
                          <TableRow key={s.id} data-student={s.name}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>
                              <NativeSelect
                                compact
                                className="w-[230px]"
                                aria-label={`Cíl – ${s.name}`}
                                value={encode(c)}
                                onChange={(e) => applyEncoded(s, e.target.value)}
                              >
                                {last ? (
                                  <option value="GRADUATE">{OUTCOME_LABELS.GRADUATE}</option>
                                ) : (
                                  <optgroup label="Postup">
                                    {promoteLetters.map((l) => (
                                      <option key={l} value={`PROMOTE:${l}`}>
                                        {`postup do ${s.grade + 1}.${l}${classExists(s.grade + 1, l) ? "" : " (nová)"}`}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="Opakuje ročník">
                                  {repeatLetters.map((l) => (
                                    <option key={l} value={`REPEAT:${l}`}>
                                      {`opakuje v ${s.grade}.${l}${classExists(s.grade, l) ? "" : " (nová)"}`}
                                    </option>
                                  ))}
                                </optgroup>
                                <option value="LEAVE">{OUTCOME_LABELS.LEAVE}</option>
                              </NativeSelect>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.outcome === "GRADUATE" && "účet se deaktivuje"}
                              {c.outcome === "LEAVE" && (
                                <span className="flex flex-wrap items-center gap-2">
                                  <NativeSelect
                                    compact
                                    className="w-[170px]"
                                    aria-label={`Důvod ukončení – ${s.name}`}
                                    value={c.leaveReason}
                                    onChange={(e) => setChoice(s, { leaveReason: e.target.value as StudyEndReasonValue })}
                                  >
                                    {LEAVE_REASONS.map((r) => (
                                      <option key={r} value={r}>{STUDY_END_REASON_LABELS[r]}</option>
                                    ))}
                                  </NativeSelect>
                                  <Input
                                    className="h-8 w-[200px]"
                                    placeholder="poznámka"
                                    aria-label={`Poznámka – ${s.name}`}
                                    value={c.leaveNote}
                                    onChange={(e) => setChoice(s, { leaveNote: e.target.value })}
                                  />
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })
        )}

        <div className="flex justify-end">
          <Button size="lg" onClick={() => setStep(2)} data-testid="to-summary">
            Pokračovat na souhrn
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-step="summary">
      {header}

      <div className="grid gap-4 md:grid-cols-4" data-testid="closure-summary">
        {(Object.keys(OUTCOME_LABELS) as YearOutcome[]).map((o) => (
          <Card key={o} className="shadow-sm">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{summary.counts[o]}</div>
              <p className="text-xs text-muted-foreground">{OUTCOME_LABELS[o]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.warnings.length > 0 && (
        <ul className="space-y-1 text-sm rounded-md border border-warning/30 bg-warning/10 p-3" data-testid="closure-warnings">
          {summary.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Třídy v novém roce {preview.nextYear.label}</CardTitle>
          <CardDescription>Kolik studentů bude v které třídě (postupující a opakující).</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nikdo nepokračuje ve studiu.</p>
          ) : (
            <Table data-testid="closure-targets">
              <TableHeader>
                <TableRow>
                  <TableHead>Třída</TableHead>
                  <TableHead>Studentů</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.targets.map((t) => (
                  <TableRow key={t.label}>
                    <TableCell className="font-medium">
                      {t.label}
                      {t.isNew && <span className="ml-2 text-xs text-muted-foreground">(nová)</span>}
                    </TableCell>
                    <TableCell>{t.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {summary.graduates.length > 0 && (
            <p className="mt-3 text-sm">
              <strong>Absolvují ({summary.graduates.length}):</strong> {summary.graduates.join(", ")}. Účty se deaktivují.
            </p>
          )}
          {summary.leavers.length > 0 && (
            <p className="mt-2 text-sm">
              <strong>Odcházejí ({summary.leavers.length}):</strong>{" "}
              {summary.leavers.map((l) => `${l.name} (${STUDY_END_REASON_LABELS[l.reason]})`).join(", ")}. Účty se deaktivují.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Hosté a učitelé se nemění.</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Úvazky učitelů</CardTitle>
          <CardDescription>
            Úvazky v aktuálním roce: {preview.assignmentCount}. Předměty, které se v novém ročníku nevyučují (nastavení ročníků
            předmětu), a úvazky ze 4. ročníku se při volbě „jít se třídou“ přeskočí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 max-w-xl">
          <Label htmlFor="assignment-mode">Co s úvazky do nového roku</Label>
          <NativeSelect id="assignment-mode" value={assignmentMode} onChange={(e) => setAssignmentMode(e.target.value as AssignmentMode)}>
            <option value="WITH_CLASS">{`Jít se třídou, např. 2.A → 3.A (${preview.assignmentCopyCounts.WITH_CLASS})`}</option>
            <option value="SAME">{`Ponechat u stejných tříd (${preview.assignmentCopyCounts.SAME})`}</option>
            <option value="NONE">Nepřebírat</option>
          </NativeSelect>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
          Zpět k úpravám
        </Button>
        <ConfirmAction
          title={`Uzavřít školní rok ${preview.currentYear.label}?`}
          description={`Postoupí ${summary.counts.PROMOTE}, opakuje ${summary.counts.REPEAT}, absolvuje ${summary.counts.GRADUATE}, ukončí ${summary.counts.LEAVE}. Absolventům a odcházejícím se deaktivují účty. Aktuálním rokem se stane ${preview.nextYear.label}. Akci nelze vrátit zpět.`}
          actionLabel="Uzavřít rok"
          onConfirm={submit}
          trigger={
            <Button size="lg" disabled={busy} data-testid="close-year">
              {busy ? "Uzavírám…" : `Uzavřít rok a zahájit ${preview.nextYear.label}`}
            </Button>
          }
        />
      </div>
    </div>
  );
}
