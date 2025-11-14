"use client";

import * as React from "react";
import { useRouter } from "next/navigation"; // 🔥 1. Import routeru
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
// 🔥 2. Import pro Alert Dialog
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

// import { updateEnrollmentWindow, createEnrollmentWindow, deleteEnrollmentWindow } from "@/lib/mock-db";

type EditEnrollmentDialogProps = {
  enrollment: any;
  onOpenChange: (open: boolean) => void;
};

// ... (funkce guessStatus zůstává)
function guessStatus(en: any) {
  const now = new Date();
  const s = new Date(en.startsAt);
  const e = new Date(en.endsAt);
  if (now < s) return "SCHEDULED";
  if (now >= s && now <= e) return "OPEN";
  return "CLOSED";
}

export function EditEnrollmentDialog({
  enrollment,
  onOpenChange,
}: EditEnrollmentDialogProps) {
  const router = useRouter(); // 🔥 3. Inicializace routeru
  const [name, setName] = React.useState(enrollment.name ?? "");
  const [description, setDescription] = React.useState(
    enrollment.description ?? ""
  );
  const [status, setStatus] = React.useState(
    enrollment.status ?? guessStatus(enrollment)
  );
  const [visibleToStudents, setVisibleToStudents] = React.useState(
    enrollment.visibleToStudents ?? false
  );
  const [startsAt, setStartsAt] = React.useState<Date>(
    new Date(enrollment.startsAt)
  );
  const [endsAt, setEndsAt] = React.useState<Date>(
    new Date(enrollment.endsAt)
  );
  const [saving, setSaving] = React.useState(false);
  
  // Kontrola, zda editujeme existující záznam (má ID)
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
        updatedAt: new Date().toISOString(),
      };

      if (isExisting) {
        // --- LOGIKA PRO UPDATE ---
        const updated = { ...enrollment, ...data };
        // const ok = updateEnrollmentWindow(updated);
        console.log("Uloženo (Update - Mock):", updated);
        onOpenChange(false); // Jen zavřeme dialog
      } else {
        // --- LOGIKA PRO CREATE ---
        const created = { ...data, id: `new-id-${Date.now()}` }; // Mock ID
        // const newRecord = createEnrollmentWindow(data);
        console.log("Uloženo (Create - Mock):", created);
        onOpenChange(false); // Zavřeme dialog
        router.push(`/enrollments/${created.id}`); // 🔥 4. Přesměrování!
        router.refresh(); // Obnoví data na stránce
      }

    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }
  
  async function handleDelete() {
    if (!isExisting) return;
    console.log("Mazání (Mock):", enrollment.id);
    // deleteEnrollmentWindow(enrollment.id);
    onOpenChange(false); // Zavřeme dialog
    router.refresh(); // Obnoví data
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          {/* Měníme titulek podle kontextu */}
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

        {/* ... (formulářové pole - beze změny) ... */}
        <div className="space-y-4 py-2">
          {/* Název */}
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
          {/* Popis */}
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
          {/* Stav */}
          <div className="space-y-1">
            <Label className="text-sm font-medium" htmlFor="status">
              Stav
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v)}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="Vyberte stav..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Koncept (Draft)</SelectItem>
                <SelectItem value="SCHEDULED">Naplánováno (Scheduled)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              Stavy "Otevřeno" a "Uzavřeno" se nastavují automaticky podle času.
            </p>
          </div>
          {/* Switch viditelnosti */}
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
          {/* Začátek a Konec */}
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

        {/* 🔥 5. Upravená patička s tlačítkem Smazat */}
        <AlertDialog>
          <div className="flex justify-between gap-2">
            {/* Tlačítko Smazat (vlevo) */}
            <div>
              {isExisting && (
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    Smazat
                  </Button>
                </AlertDialogTrigger>
              )}
            </div>
            
            {/* Tlačítka Zrušit a Uložit (vpravo) */}
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
          
          {/* Potvrzovací dialog pro smazání */}
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu smazat zápis?</AlertDialogTitle>
              <AlertDialogDescription>
                Tato akce je nevratná. Smažete zápisové období
                "{name}". Všechna data o zápisech studentů budou
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