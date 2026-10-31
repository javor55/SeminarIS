"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type EditBlockDialogProps = {
  open: boolean;
   
  onOpenChange: (_open: boolean) => void;
  block: {
    id: string;
    name: string;
    description?: string | null;
    required?: boolean;
    minEnrollments?: number;
    maxEnrollments?: number;
  };
   
  onSubmit?: (_data: { id: string; name: string; description?: string | null; required: boolean; minEnrollments: number; maxEnrollments: number }) => void;
  // případně můžeš přidat isSaving?: boolean
};

export function EditBlockDialog({
  open,
  onOpenChange,
  block,
  onSubmit,
}: EditBlockDialogProps) {
  const [name, setName] = useState(block?.name ?? "");
  const [description, setDescription] = useState(block?.description ?? "");
  const [required, setRequired] = useState(block?.required ?? true);
  const [minEnrollments, setMin] = useState(String(block?.minEnrollments ?? 1));
  const [maxEnrollments, setMax] = useState(String(block?.maxEnrollments ?? 1));

  // když se otevře dialog s jiným blokem, přenačti hodnoty
  useEffect(() => {
    if (open && block) {
      setName(block.name ?? "");
      setDescription(block.description ?? "");
      setRequired(block.required ?? true);
      setMin(String(block.minEnrollments ?? 1));
      setMax(String(block.maxEnrollments ?? 1));
    }
  }, [open, block]);

  const rulesInvalid =
    !Number.isInteger(Number(minEnrollments)) ||
    !Number.isInteger(Number(maxEnrollments)) ||
    Number(maxEnrollments) < 1 ||
    Number(minEnrollments) < (required ? 1 : 0) ||
    Number(minEnrollments) > Number(maxEnrollments);

  function handleSave() {
    // jednoduchá validace
    if (!name.trim() || rulesInvalid) return;
    onSubmit?.({
      id: block.id,
      name: name.trim(),
      description: description.trim() || null,
      required,
      minEnrollments: Number(minEnrollments),
      maxEnrollments: Number(maxEnrollments),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{block?.id ? "Upravit blok" : "Přidat blok"}</DialogTitle> 
          <DialogDescription>
            {block?.id
              ? "Změňte název nebo popis tohoto bloku."
              : "Vytvořte nový blok pro toto zápisové okno."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="block-name">Název bloku</Label>
            <Input
              id="block-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Např. Blok A"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="block-description">Popis bloku</Label>
            <Textarea
              id="block-description"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Popis bloku (nepovinné)…"
              rows={4}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="block-required" checked={required} onCheckedChange={setRequired} />
            <Label htmlFor="block-required">Povinný blok (nezapsaní studenti se počítají jen z povinných bloků)</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="block-min">Nejméně zápisů v bloku</Label>
              <Input id="block-min" type="number" min={required ? 1 : 0} max={20} value={minEnrollments} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="block-max">Nejvíce zápisů v bloku</Label>
              <Input id="block-max" type="number" min={1} max={20} value={maxEnrollments} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Výchozí je 1 a 1: student si v bloku vybere právě jeden předmět.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || rulesInvalid}>
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
