"use client";

import { SubjectOccurrence } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAllUsers, getSubjects } from "@/lib/data";

export function EditSubjectOccurrenceDialog({
  occurrence,
  onOpenChange,
}: {
  occurrence: SubjectOccurrence;
  onOpenChange: (open: boolean) => void;
}) {
  const subjects = getSubjects();
  const teachers = getAllUsers().filter((u) => u.role === "TEACHER");
  const isNew = occurrence.id === "";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Přidat předmět" : "Upravit předmět"}</DialogTitle>
          <DialogDescription>Mock formulář – zatím se neukládá.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Předmět</label>
            <Select defaultValue={occurrence.subjectId ?? ""}>
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
            <Select defaultValue={occurrence.teacherId ?? ""}>
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
              <Input defaultValue={occurrence.subCode ?? ""} placeholder="např. A" />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Kapacita</label>
              <Input type="number" defaultValue={occurrence.capacity ?? ""} placeholder="0 = bez kapacity" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button disabled>Uložit (mock)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
