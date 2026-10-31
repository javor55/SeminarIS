"use client";

import { unwrap } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ui/native-select";
import {
  assignTeacherToGrade,
  createTeachingAssignments,
  deleteTeachingAssignment,
  type SubjectTeaching,
} from "@/modules/core/actions/assignments";

/**
 * Vyučující předmětu v aktuálním školním roce: mřížka tříd (řádky = ročníky předmětu,
 * sloupce = písmena). Kdo smí úvazky upravovat (`teaching.teachers`), ukládá změny hned.
 */
export function SubjectTeachingGrid({ subjectId, teaching }: { subjectId: string; teaching: SubjectTeaching }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // učitel vybraný u řádku pro „stejný učitel pro celý ročník“
  const [gradeTeacher, setGradeTeacher] = useState<Record<number, string>>({});
  const teachers = teaching.teachers;
  const editable = teachers !== null;

  const grades = useMemo(() => [...new Set(teaching.classes.map((c) => c.grade))].sort((a, b) => a - b), [teaching.classes]);
  const letters = useMemo(() => [...new Set(teaching.classes.map((c) => c.letter))].sort(), [teaching.classes]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-sm" data-testid="teaching-grid">
      <CardHeader>
        <CardTitle>Vyučující {teaching.yearLabel}</CardTitle>
        <CardDescription>
          Kdo předmět učí v jednotlivých třídách.{editable ? " Změny se ukládají hned." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {teaching.classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pro ročníky předmětu nejsou založené žádné třídy (třídy se zakládají v Uživatelé → Třídy).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Ročník</TableHead>
                {letters.map((l) => (
                  <TableHead key={l}>{l}</TableHead>
                ))}
                {editable && <TableHead>Celý ročník</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grades.map((grade) => (
                <TableRow key={grade} data-grade={grade}>
                  <TableCell className="font-medium">{grade}.</TableCell>
                  {letters.map((letter) => {
                    const cls = teaching.classes.find((c) => c.grade === grade && c.letter === letter);
                    if (!cls) {
                      return (
                        <TableCell key={letter} className="text-muted-foreground">
                          —
                        </TableCell>
                      );
                    }
                    const assigned = teaching.assignments.filter((a) => a.classGroupId === cls.id);
                    return (
                      <TableCell key={letter} data-class={cls.label} className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex flex-wrap gap-1">
                            {assigned.length === 0 && !editable && <span className="text-muted-foreground">—</span>}
                            {assigned.map((a) => (
                              <span key={a.id} className="inline-flex items-center gap-1 rounded border px-1.5 text-xs" data-teacher={a.teacherName}>
                                {a.teacherName}
                                {editable && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    title="Odebrat úvazek"
                                    aria-label={`Odebrat ${a.teacherName} – ${cls.label}`}
                                    className="h-5 w-5 text-muted-foreground hover:bg-transparent hover:text-danger"
                                    disabled={busy}
                                    onClick={() => mutate(async () => unwrap(await deleteTeachingAssignment(a.id)), "Úvazek odebrán.")}
                                  >
                                    ×
                                  </Button>
                                )}
                              </span>
                            ))}
                          </div>
                          {editable && (
                            <NativeSelect
                              compact
                              className="w-[140px]"
                              aria-label={`Přidat učitele – ${cls.label}`}
                              disabled={busy}
                              value=""
                              onChange={(e) => {
                                const teacherId = e.target.value;
                                if (!teacherId) return;
                                mutate(
                                  async () => unwrap(await createTeachingAssignments({ teacherId, subjectId, classGroupIds: [cls.id] })),
                                  "Úvazek přidán."
                                );
                              }}
                            >
                              <option value="">+ učitel</option>
                              {teachers
                                .filter((t) => !assigned.some((a) => a.teacherId === t.id))
                                .map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </NativeSelect>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                  {editable && (
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1">
                        <NativeSelect
                          compact
                          className="w-[140px]"
                          aria-label={`Učitel pro celý ročník – ${grade}.`}
                          value={gradeTeacher[grade] ?? ""}
                          onChange={(e) => setGradeTeacher((prev) => ({ ...prev, [grade]: e.target.value }))}
                        >
                          <option value="">učitel…</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </NativeSelect>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busy || !gradeTeacher[grade]}
                          onClick={() =>
                            mutate(
                              async () => unwrap(await assignTeacherToGrade({ teacherId: gradeTeacher[grade], subjectId, grade })),
                              `Úvazky pro ${grade}. ročník přidány.`
                            )
                          }
                        >
                          Stejný učitel pro celý ročník
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
