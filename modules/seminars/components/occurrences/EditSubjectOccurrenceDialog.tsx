"use client";

import { SubjectOccurrence, User, StudentEnrollment } from "@/lib/types";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getAllUsers } from "@/modules/core/actions/users";
import { getSubjectOptions } from "@/modules/core/actions/subjects";
import { getAudienceOptions } from "@/modules/seminars/actions/windows";
import { DEFAULT_STUDY_YEARS } from "@/lib/school";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Chip } from "@/components/ui/chip";


export function EditSubjectOccurrenceDialog({
  open = true,
  occurrence,
  onOpenChange,
  onSubmit,
  onDelete,
}: {
  open?: boolean;
  occurrence: SubjectOccurrence & { enrollments?: StudentEnrollment[] };
  onOpenChange: (_: boolean) => void;
  onSubmit?: (_: SubjectOccurrence) => void;
  onDelete?: (_: string) => void;
  onShowStudents?: (_: string) => void;
}) {
  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);

  const [subjectId, setSubjectId] = useState(occurrence.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(occurrence.teacherId ?? "");
  const [subCode, setSubCode] = useState(occurrence.subCode ?? "");
  const [capacity, setCapacity] = useState<string | number>(occurrence.capacity ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Omezení výskytu na ročníky / třídy (obojí prázdné = pro všechny z publika zápisu)
  const [restrictGrades, setRestrictGrades] = useState<number[]>(occurrence.restrictGrades ?? []);
  const [restrictClassIds, setRestrictClassIds] = useState<string[]>((occurrence.restrictClasses ?? []).map((c) => c.id));
  const [classOptions, setClassOptions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (open) {
      setRestrictGrades(occurrence.restrictGrades ?? []);
      setRestrictClassIds((occurrence.restrictClasses ?? []).map((c) => c.id));
      setSubjectId(occurrence.subjectId ?? "");
      setTeacherId(occurrence.teacherId ?? "");
      setSubCode(occurrence.subCode ?? "");
      setCapacity(occurrence.capacity ?? "");
    }
  }, [open, occurrence]);

  useEffect(() => {
     async function load() {
       const [subjs, allU] = await Promise.all([getSubjectOptions(), getAllUsers()]);
       setSubjects(subjs);
       setTeachers(allU.filter((u) => u.role === "TEACHER"));
       getAudienceOptions().then(setClassOptions).catch(() => setClassOptions([]));
     }
     load();
  }, []);

  const isNew = occurrence.id === "";

  const enrolledCount = occurrence.enrollments
    ? occurrence.enrollments.filter((e) => !e.deletedAt).length
    : 0;
  const hasStudents = enrolledCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Přidat výskyt předmětu" : "Upravit výskyt předmětu"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label htmlFor="occurrence-subject" className="text-sm font-medium">Předmět</label>
            <NativeSelect id="occurrence-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="" disabled>Vyber předmět</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.code ? `(${s.code})` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <label htmlFor="occurrence-teacher" className="text-sm font-medium">Učitel</label>
            <NativeSelect id="occurrence-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Vyber učitele</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Kód skupiny</label>
              <Input
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="např. A"
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Kapacita</label>
              <Input
                type="number"
                min="0"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="0 = neomezeno"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3" data-testid="occurrence-restriction">
            <label className="text-sm font-medium">Určeno pro (volitelné omezení)</label>
            <p className="text-xs text-muted-foreground">
              Bez výběru je předmět určen všem z publika zápisu. Jinak ho uvidí a zapsat se na něj mohou jen studenti vybraných ročníků nebo tříd.
            </p>
            <div className="flex flex-wrap gap-2" id="occurrence-grades">
              {Array.from({ length: DEFAULT_STUDY_YEARS }, (_, i) => i + 1).map((g) => {
                const active = restrictGrades.includes(g);
                return (
                  <Chip
                    key={g}
                    data-grade={g}
                    pressed={active}
                    onClick={() => setRestrictGrades((prev) => (active ? prev.filter((x) => x !== g) : [...prev, g].sort((a, b) => a - b)))}
                  >
                    {g}. ročník
                  </Chip>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5" id="occurrence-classes">
              {classOptions.map((c) => {
                const active = restrictClassIds.includes(c.id);
                return (
                  <Chip key={c.id}
                    data-class={c.label} pressed={active} size="sm" onClick={() => setRestrictClassIds((prev) => (active ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}>
                    {c.label}
                  </Chip>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4 gap-2">
          {!isNew && (
            <div className="flex gap-2">            
              <Button
                variant="destructive"
                className="flex items-center gap-2"
                disabled={hasStudents}
                title={
                  hasStudents
                    ? "Nelze smazat – jsou zapsaní studenti"
                    : "Smazat výskyt"
                }
                onClick={() => setShowDeleteConfirm(true)}
              >                
                Smazat
              </Button>
            </div>
          )}

          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zrušit tento výskyt předmětu?</AlertDialogTitle>
                <AlertDialogDescription>
                  Opravdu chcete odstranit tento výskyt předmětu z bloku? Tato akce je nevratná.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Zrušit</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    if (onDelete) await onDelete(occurrence.id);
                    setShowDeleteConfirm(false);
                    onOpenChange(false);
                  }}
                >
                  Smazat
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <DialogFooter className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button 
                onClick={async () => {
                  if (!subjectId) {
                    toast.error("Vyberte předmět.");
                    return;
                  }
                  
                  const capNum = capacity ? Number(capacity) : 0;
                  if (capNum < 0) {
                    toast.error("Kapacita nesmí být záporná.");
                    return;
                  }

                  if (onSubmit) {
                    try {
                      await onSubmit({
                        ...occurrence,
                        subjectId,
                        teacherId: teacherId || null,
                        subCode: subCode || null,
                        capacity: capNum,
                        restrictGrades,
                        restrictClassIds,
                      } as unknown as SubjectOccurrence);
                    } catch (e) {
                      toast.error((e as Error).message || "Předmět se nepodařilo uložit.");
                      return;
                    }
                  }
                  onOpenChange(false);
                }}
            >
              Uložit
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
