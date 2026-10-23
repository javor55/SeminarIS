"use client";

import { unwrap } from "@/lib/action-result";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { createClasses, deleteClass, type ClassOverview } from "@/modules/core/actions/classes";
import { setUsersClass } from "@/modules/core/actions/users";
import { GRADES } from "@/lib/school";
import type { UserRow } from "./users-columns";

/** Záložka Třídy: seznam tříd, studenti třídy, přesun do jiné třídy, generátor a smazání prázdné třídy. */
export function ClassesTab({
  classes,
  users,
  canManage,
}: {
  classes: ClassOverview[];
  users: UserRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [grades, setGrades] = useState<number[]>([1, 2, 3, 4]);
  const [letters, setLetters] = useState("A, B, C");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line no-unused-vars
  async function run<T>(action: () => Promise<T>, success: (result: T) => string) {
    setBusy(true);
    try {
      toast.success(success(await action()));
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setBusy(false);
    }
  }

  const toggleGrade = (g: number) => setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  const studentsOf = (classId: string) => users.filter((u) => u.role === "STUDENT" && u.classGroupId === classId);

  return (
    <div className="space-y-6">
      {canManage && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Založit třídy</CardTitle>
            <CardDescription>
              Třídy se zakládají jednou (např. 1.A až 4.C) a studenti se mezi nimi jen přesouvají. Už existující třídy se přeskočí.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Ročníky</Label>
              <div className="flex gap-2" id="class-grades">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    data-grade={g}
                    aria-pressed={grades.includes(g)}
                    onClick={() => toggleGrade(g)}
                    className={`rounded-md border px-3 py-1 text-sm ${grades.includes(g) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                  >
                    {g}.
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="class-letters">Písmena</Label>
              <Input id="class-letters" className="w-[160px]" value={letters} onChange={(e) => setLetters(e.target.value)} />
            </div>
            <Button
              disabled={busy || grades.length === 0}
              data-testid="create-classes"
              onClick={() =>
                run(
                  async () => unwrap(await createClasses({ grades, letters })),
                  (r) => (r.created === 0 ? "Všechny třídy už existují." : `Založeno tříd: ${r.created}.`)
                )
              }
            >
              <Plus className="w-4 h-4 mr-1" /> Založit třídy
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Třídy</CardTitle>
          <CardDescription>Počty se týkají studujících studentů. Rozkliknutím uvidíte studenty třídy.</CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím nejsou založené žádné třídy.</p>
          ) : (
            <Table data-testid="classes-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Třída</TableHead>
                  <TableHead>Studentů</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => {
                  const members = studentsOf(c.id);
                  const isOpen = open === c.id;
                  return (
                    <Fragment key={c.id}>
                      <TableRow data-class={c.label}>
                        <TableCell>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:underline"
                            aria-expanded={isOpen}
                            onClick={() => setOpen(isOpen ? null : c.id)}
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            {c.label}
                          </button>
                        </TableCell>
                        <TableCell data-testid="class-count">{c.studentCount}</TableCell>
                        <TableCell className="text-right">
                          {canManage && members.length === 0 && (
                            <ConfirmAction
                              title={`Smazat třídu ${c.label}?`}
                              description="Třída je prázdná. Úvazky této třídy se smažou. Třídu s historií zařazení studentů smazat nelze."
                              actionLabel="Smazat"
                              onConfirm={() => run(async () => unwrap(await deleteClass(c.id)), () => "Třída smazána.")}
                              trigger={
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" title="Smazat třídu">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              }
                            />
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={3} className="bg-muted/30">
                            {members.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Ve třídě nejsou žádní studenti.</p>
                            ) : (
                              <ul className="divide-y" data-testid="class-students">
                                {members.map((u) => (
                                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm" data-student={u.email}>
                                    <span>
                                      <span className="font-medium">{u.lastName} {u.firstName}</span>
                                      <span className="ml-2 text-muted-foreground">{u.email}</span>
                                      {u.studyLabel && <span className="ml-2 text-xs text-muted-foreground">· {u.studyLabel}</span>}
                                    </span>
                                    {canManage && (
                                      <NativeSelect
                                        compact
                                        className="w-[150px]"
                                        aria-label={`Přesunout do třídy – ${u.lastName} ${u.firstName}`}
                                        disabled={busy}
                                        value=""
                                        onChange={(e) => {
                                          const target = classes.find((x) => x.id === e.target.value);
                                          if (!target) return;
                                          run(
                                            async () => unwrap(await setUsersClass([u.id], target.id)),
                                            () => `${u.firstName} ${u.lastName}: přesunuto do ${target.label}.`
                                          );
                                        }}
                                      >
                                        <option value="">Přesunout do…</option>
                                        {classes.filter((x) => x.id !== c.id).map((x) => (
                                          <option key={x.id} value={x.id}>{x.label}</option>
                                        ))}
                                      </NativeSelect>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
