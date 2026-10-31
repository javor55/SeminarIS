"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getOccurrenceParticipants, type OccurrenceParticipant } from "@/modules/seminars/actions/participants";

/** Jména zapsaných na výskytu pro studenty (jen když to okno povoluje – server to ověřuje). */
export function ParticipantsDialog({ occurrenceId, title, onClose }: { occurrenceId: string; title: string; onClose: () => void }) {
  const [people, setPeople] = useState<OccurrenceParticipant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOccurrenceParticipants(occurrenceId)
      .then(setPeople)
      .catch(() => setError("Seznam zapsaných se nepodařilo načíst."));
  }, [occurrenceId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="participants-dialog">
        <DialogHeader>
          <DialogTitle>Zapsaní – {title}</DialogTitle>
          <DialogDescription>{people ? `Počet zapsaných: ${people.length}` : "Načítám…"}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="max-h-80 space-y-1 overflow-auto text-sm">
          {people?.length === 0 && <li className="text-muted-foreground">Nikdo zatím není zapsaný.</li>}
          {people?.map((p, i) => (
            <li key={i} className="flex justify-between gap-2 rounded-md border px-3 py-1.5" data-testid="participant">
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.classLabel ?? ""}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Zavřít</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
