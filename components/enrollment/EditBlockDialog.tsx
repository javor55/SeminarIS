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

type EditBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: {
    id: string;
    name: string;
    description?: string | null;
  };
  onSubmit?: (data: { id: string; name: string; description?: string | null }) => void;
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

  // když se otevře dialog s jiným blokem, přenačti hodnoty
  useEffect(() => {
    if (open && block) {
      setName(block.name ?? "");
      setDescription(block.description ?? "");
    }
  }, [open, block]);

  function handleSave() {
    // jednoduchá validace
    if (!name.trim()) return;
    onSubmit?.({
      id: block.id,
      name: name.trim(),
      description: description.trim() || null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upravit blok</DialogTitle> 
          <DialogDescription>Mock formulář – zatím se neukládá.</DialogDescription>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
