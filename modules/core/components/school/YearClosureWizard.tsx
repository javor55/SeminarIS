"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  closeSchoolYear,
  type YearClosureException,
  type YearClosurePreview,
  type YearClosureStudent,
  type YearOutcome,
} from "@/modules/core/actions/school";
import { STUDY_END_REASON_LABELS, type StudyEndReasonValue } from "@/lib/school";

const LEAVE_REASONS: StudyEndReasonValue[] = ["TRANSFER", "WITHDRAWAL", "EXPULSION", "OTHER"];

const OUTCOME_LABELS: Record<YearOutcome, string> = {
  PROMOTE: "Postoupí",
  GRADUATE: "Absolvuje",
  REPEAT: "Opakuje ročník",
  LEAVE: "Ukončí studium",
};

// Nativní <select> – na stránce mohou být stovky řádků
const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-sm";

type Choice = { outcome: YearOutcome; targetLetter: string; leaveReason: StudyEndReasonValue };

export function YearClosureWizard({ preview }: { preview: YearClosurePreview }) {
  const router = useRouter();
  const [letters, setLetters] = useState(
    preview.existingFirstGradeLetters.length > 0 ? preview.existingFirstGradeLetters.join(", ") : "A, B, C"
  );
  const [copyAssignments, setCopyAssignments] = useState(true);
  const [busy, setBusy] = useState(false);
  // Jen výjimky oproti výchozímu výsledku
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  const choiceFor = (s: YearClosureStudent): Choice =>
    choices[s.id] ?? { outcome: s.defaultOutcome, targetLetter: s.letter, leaveReason: "TRANSFER" };

  const setChoice = (s: YearClosureStudent, patch: Partial<Choice>) =>
    setChoices((prev) => ({ ...prev, [s.id]: { ...choiceFor(s), ...patch } }));

  // Seskupení podle tříd pro přehled a tabulku
  const byClass = useMemo(() => {
    const map = new Map<string, YearClosureStudent[]>();
    for (const s of preview.students) map.set(s.classLabel, [...(map.get(s.classLabel) ?? []), s]);
    return [...map.entries()];
  }, [preview.students]);

  const counts = preview.students.reduce(
    (acc, s) => {
      acc[choiceFor(s).outcome]++;
      return acc;
    },
    { PROMOTE: 0, GRADUATE: 0, REPEAT: 0, LEAVE: 0 } as Record<YearOutcome, number>
  );

  async function submit() {
    setBusy(true);
    try {
      const exceptions: YearClosureException[] = preview.students
        .filter((s) => choices[s.id] && (choices[s.id].outcome !== s.defaultOutcome || choices[s.id].outcome === "REPEAT"))
        .map((s) => {
          const c = choices[s.id];
          return {
            userId: s.id,
            outcome: c.outcome,
            targetLetter: c.outcome === "REPEAT" ? c.targetLetter : undefined,
            leaveReason: c.outcome === "LEAVE" ? c.leaveReason : undefined,
          };
        });
      const res = await closeSchoolYear({
        expectedStartYear: preview.currentYear.startYear,
        newFirstGradeLetters: letters,
        copyAssignments,
        exceptions,
      });
      toast.success(
        `Školní rok ${res.nextYearLabel} zahájen: postoupilo ${res.promoted}, absolvovalo ${res.graduated}, opakuje ${res.repeated}, odešlo ${res.left}.`
      );
      router.push("/school");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Uzavření roku se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <Link href="/school" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Zpět na Školu
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-2">
          Uzavření školního roku {preview.currentYear.label} → {preview.nextYear.label}
        </h1>
        <p className="text-muted-foreground mt-1">
          Zkontrolujte výsledek u každého studenta. Výchozí je postup do dalšího ročníku a absolvování
          posledního ročníku; upravte jen výjimky (opakování ročníku, odchod ze školy).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4" data-testid="closure-summary">
        {(Object.keys(OUTCOME_LABELS) as YearOutcome[]).map((o) => (
          <Card key={o} className="shadow-sm">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{counts[o]}</div>
              <p className="text-xs text-muted-foreground">{OUTCOME_LABELS[o]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {preview.unassignedCount > 0 && (
        <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          {preview.unassignedCount} studujících nemá přiřazenou třídu – uzavření roku se jich netýká.
          Zařaďte je v Uživatelích.
        </p>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Nový školní rok {preview.nextYear.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 max-w-sm">
            <Label htmlFor="first-grade-letters">Nové 1. ročníky (písmena)</Label>
            <Input id="first-grade-letters" value={letters} onChange={(e) => setLetters(e.target.value)} />
            <p className="text-xs text-muted-foreground">Prázdné = žádné nové třídy (lze založit později).</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="copy-assignments" checked={copyAssignments} onCheckedChange={setCopyAssignments} />
            <Label htmlFor="copy-assignments">
              Převzít úvazky do nového roku ({preview.assignmentCount}; kromě absolvujících tříd)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Studenti</CardTitle>
          <CardDescription>
            Opakující student přejde do třídy o rok mladší (ze 3.A do třídy, která bude v novém roce 3. ročníkem).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádní studenti zařazení do tříd.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Třída</TableHead>
                  <TableHead>Výsledek</TableHead>
                  <TableHead>Podrobnosti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byClass.flatMap(([, students]) =>
                  students.map((s) => {
                    const c = choiceFor(s);
                    const outcomes: YearOutcome[] =
                      s.defaultOutcome === "GRADUATE" ? ["GRADUATE", "REPEAT", "LEAVE"] : ["PROMOTE", "REPEAT", "LEAVE"];
                    return (
                      <TableRow key={s.id} data-student={s.name}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.classLabel}</TableCell>
                        <TableCell>
                          <select
                            className={selectClass}
                            aria-label={`Výsledek – ${s.name}`}
                            value={c.outcome}
                            onChange={(e) => setChoice(s, { outcome: e.target.value as YearOutcome })}
                          >
                            {outcomes.map((o) => (
                              <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.outcome === "PROMOTE" && `→ ${s.grade + 1}.${s.letter}`}
                          {c.outcome === "GRADUATE" && "účet se deaktivuje"}
                          {c.outcome === "REPEAT" && (
                            <span className="inline-flex items-center gap-1">
                              → {s.grade}.
                              <select
                                className={selectClass}
                                aria-label={`Třída po opakování – ${s.name}`}
                                value={c.targetLetter}
                                onChange={(e) => setChoice(s, { targetLetter: e.target.value })}
                              >
                                {s.repeatLetters.map((l) => (
                                  <option key={l} value={l}>{l}</option>
                                ))}
                              </select>
                            </span>
                          )}
                          {c.outcome === "LEAVE" && (
                            <select
                              className={selectClass}
                              aria-label={`Důvod ukončení – ${s.name}`}
                              value={c.leaveReason}
                              onChange={(e) => setChoice(s, { leaveReason: e.target.value as StudyEndReasonValue })}
                            >
                              {LEAVE_REASONS.map((r) => (
                                <option key={r} value={r}>{STUDY_END_REASON_LABELS[r]}</option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <ConfirmAction
          title={`Uzavřít školní rok ${preview.currentYear.label}?`}
          description={`Postoupí ${counts.PROMOTE}, absolvuje ${counts.GRADUATE}, opakuje ${counts.REPEAT}, ukončí ${counts.LEAVE}. Absolventům a odcházejícím se deaktivují účty. Aktuálním rokem se stane ${preview.nextYear.label}. Akci nelze vrátit zpět.`}
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
