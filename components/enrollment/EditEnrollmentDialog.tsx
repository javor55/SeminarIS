"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { updateEnrollmentWindow, createEnrollmentWindow, deleteEnrollmentWindow } from "@/lib/data";
import { EnrollmentStatus, EnrollmentWindowWithBlocks } from "@/lib/types";

type EditEnrollmentDialogProps = {
  enrollment: Partial<EnrollmentWindowWithBlocks> & { id?: string; name?: string; description?: string | null; status?: EnrollmentStatus; startsAt?: string | Date; endsAt?: string | Date; visibleToStudents?: boolean };
  onOpenChange: (open: boolean) => void;
};

function guessStatus(en: Partial<EnrollmentWindowWithBlocks>) {
  const now = new Date();
  if (!en.startsAt || !en.endsAt) return "DRAFT" as EnrollmentStatus;
  const s = new Date(en.startsAt);
  const e = new Date(en.endsAt);
  if (now < s) return "SCHEDULED" as EnrollmentStatus;
  if (now >= s && now <= e) return "OPEN" as EnrollmentStatus;
  return "CLOSED" as EnrollmentStatus;
}

export function EditEnrollmentDialog({
  enrollment,
  onOpenChange,
}: EditEnrollmentDialogProps) {
  const router = useRouter();
  const [name, setName] = React.useState(enrollment.name ?? "");
  const [description, setDescription] = React.useState(
    enrollment.description ?? ""
  );
  const [status, setStatus] = React.useState<EnrollmentStatus>(
    (enrollment.status as EnrollmentStatus) ?? guessStatus(enrollment)
  );
  const [visibleToStudents, setVisibleToStudents] = React.useState(
    enrollment.visibleToStudents ?? false
  );
  const [startsAt, setStartsAt] = React.useState<Date>(
    new Date(enrollment.startsAt ?? Date.now())
  );
  const [endsAt, setEndsAt] = React.useState<Date>(
    new Date(enrollment.endsAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [saving, setSaving] = React.useState(false);
  
  const isExisting = !!enrollment.id;

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        name,
        description,
        status,
        visibleToStudents,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };

      if (isExisting && enrollment.id) {
        await updateEnrollmentWindow(enrollment.id, data);
        onOpenChange(false);
      } else {
        const newRecord = await createEnrollmentWindow(data);
        onOpenChange(false);
        router.push(`/enrollments/${newRecord.id}`);
      }

      router.refresh();

    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Došlo k chybě při ukládání okna.");
    } finally {
      setSaving(false);
    }
  }
  
  async function handleDelete() {
    if (!isExisting || !enrollment.id) return;
    try {
      await deleteEnrollmentWindow(enrollment.id);
      onOpenChange(false);
      router.push("/enrollments");
      router.refresh();
    } catch(err: unknown) {
      // eslint-disable-next-line no-console
      console.error(err);
      alert("Tento záznam se nepodařilo smazat. Může obsahovat existující bloky, které musíte smazat nejdříve.");
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isExisting ? "Upravit zápis" : "Vytvořit nový zápis"}
          </DialogTitle>
          <DialogDescription>
            {isExisting
              ? "Změňte název, popis, stav a časové rozmezí zápisového období."
              : "Vytvořte nové zápisové období."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="name">
              Název
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="description">
              Popis
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-medium" htmlFor="status">
              Stav
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EnrollmentStatus)}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="Vyberte stav..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Koncept (Draft)</SelectItem>
                <SelectItem value="SCHEDULED">Naplánováno (Scheduled)</SelectItem>
                <SelectItem value="OPEN">Otevřeno (Open)</SelectItem>
                <SelectItem value="CLOSED">Uzavřeno (Closed)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              Tip: Stavy &quot;Otevřeno&quot; a &quot;Uzavřeno&quot; lze nastavit i ručně pro vynucení stavu bez ohledu na čas (např. předčasné uzavření).
            </p>

          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Switch
              id="visibleToStudents"
              checked={visibleToStudents}
              onCheckedChange={setVisibleToStudents}
            />
            <Label
              htmlFor="visibleToStudents"
              className="text-sm font-medium"
            >
              Viditelné pro studenty
            </Label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium" htmlFor="startsAt">
                Začátek
              </Label>
              <DateTimePicker
                className="w-full"
                value={startsAt}
                onChange={(date) => date && setStartsAt(date)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium" htmlFor="endsAt">
                Konec
              </Label>
              <DateTimePicker
                className="w-full"
                value={endsAt}
                onChange={(date) => date && setEndsAt(date)}
              />
            </div>
          </div>
        </div>

        <AlertDialog>
          <div className="flex justify-between gap-2">
            <div>
              {isExisting && (
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    Smazat
                  </Button>
                </AlertDialogTrigger>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Zrušit
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Ukládám..." : "Uložit"}
              </Button>
            </div>
          </div>
          
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu smazat zápis?</AlertDialogTitle>
              <AlertDialogDescription>
                Tato akce je nevratná. Smažete zápisové období
                &quot;{name}&quot;. Všechna data o zápisech studentů budou
                ztracena.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Smazat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}