"use client";

import { SubjectOccurrence } from "@/lib/types";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllUsers, getSubjects } from "@/lib/data";
import { Trash } from "lucide-react";

export function EditSubjectOccurrenceDialog({
  open = true,
  occurrence,
  onOpenChange,
  onSubmit,
  onDelete,
  onShowStudents, // 👈 nový prop
}: {
  open?: boolean;
  occurrence: SubjectOccurrence & { enrollments?: any[] };
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: SubjectOccurrence) => void;
  onDelete?: (id: string) => void;
  onShowStudents?: (id: string) => void;
}) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  // Lokální stavy pro formulář
  const [subjectId, setSubjectId] = useState(occurrence.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(occurrence.teacherId ?? "");
  const [subCode, setSubCode] = useState(occurrence.subCode ?? "");
  const [capacity, setCapacity] = useState<string | number>(occurrence.capacity ?? "");

  // Sync prop -> state
  useEffect(() => {
    if (open) {
      setSubjectId(occurrence.subjectId ?? "");
      setTeacherId(occurrence.teacherId ?? "");
      setSubCode(occurrence.subCode ?? "");
      setCapacity(occurrence.capacity ?? "");
    }
  }, [open, occurrence]);

  useEffect(() => {
     async function load() {
       const [subjs, allU] = await Promise.all([getSubjects(), getAllUsers()]);
       setSubjects(subjs);
       setTeachers(allU.filter((u: any) => u.role === "TEACHER"));
     }
     load();
  }, []);

  const isNew = occurrence.id === "";

  const enrolledCount = occurrence.enrollments
    ? occurrence.enrollments.filter((e: any) => !e.deletedAt).length
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
            <label className="text-sm font-medium">Předmět</label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyber předmět" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Učitel</label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyber učitele" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>

        {/* spodní řádek ovládacích prvků */}
        <div className="flex justify-between items-center mt-4 gap-2">
          {/* LEVÁ strana */}
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
                onClick={async () => {
                  if (hasStudents) return;
                  if (onDelete) await onDelete(occurrence.id);
                  onOpenChange(false);
                }}
              >                
                Smazat
              </Button>
            </div>
          )}

          {/* PRAVÁ strana */}
          <DialogFooter className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button 
                onClick={async () => {
                  if (!subjectId) {
                    alert("Vyberte vyučovaný předmět.");
                    return;
                  }
                  
                  const capNum = capacity ? Number(capacity) : 0;
                  if (capNum < 0) {
                    alert("Kapacita nesmí být záporná.");
                    return;
                  }

                  if (onSubmit) {
                    await onSubmit({
                      ...occurrence,
                      subjectId,
                      teacherId: teacherId || null,
                      subCode: subCode || null,
                      capacity: capNum,
                    } as any);
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
