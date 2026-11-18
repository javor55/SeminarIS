"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { plural } from "@/lib/plural";
import { previewEventBulkEmail, sendEventBulkEmail, type BulkPreviewData } from "@/modules/events/actions/bulk";
import { BULK_BODY_MAX, BULK_SUBJECT_MAX, BULK_VARIABLES } from "@/modules/events/bulk-core";
import { itemFullLabel } from "@/modules/events/format";
import type { OrganizerItem } from "@/modules/events/registrations-data";

const nf = new Intl.NumberFormat("cs-CZ");
const people = (n: number) => `${nf.format(n)} ${plural(n, "příjemce", "příjemci", "příjemců")}`;

/**
 * Hromadný e-mail účastníkům: rozsah (všichni aktivní / jeden termín), předmět a text, náhled počtu příjemců a zbývajícího limitu.
 * Když limit nestačí, nabídne poslat jen prvním N, nebo zrušit.
 */
export function BulkEmailDialog({ eventId, items, initialItemId, onClose, onDone }: { eventId: string; items: OrganizerItem[]; initialItemId: string; onClose: () => void; onDone: () => void }) {
  const [itemId, setItemId] = useState(initialItemId);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<BulkPreviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    previewEventBulkEmail(eventId, itemId ? { kind: "item", itemId } : { kind: "all" }).then((r) => {
      if (cancelled) return;
      if (r.ok) setPreview(r.data);
      else setLoadError((r as { error: string }).error);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, itemId]);

  const over = !!preview && !preview.blocked && preview.recipients > preview.room;
  const sendCount = !preview ? 0 : over ? preview.room : preview.recipients;
  const filled = subject.trim() !== "" && body.trim() !== "";

  async function send() {
    if (!preview) return;
    setBusy(true);
    try {
      const out = unwrap(await sendEventBulkEmail(eventId, { scope: itemId ? { kind: "item", itemId } : { kind: "all" }, subject, body, expected: preview.recipients, limitTo: over ? preview.room : null }));
      if (out.sent === out.attempted && out.failed === 0) toast.success(`E-mail odeslán: ${people(out.sent)}.`);
      else toast.warning(`Odesláno ${out.sent} z ${out.attempted}${out.failed ? `, selhalo ${out.failed}` : ""}${out.skippedLimit ? `, kvůli limitu přeskočeno ${out.skippedLimit}` : ""}${out.skippedDisabled ? `, přeskočeno ${out.skippedDisabled}` : ""}.`);
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="dialog-bulk-email">
        <DialogHeader>
          <DialogTitle>E-mail účastníkům</DialogTitle>
          <DialogDescription>Zpráva se pošle aktivním registracím. Zrušené registrace a registrace s už smazanými osobními údaji se přeskočí.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bulk-scope">Komu</Label>
            <NativeSelect id="bulk-scope" data-testid="bulk-scope" className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Všem aktivním registracím</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>Jen termín: {itemFullLabel(i)}{i.cancelled ? " (zrušený)" : ""}</option>
              ))}
            </NativeSelect>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="bulk-preview" aria-live="polite">
            {loadError ? (
              <p className="text-danger">{loadError}</p>
            ) : !preview ? (
              <p className="text-muted-foreground">Počítám příjemce…</p>
            ) : (
              <div className="space-y-2">
                <p data-testid="bulk-recipients" data-count={preview.recipients}>
                  Příjemců: <strong>{nf.format(preview.recipients)}</strong>
                </p>
                {preview.skipped.map((s) => (
                  <p key={s.reason} className="text-xs text-muted-foreground" data-testid="bulk-skipped">Přeskočeno {s.count}: {s.reason}.</p>
                ))}
                <div className="space-y-1" data-testid="bulk-limit" data-room={preview.room}>
                  <p className="text-xs text-muted-foreground">
                    Dnes odesláno {nf.format(preview.today)} z {nf.format(preview.dailyLimit)}, tento měsíc {nf.format(preview.month)} z {nf.format(preview.monthlyLimit)}. Vejde se ještě <strong>{nf.format(preview.room)}</strong> e-mailů.
                  </p>
                  <Meter value={preview.today} max={preview.dailyLimit} label={`Denní limit: odesláno ${preview.today} z ${preview.dailyLimit}`} />
                </div>
                {preview.blocked && <p className="text-danger" data-testid="bulk-blocked">{preview.blocked}</p>}
                {over && (
                  <div className="rounded-md border border-banner-border bg-banner px-3 py-2 text-banner-foreground" role="status" data-testid="bulk-over">
                    Limit nestačí: příjemců je {nf.format(preview.recipients)}, ale vejde se jen {nf.format(preview.room)}. Můžete poslat zprávu jen prvním {people(preview.room)} (nejstarším registracím), nebo odeslání zrušit.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="bulk-subject">Předmět</Label>
            <Input id="bulk-subject" data-testid="bulk-subject" className="h-11 text-base md:h-9 md:text-sm" value={subject} maxLength={BULK_SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-body">Text</Label>
            <Textarea id="bulk-body" data-testid="bulk-body" rows={7} className="text-base md:text-sm" value={body} maxLength={BULK_BODY_MAX} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Prostý text, značky se nevykonají. Proměnné:{" "}
              {BULK_VARIABLES.map((v) => (
                <span key={v.name} className="mr-2" title={v.description}>
                  <code>{`{{${v.name}}}`}</code>
                </span>
              ))}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} data-testid="bulk-cancel">{over ? "Zrušit odeslání" : "Zpět"}</Button>
          <Button type="button" disabled={busy || !preview || !!preview.blocked || !filled} data-testid="bulk-send" onClick={send}>
            {over ? `Poslat jen prvním ${nf.format(sendCount)}` : `Poslat ${nf.format(sendCount)} ${plural(sendCount, "e-mail", "e-maily", "e-mailů")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
