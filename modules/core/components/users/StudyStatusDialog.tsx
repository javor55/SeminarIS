"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { endStudy, restoreStudy } from "@/modules/core/actions/users";
import { STUDY_END_REASON_LABELS, type StudyEndReasonValue } from "@/lib/school";
import type { UserRow } from "./users-columns";

// Důvody ukončení během roku (absolvování řeší uzavření školního roku)
const MID_YEAR_REASONS: StudyEndReasonValue[] = ["TRANSFER", "WITHDRAWAL", "EXPULSION", "GRADUATED", "OTHER"];

/** Ukončení studia studenta během roku, případně jeho obnovení. */
export function StudyStatusDialog({ user }: { user: UserRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [reason, setReason] = React.useState<StudyEndReasonValue>("TRANSFER");
  const [endedAt, setEndedAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState("");
  const isStudying = !user.studyLabel;

  async function submit() {
    setSaving(true);
    try {
      if (isStudying) {
        await endStudy(user.id, { reason, endedAt, note });
        toast.success(`Studium – ${user.firstName} ${user.lastName}: ukončeno.`);
      } else {
        await restoreStudy(user.id);
        toast.success(`Studium – ${user.firstName} ${user.lastName}: obnoveno.`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title={isStudying ? "Ukončit studium" : "Obnovit studium"}
        onClick={() => setOpen(true)}
      >
        <GraduationCap className="w-4 h-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{isStudying ? "Ukončit studium" : "Obnovit studium"}</DialogTitle>
            <DialogDescription>
              {user.firstName} {user.lastName}
              {user.classLabel ? `, ${user.classLabel}` : ""}.{" "}
              {isStudying
                ? "Účet se deaktivuje a student zmizí ze seznamů pro zápisy. Třída, historie a zápisy zůstanou zachovány."
                : `Aktuální stav: ${user.studyLabel}. Studium se obnoví a účet znovu aktivuje.`}
            </DialogDescription>
          </DialogHeader>
          {isStudying && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="study-reason">Důvod</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as StudyEndReasonValue)}>
                  <SelectTrigger id="study-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MID_YEAR_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{STUDY_END_REASON_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="study-date">Datum ukončení</Label>
                <Input id="study-date" type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="study-note">Poznámka (nepovinná)</Label>
                <Input id="study-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Zrušit</Button>
            <Button
              variant={isStudying ? "destructive" : "default"}
              onClick={submit}
              disabled={saving}
              data-testid="study-submit"
            >
              {isStudying ? "Ukončit studium" : "Obnovit studium"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
