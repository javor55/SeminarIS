"use client";

import { unwrapAsync } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, Plus, Archive, ArchiveRestore } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  createClasses,
  createSchoolSubject,
  createTeachingAssignments,
  deleteClass,
  deleteSchoolSubject,
  deleteTeachingAssignment,
  setCurrentSchoolYear,
  toggleSchoolSubjectActive,
  type SchoolOverview,
} from "@/modules/core/actions/school";
import { DEFAULT_STUDY_YEARS } from "@/lib/school";

const GRADES = Array.from({ length: DEFAULT_STUDY_YEARS }, (_, i) => i + 1);

export function SchoolAdminView({ overview }: { overview: SchoolOverview }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Společné volání akce: toast + obnovení dat ze serveru
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Škola</h1>
        <p className="text-muted-foreground mt-1">
          Školní rok, třídy, předměty a úvazky učitelů. Tato data sdílejí všechny moduly.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SchoolYearCard overview={overview} busy={busy} run={run} />
        <ClassesCard overview={overview} busy={busy} run={run} />
      </div>
      <SubjectsCard overview={overview} busy={busy} run={run} />
      <AssignmentsCard overview={overview} busy={busy} run={run} />
    </div>
  );
}

type CardProps = {
  overview: SchoolOverview;
  busy: boolean;
  // eslint-disable-next-line no-unused-vars
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
};

function SchoolYearCard({ overview, busy, run }: CardProps) {
  const [selected, setSelected] = useState(String(overview.currentYear.startYear));
  const changed = selected !== String(overview.currentYear.startYear);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Školní rok</CardTitle>
        <CardDescription>
          Aktuální rok: <strong>{overview.currentYear.label}</strong>. Na konci roku ho uzavřete: třídy
          postoupí, {DEFAULT_STUDY_YEARS}. ročníky absolvují a lze vyřešit opakování ročníku a odchody.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild>
          <Link href="/school/close-year">Uzavřít školní rok {overview.currentYear.label}…</Link>
        </Button>
        {overview.canSetYearManually && (
          <div className="space-y-1 pt-2 border-t">
            <Label htmlFor="school-year">Počáteční nastavení roku</Label>
            <p className="text-xs text-muted-foreground">
              Jen dokud nejsou studenti zařazení do tříd; potom se rok mění uzavřením.
            </p>
            <div className="flex gap-2">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-[180px]" id="school-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {overview.years.map((y) => (
                    <SelectItem key={y.startYear} value={String(y.startYear)}>
                      {y.label}
                      {y.isCurrent ? " (aktuální)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!changed || busy}
                onClick={() => run(() => unwrapAsync(setCurrentSchoolYear(Number(selected))), "Školní rok nastaven.")}
              >
                Nastavit
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClassesCard({ overview, busy, run }: CardProps) {
  const [grade, setGrade] = useState("1");
  const [letters, setLetters] = useState("A, B, C");
  const visible = overview.classes.filter((c) => c.status !== "graduated");
  const graduated = overview.classes.filter((c) => c.status === "graduated");

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Třídy</CardTitle>
        <CardDescription>
          Třídy se zakládají jednou; ročník se každý rok dopočítá sám. Typicky se na začátku roku
          založí nové 1. ročníky.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="class-grade">Ročník</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-[90px]" id="class-grade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={String(g)}>{g}.</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[120px]">
            <Label htmlFor="class-letters">Písmena</Label>
            <Input id="class-letters" value={letters} onChange={(e) => setLetters(e.target.value)} />
          </div>
          <Button
            disabled={busy}
            onClick={() => run(() => unwrapAsync(createClasses(Number(grade), letters)), "Třídy založeny.")}
          >
            <Plus className="w-4 h-4 mr-1" /> Založit
          </Button>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím nejsou založené žádné třídy.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visible.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm" data-testid="class-chip">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground">· {c.studentCount} stud.</span>
                <ConfirmAction
                  title={`Smazat třídu ${c.label}?`}
                  description="Studenti zůstanou v systému, jen nebudou zařazeni do třídy. Úvazky této třídy se smažou."
                  actionLabel="Smazat"
                  onConfirm={async () => { await run(() => unwrapAsync(deleteClass(c.id)), "Třída smazána."); }}
                  trigger={
                    <button className="text-muted-foreground hover:text-destructive" title="Smazat třídu">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  }
                />
              </div>
            ))}
          </div>
        )}
        {graduated.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Absolventi: {graduated.map((c) => c.label).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SubjectsCard({ overview, busy, run }: CardProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Předměty</CardTitle>
        <CardDescription>
          Školní předměty (Matematika, Čeština, …). Používají je úvazky a další moduly, např. dopisovací písemky.
          Semináře se spravují zvlášť v modulu Semináře.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => unwrapAsync(createSchoolSubject({ name, code })), "Předmět přidán.");
            if (ok) {
              setName("");
              setCode("");
            }
          }}
        >
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label htmlFor="subject-name">Název</Label>
            <Input id="subject-name" placeholder="Matematika" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1 w-[120px]">
            <Label htmlFor="subject-code">Zkratka</Label>
            <Input id="subject-code" placeholder="M" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>
            <Plus className="w-4 h-4 mr-1" /> Přidat
          </Button>
        </form>

        {overview.subjects.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Předmět</TableHead>
                <TableHead>Zkratka</TableHead>
                <TableHead>Úvazky v tomto roce</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.subjects.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.code}</TableCell>
                  <TableCell>{s.assignmentCount}</TableCell>
                  <TableCell>
                    {s.isActive ? <Badge variant="success">Aktivní</Badge> : <Badge variant="secondary">Archivovaný</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={s.isActive ? "Archivovat" : "Obnovit"}
                      disabled={busy}
                      onClick={() => run(() => unwrapAsync(toggleSchoolSubjectActive(s.id)), s.isActive ? "Předmět archivován." : "Předmět obnoven.")}
                    >
                      {s.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                    </Button>
                    <ConfirmAction
                      title={`Smazat předmět ${s.name}?`}
                      description="Smažou se i všechny úvazky tohoto předmětu. Pokud ho jen nechcete nabízet, raději ho archivujte."
                      actionLabel="Smazat"
                      onConfirm={async () => { await run(() => unwrapAsync(deleteSchoolSubject(s.id)), "Předmět smazán."); }}
                      trigger={
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" title="Smazat">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentsCard({ overview, busy, run }: CardProps) {
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const activeClasses = overview.classes.filter((c) => c.status === "active").sort((a, b) => a.label.localeCompare(b.label, "cs"));
  const activeSubjects = overview.subjects.filter((s) => s.isActive);

  // Seskupení podle učitele a předmětu: "Novák Jan – Matematika: 1.A, 2.B"
  const grouped = useMemo(() => {
    const map = new Map<string, { teacherName: string; subjectName: string; items: SchoolOverview["assignments"] }>();
    for (const a of overview.assignments) {
      const key = `${a.teacherId}|${a.subjectId}`;
      if (!map.has(key)) map.set(key, { teacherName: a.teacherName, subjectName: a.subjectName, items: [] });
      map.get(key)!.items.push(a);
    }
    return [...map.values()];
  }, [overview.assignments]);

  const toggleClass = (id: string) =>
    setClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Úvazky – kdo co učí ({overview.currentYear.label})</CardTitle>
        <CardDescription>
          Podle úvazků moduly poznají, kdo učí jaký předmět ve které třídě.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="assign-teacher">Učitel</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger id="assign-teacher">
                <SelectValue placeholder="Vyberte učitele" />
              </SelectTrigger>
              <SelectContent>
                {overview.teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="assign-subject">Předmět</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger id="assign-subject">
                <SelectValue placeholder="Vyberte předmět" />
              </SelectTrigger>
              <SelectContent>
                {activeSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Třídy</Label>
          {activeClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nejdřív založte třídy.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeClasses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClass(c.id)}
                  className={`rounded-md border px-3 py-1 text-sm ${classIds.includes(c.id) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          disabled={busy || !teacherId || !subjectId || classIds.length === 0}
          onClick={async () => {
            const ok = await run(
              () => unwrapAsync(createTeachingAssignments({ teacherId, subjectId, classGroupIds: classIds })),
              "Úvazky přidány."
            );
            if (ok) setClassIds([]);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> Přidat úvazek
        </Button>

        {grouped.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Učitel</TableHead>
                <TableHead>Předmět</TableHead>
                <TableHead>Třídy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((g) => (
                <TableRow key={`${g.teacherName}|${g.subjectName}`}>
                  <TableCell className="font-medium">{g.teacherName}</TableCell>
                  <TableCell>{g.subjectName}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.items.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded border px-1.5 text-xs">
                          {a.classLabel}
                          <button
                            title="Odebrat úvazek"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={busy}
                            onClick={() => run(() => unwrapAsync(deleteTeachingAssignment(a.id)), "Úvazek odebrán.")}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
