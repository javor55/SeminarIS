"use client";

import { useState } from "react";
import { Block } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateBlock } from "@/lib/mock-db";
import { toast } from "sonner";

// blok v UI má u tebe navíc description, tak si to tu doplníme
type EditableBlock = Block & {
  description?: string;
};

export function EditBlockDialog({
  block,
  onOpenChange,
}: {
  block: EditableBlock;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(block.name ?? "");
  const [description, setDescription] = useState(block.description ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upravit blok</DialogTitle>
          <DialogDescription>
            Změňte název a popis bloku. Uložení probíhá do mock databáze v paměti.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="block-name">
              Název bloku
            </label>
            <Input
              id="block-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="např. Blok 1 – povinné předměty"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="block-desc">
              Popis bloku
            </label>
            <Input
              id="block-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="např. Vyberte si jeden z nabízených předmětů."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zavřít
          </Button>
          <Button
            disabled={saving || name.trim().length === 0}
            onClick={() => {
              setSaving(true);

              // připravíme objekt se stejnou strukturou, jakou máme v mocku
              const updated: EditableBlock = {
                ...block,
                name: name.trim(),
                description: description.trim(),
              };

              const ok = updateBlock(updated as Block);

              // hned přepíšeme i původní objekt, aby se to promítlo v headeru
              block.name = updated.name;
              block.description = updated.description;

              if (ok) {
                toast.success("Blok byl uložen");
              } else {
                toast.error("Blok se nepodařilo uložit");
              }

              setSaving(false);
              onOpenChange(false);
            }}
          >
            Uložit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
