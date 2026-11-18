"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unwrap } from "@/lib/action-result";
import { plural } from "@/lib/plural";
import { duplicateEvent } from "@/modules/events/actions/events";
import { MAX_SHIFT_DAYS, TITLE_MAX } from "@/modules/events/duplicate-core";

/** Tlačítko „Duplikovat“ v hlavičce události a jeho dialog: název nové události a posun termínů ve dnech. */
export function DuplicateEventButton({ eventId, title }: { eventId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${title} (kopie)`);
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const n = Number(days);
  const valid = name.trim() !== "" && days.trim() !== "" && Number.isInteger(n) && Math.abs(n) <= MAX_SHIFT_DAYS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const created = unwrap(await duplicateEvent(eventId, { title: name, shiftDays: n }));
      toast.success("Událost je zduplikovaná jako koncept.");
      router.push(`/events/${created.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="duplicate-event">
        <Copy /> Duplikovat
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && !busy && setOpen(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="dialog-duplicate">
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Duplikovat událost</DialogTitle>
                <DialogDescription>
                  Zkopíruje se nastavení, formulář, obrázek, popis, publikum a spoluorganizátoři. Termíny i období registrace se posunou o zadaný počet dní. Registrace se nekopírují; nová událost je koncept s novým odkazem.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="dup-title">Název nové události</Label>
                <Input id="dup-title" data-testid="dup-title" className="h-11 text-base md:h-9 md:text-sm" value={name} maxLength={TITLE_MAX} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dup-days">Posun termínů (dnů)</Label>
                <Input id="dup-days" data-testid="dup-days" type="number" inputMode="numeric" step={1} min={-MAX_SHIFT_DAYS} max={MAX_SHIFT_DAYS} className="h-11 w-32 text-base md:h-9 md:text-sm" value={days} onChange={(e) => setDays(e.target.value)} />
                <p className="text-xs text-muted-foreground" data-testid="dup-days-hint">
                  {!valid || n === 0 ? "0 = termíny zůstanou ve stejný den." : `Termíny budou o ${Math.abs(n)} ${plural(Math.abs(n), "den", "dny", "dní")} ${n > 0 ? "později" : "dříve"}.`} Záporné číslo posouvá do minulosti.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy} data-testid="dup-cancel">Zpět</Button>
                <Button type="submit" disabled={!valid || busy} data-testid="dup-submit">{busy ? "Duplikuji…" : "Duplikovat"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
