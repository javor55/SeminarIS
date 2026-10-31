"use client";

import { unwrap } from "@/lib/action-result";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

import { updateEnrollmentWindow, createEnrollmentWindow, deleteEnrollmentWindow } from "@/modules/seminars/actions/windows";
import { NativeSelect } from "@/components/ui/native-select";
import { AudiencePicker, emptyAudienceState, type AudienceState } from "@/modules/seminars/components/audience/AudiencePicker";
import { EnrollmentStatus, EnrollmentWindowWithBlocks } from "@/lib/types";

type EditEnrollmentDialogProps = {
  enrollment: Partial<EnrollmentWindowWithBlocks> & { id?: string; name?: string; description?: string | null; status?: EnrollmentStatus; startsAt?: string | Date; endsAt?: string | Date; visibleToStudents?: boolean; reminderDaysBefore?: number | null };
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
  // Publikum; prázdné = všichni aktivní studenti
  const [audience, setAudience] = React.useState<AudienceState>(() => {
    const v = enrollment.audienceView;
    if (!v) return emptyAudienceState();
    return { draft: v.draft, users: v.users, excluded: v.excluded };
  });
  // Pravidla okna
  const [allowSelfUnenroll, setAllowSelfUnenroll] = React.useState(enrollment.allowSelfUnenroll ?? true);
  const [customDeadline, setCustomDeadline] = React.useState(!!enrollment.changesUntil);
  const [changesUntil, setChangesUntil] = React.useState<Date>(
    new Date(enrollment.changesUntil ?? enrollment.endsAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [resultsVisibility, setResultsVisibility] = React.useState<"COUNTS" | "NAMES">(enrollment.resultsVisibility ?? "COUNTS");
  // Prázdné = automatická připomínka nezapsaným se neposílá
  const [reminderDays, setReminderDays] = React.useState<string>(
    enrollment.reminderDaysBefore != null ? String(enrollment.reminderDaysBefore) : ""
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
        audience: audience.draft,
        allowSelfUnenroll,
        changesUntil: customDeadline ? changesUntil.toISOString() : null,
        resultsVisibility,
        reminderDaysBefore: reminderDays.trim() === "" ? null : Number(reminderDays),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };

      if (isExisting && enrollment.id) {
        unwrap(await updateEnrollmentWindow(enrollment.id, data));
        onOpenChange(false);
      } else {
        const newRecord = unwrap(await createEnrollmentWindow(data));
        onOpenChange(false);
        router.push(`/enrollments/${newRecord.id}`);
      }

      router.refresh();

    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error((e as Error).message || "Došlo k chybě při ukládání okna.");
    } finally {
      setSaving(false);
    }
  }
  
  async function handleDelete() {
    if (!isExisting || !enrollment.id) return;
    try {
      unwrap(await deleteEnrollmentWindow(enrollment.id));
      onOpenChange(false);
      router.push("/enrollments");
      router.refresh();
    } catch(err: unknown) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error("Tento záznam se nepodařilo smazat. Může obsahovat existující bloky, které musíte smazat nejdříve.");
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
            <NativeSelect id="status" value={status} onChange={(e) => setStatus(e.target.value as EnrollmentStatus)}>
              <option value="DRAFT">Koncept (Draft)</option>
              <option value="SCHEDULED">Naplánováno (Scheduled)</option>
              <option value="OPEN">Otevřeno (Open)</option>
              <option value="CLOSED">Uzavřeno (Closed)</option>
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
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
          <AudiencePicker value={audience} onChange={setAudience} />
          <div className="space-y-3 rounded-md border p-3" data-testid="window-rules">
            <Label className="text-sm font-medium">Pravidla zápisu</Label>
            <div className="flex items-center space-x-2">
              <Switch id="allowSelfUnenroll" checked={allowSelfUnenroll} onCheckedChange={setAllowSelfUnenroll} />
              <Label htmlFor="allowSelfUnenroll" className="text-sm">Student se může sám odepsat nebo přepsat zápis</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-sm" htmlFor="changesMode">Změny zápisu studenty povoleny do</Label>
              <NativeSelect id="changesMode" value={customDeadline ? "custom" : "end"} onChange={(e) => setCustomDeadline(e.target.value === "custom")} disabled={!allowSelfUnenroll}>
                <option value="end">Konce zápisu</option>
                <option value="custom">Vlastního termínu</option>
              </NativeSelect>
              {customDeadline && allowSelfUnenroll && (
                <div data-testid="changes-until">
                  <DateTimePicker className="w-full" value={changesUntil} onChange={(date) => date && setChangesUntil(date)} />
                  <p className="text-xs text-muted-foreground mt-1">Po tomto termínu se studenti už nemohou odepsat ani přepsat; nový zápis do bloku bez zápisu je možný do konce zápisu.</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-sm" htmlFor="resultsVisibility">Co vidí studenti o zapsaných</Label>
              <NativeSelect id="resultsVisibility" value={resultsVisibility} onChange={(e) => setResultsVisibility(e.target.value as "COUNTS" | "NAMES")}>
                <option value="COUNTS">Jen počty zapsaných</option>
                <option value="NAMES">Počty i jména zapsaných</option>
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1 pt-2">
            <Label className="text-sm font-medium" htmlFor="reminderDaysBefore">
              Připomenout nezapsaným (dní před koncem)
            </Label>
            <Input
              id="reminderDaysBefore"
              type="number"
              min={1}
              max={60}
              className="w-32"
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
              placeholder="ne"
            />
            <p className="text-xs text-muted-foreground">
              Prázdné = bez automatické připomínky. Jinak denní úloha pošle nezapsaným studentům jeden e-mail (pokud je
              upozornění „Připomínka nezapsaným“ zapnuté v Administraci → Upozornění).
            </p>
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