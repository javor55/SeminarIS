"use client";

import { unwrap } from "@/lib/action-result";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createTeachingAssignments,
  deleteTeachingAssignment,
  getTeacherAssignments,
  type TeacherAssignments,
} from "@/modules/core/actions/assignments";
import { subjectInGrade } from "@/lib/school";
import type { UserRow } from "./users-columns";

/**
 * Uživatelé → učitel → Úvazky: předměty a třídy, které učitel učí v aktuálním školním roce.
 * Kdo úvazky upravovat nesmí (učitel v seznamu uživatelů), vidí jen jejich počet.
 */
export function TeacherAssignmentsDialog({ user, editable }: { user: UserRow; editable: boolean }) {
  if (!editable) {
    return (
      <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground" title="Úvazky v aktuálním školním roce">
        <BookOpen className="w-4 h-4" />
        {user.assignmentCount ?? 0}
      </span>
    );
  }
  return <TeacherAssignmentsEditor user={user} />;
}

function TeacherAssignmentsEditor({ user }: { user: UserRow }) {
  const editable = true;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TeacherAssignments | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const count = user.assignmentCount ?? 0;

  const load = useCallback(async () => {
    try {
      setData(await getTeacherAssignments(user.id));
    } catch {
      toast.error("Nepodařilo se načíst úvazky.");
    }
  }, [user.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const subject = data?.subjects.find((s) => s.id === subjectId);
  const allowedClasses = useMemo(
    () => (data && subject ? data.classes.filter((c) => subjectInGrade(subject.grades, c.grade)) : []),
    [data, subject]
  );

  // Úvazky seskupené podle předmětu
  const grouped = useMemo(() => {
    const map = new Map<string, TeacherAssignments["assignments"]>();
    for (const a of data?.assignments ?? []) map.set(a.subjectId, [...(map.get(a.subjectId) ?? []), a]);
    return [...map.entries()]
      .map(([id, items]) => ({ id, name: data?.subjects.find((s) => s.id === id)?.name ?? "Předmět", items }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [data]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await load();
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggleClass = (id: string) => setClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
        title="Úvazky"
        data-testid="assignments-open"
        onClick={() => setOpen(true)}
      >
        <BookOpen className="w-4 h-4" />
        <span className="text-xs">{count}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Úvazky – {user.lastName} {user.firstName}</DialogTitle>
            <DialogDescription>
              Co a ve kterých třídách učitel učí{data ? ` v roce ${data.yearLabel}` : ""}. Změny se ukládají hned.
            </DialogDescription>
          </DialogHeader>

          {!data ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : (
            <div className="space-y-4">
              {grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">Učitel zatím nemá žádné úvazky.</p>
              ) : (
                <ul className="space-y-2" data-testid="teacher-assignments">
                  {grouped.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm" data-subject-name={g.name}>
                      <span className="font-medium">{g.name}</span>
                      <span className="text-muted-foreground">–</span>
                      {g.items.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded border px-1.5 text-xs">
                          {a.classLabel}
                          {editable && (
                            <button
                              type="button"
                              title="Odebrat úvazek"
                              aria-label={`Odebrat ${g.name} ${a.classLabel}`}
                              className="text-muted-foreground hover:text-destructive"
                              disabled={busy}
                              onClick={() => mutate(async () => unwrap(await deleteTeachingAssignment(a.id)), "Úvazek odebrán.")}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}

              {editable && (
                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-1">
                    <Label htmlFor="assign-subject">Přidat předmět</Label>
                    <NativeSelect
                      id="assign-subject"
                      value={subjectId}
                      onChange={(e) => {
                        setSubjectId(e.target.value);
                        setClassIds([]);
                      }}
                    >
                      <option value="">— vyberte předmět —</option>
                      {data.subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.code ? `${s.name} (${s.code})` : s.name}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  {subject && (
                    <div className="space-y-1">
                      <Label>Třídy (jen ročníky předmětu)</Label>
                      {allowedClasses.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Pro tento předmět nejsou žádné třídy.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2" id="assign-classes">
                          {allowedClasses.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              data-class={c.label}
                              aria-pressed={classIds.includes(c.id)}
                              onClick={() => toggleClass(c.id)}
                              className={`rounded-md border px-3 py-1 text-sm ${classIds.includes(c.id) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    disabled={busy || !subjectId || classIds.length === 0}
                    data-testid="assignments-add"
                    onClick={async () => {
                      const ok = await mutate(
                        async () => unwrap(await createTeachingAssignments({ teacherId: user.id, subjectId, classGroupIds: classIds })),
                        "Úvazky přidány."
                      );
                      if (ok) setClassIds([]);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Přidat úvazek
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Zavřít</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
