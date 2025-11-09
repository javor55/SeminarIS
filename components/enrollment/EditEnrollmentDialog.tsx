"use client";

import * as React from "react";
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

// pokud máš v mock-db funkci na update, odkomentuj / přizpůsob
// import { updateEnrollmentWindow } from "@/lib/mock-db";

type EditEnrollmentDialogProps = {
  enrollment: any;
  onOpenChange: (open: boolean) => void;
};

export function EditEnrollmentDialog({
  enrollment,
  onOpenChange,
}: EditEnrollmentDialogProps) {
  const [name, setName] = React.useState(enrollment.name ?? "");
  const [description, setDescription] = React.useState(
    enrollment.description ?? ""
  );
  const [status, setStatus] = React.useState(
    // když nemá status v datech, dopočítáme
    enrollment.status ?? guessStatus(enrollment)
  );
  const [startsAt, setStartsAt] = React.useState(
    toLocalDatetime(enrollment.startsAt)
  );
  const [endsAt, setEndsAt] = React.useState(toLocalDatetime(enrollment.endsAt));
  const [saving, setSaving] = React.useState(false);

  function guessStatus(en: any) {
    const now = new Date();
    const s = new Date(en.startsAt);
    const e = new Date(en.endsAt);
    if (now < s) return "PLANNED";
    if (now >= s && now <= e) return "OPEN";
    return "CLOSED";
  }

  function toLocalDatetime(iso: string) {
    // ISO -> 'YYYY-MM-DDTHH:MM' pro input
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function fromLocalDatetime(val: string) {
    // vezmeme local a převedeme na ISO
    const d = new Date(val);
    return d.toISOString();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = {
        ...enrollment,
        name,
        description,
        status,
        startsAt: fromLocalDatetime(startsAt),
        endsAt: fromLocalDatetime(endsAt),
        updatedAt: new Date().toISOString(),
      };

      // pokud máš v mock-db update, zavolej ho tady:
      // const ok = updateEnrollmentWindow(updated);
      // if (!ok) throw new Error("Nepodařilo se uložit.");

      console.log("Uloženo (mock):", updated);

      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upravit zápis</DialogTitle>
          <DialogDescription>
            Změňte název, popis, stav a časové rozmezí zápisového období.
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
            <label className="text-sm font-medium" htmlFor="status">
              Stav
            </label>
            <select
              id="status"
              className="border rounded-md px-2 py-1 text-sm w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="PLANNED">Naplánováno</option>
              <option value="OPEN">Otevřeno</option>
              <option value="CLOSED">Uzavřeno</option>
            </select>
            <p className="text-xs text-slate-400">
              Stav se jinak určuje podle začátku a konce, ale tady ho můžeš
              přepsat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="startsAt">
                Začátek
              </label>
              <Input
                id="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="endsAt">
                Konec
              </label>
              <Input
                id="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
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
      </DialogContent>
    </Dialog>
  );
}
