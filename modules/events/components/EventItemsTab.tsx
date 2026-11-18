"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarPlus, ListPlus, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import { MobileCard, MobileCardField, MobileCardList, ResponsiveView } from "@/components/ui/mobile-card";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { formatTime, schoolDayKey } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { cancelItem, createItem, deleteItem, generateItems, reorderItems, restoreItem, updateItem } from "@/modules/events/actions/items";
import type { EventItemRow } from "@/modules/events/data";
import { groupItemsByDay, itemTimeRange } from "@/modules/events/format";
import { MAX_GENERATED_ITEMS, generateSlots, type ItemInput } from "@/modules/events/items";

const EMPTY: ItemInput = { label: "", date: "", start: "", end: "", capacity: null, note: "" };

function toInput(i: EventItemRow): ItemInput {
  return {
    label: i.label ?? "",
    date: i.startsAt ? schoolDayKey(new Date(i.startsAt)) : "",
    start: i.startsAt ? formatTime(i.startsAt) : "",
    end: i.endsAt ? formatTime(i.endsAt) : "",
    capacity: i.capacity,
    note: i.note ?? "",
  };
}

const capacityText = (i: EventItemRow) => (i.capacity === null ? "bez omezení" : `${i.taken} / ${i.capacity}`);

/** Záložka Termíny: seznam po dnech, přidání, úprava, zrušení, smazání a generátor řady. */
export function EventItemsTab({ eventId, items, readOnly }: { eventId: string; items: EventItemRow[]; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ item: EventItemRow | null } | null>(null);
  const [generating, setGenerating] = useState(false);
  const groups = useMemo(() => groupItemsByDay(items), [items]);

  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    try {
      unwrap((await fn()) as never);
      toast.success(done);
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const untimedIds = groups.find((g) => g.key === "none")?.items.map((i) => i.id) ?? [];
  function move(id: string, dir: -1 | 1) {
    const ids = [...untimedIds];
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return run(() => reorderItems(eventId, ids), "Pořadí změněno.");
  }

  function actions(i: EventItemRow, untimed: boolean, pos: number, total: number) {
    if (readOnly) return null;
    return (
      <>
        {untimed && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy || pos === 0} aria-label="Posunout nahoru" onClick={() => move(i.id, -1)}><ArrowUp /></Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || pos === total - 1} aria-label="Posunout dolů" onClick={() => move(i.id, 1)}><ArrowDown /></Button>
          </>
        )}
        <Button type="button" variant="outline" size="sm" disabled={busy} data-action="edit" onClick={() => setEditing({ item: i })}><Pencil /> Upravit</Button>
        {i.cancelled ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} data-action="restore" onClick={() => run(() => restoreItem(eventId, i.id), "Termín je obnovený.")}><RotateCcw /> Obnovit</Button>
        ) : (
          <ConfirmAction
            title="Zrušit termín?"
            description="Termín zůstane v seznamu jako zrušený a nepůjde na něj registrovat. Můžete ho kdykoli obnovit."
            actionLabel="Zrušit termín"
            cancelLabel="Zpět"
            onConfirm={async () => void (await run(() => cancelItem(eventId, i.id), "Termín je zrušený."))}
            trigger={<Button type="button" variant="outline" size="sm" disabled={busy} data-action="cancel"><XCircle /> Zrušit</Button>}
          />
        )}
        {i.registrations === 0 && (
          <ConfirmAction
            title="Smazat termín?"
            description="Termín se nenávratně smaže."
            actionLabel="Smazat"
            cancelLabel="Zpět"
            onConfirm={async () => void (await run(() => deleteItem(eventId, i.id), "Termín je smazaný."))}
            trigger={<Button type="button" variant="outline" size="sm" disabled={busy} data-action="delete"><Trash2 /> Smazat</Button>}
          />
        )}
      </>
    );
  }

  const title = (i: EventItemRow) => (
    <>
      <span className={i.cancelled ? "line-through" : ""}>{i.startsAt ? itemTimeRange(i) : i.label || "Termín"}</span>
      {i.startsAt && i.label && <span className="ml-2 text-muted-foreground">{i.label}</span>}
    </>
  );

  return (
    <div className="space-y-4" data-testid="items-tab">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setEditing({ item: null })} data-testid="add-item"><CalendarPlus /> Přidat termín</Button>
          <Button type="button" variant="outline" onClick={() => setGenerating(true)} data-testid="generate-items"><ListPlus /> Vygenerovat řadu</Button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="items-empty">
          Zatím nejsou žádné termíny. Přidejte první nebo vygenerujte řadu.
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2" data-testid="item-group" data-group={g.key}>
            <h3 className="text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">· {g.items.length} {plural(g.items.length, "termín", "termíny", "termínů")}</span></h3>
            <ResponsiveView
              desktop={
                <ul className="divide-y rounded-lg border bg-card">
                  {g.items.map((i, pos) => (
                    <li key={i.id} data-item={i.id} data-cancelled={i.cancelled || undefined} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${i.cancelled ? "opacity-60" : ""}`}>
                      <div className="w-48 shrink-0 font-medium">{title(i)}</div>
                      <div className="w-44 shrink-0 space-y-1 text-sm">
                        <div>{capacityText(i)}</div>
                        {i.capacity !== null && <Meter value={i.taken} max={i.capacity} label={`Obsazeno ${i.taken} z ${i.capacity}`} />}
                      </div>
                      <div className="min-w-0 flex-1 break-words text-sm text-muted-foreground">
                        {i.cancelled && <Badge variant="muted" className="mr-2">Zrušeno</Badge>}
                        {i.note}
                      </div>
                      <div className="flex flex-wrap gap-2">{actions(i, g.key === "none", pos, g.items.length)}</div>
                    </li>
                  ))}
                </ul>
              }
              mobile={
                <MobileCardList>
                  {g.items.map((i, pos) => (
                    <MobileCard key={i.id} data-item={i.id} data-cancelled={i.cancelled || undefined} title={title(i)} badge={i.cancelled ? <Badge variant="muted">Zrušeno</Badge> : undefined} actions={actions(i, g.key === "none", pos, g.items.length)} className={i.cancelled ? "opacity-60" : ""}>
                      <MobileCardField label="Obsazenost">{capacityText(i)}</MobileCardField>
                      {i.capacity !== null && <Meter value={i.taken} max={i.capacity} label={`Obsazeno ${i.taken} z ${i.capacity}`} />}
                      {i.note && <p className="break-words text-sm text-muted-foreground">{i.note}</p>}
                    </MobileCard>
                  ))}
                </MobileCardList>
              }
            />
          </section>
        ))
      )}

      {editing && (
        <ItemDialog
          key={editing.item?.id ?? "new"}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const item = editing.item;
            if (await run(() => (item ? updateItem(eventId, item.id, input) : createItem(eventId, input)), item ? "Termín je uložený." : "Termín je přidaný.")) setEditing(null);
          }}
        />
      )}
      {generating && (
        <GeneratorDialog
          onClose={() => setGenerating(false)}
          onGenerate={async (input) => {
            setBusy(true);
            try {
              const r = unwrap(await generateItems(eventId, input));
              toast.success(`Vytvořeno ${r.count} ${plural(r.count, "termín", "termíny", "termínů")}.`);
              setGenerating(false);
              router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const capacityValue = (v: string): number | null => (v.trim() === "" ? null : Number(v));

function ItemDialog({ item, onClose, onSave }: { item: EventItemRow | null; onClose: () => void; onSave: (input: ItemInput) => Promise<void> }) {
  const [v, setV] = useState<ItemInput>(item ? toInput(item) : EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<ItemInput>) => setV((s) => ({ ...s, ...p }));
  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]" data-testid="item-dialog">
        <DialogHeader>
          <DialogTitle>{item ? "Upravit termín" : "Přidat termín"}</DialogTitle>
          <DialogDescription>Vyplňte datum a čas, nebo jen název (termín bez času).</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await onSave(v);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Row id="item-label" label="Název (nepovinný, u termínu bez času povinný)">
            <Input id="item-label" value={v.label} maxLength={120} onChange={(e) => set({ label: e.target.value })} />
          </Row>
          <Row id="item-date" label="Datum">
            <Input id="item-date" type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row id="item-start" label="Začátek">
              <Input id="item-start" type="time" value={v.start} onChange={(e) => set({ start: e.target.value })} />
            </Row>
            <Row id="item-end" label="Konec">
              <Input id="item-end" type="time" value={v.end} onChange={(e) => set({ end: e.target.value })} />
            </Row>
          </div>
          <Row id="item-capacity" label="Kapacita" hint="Prázdné = bez omezení.">
            <Input id="item-capacity" type="number" min={1} inputMode="numeric" value={v.capacity ?? ""} onChange={(e) => set({ capacity: capacityValue(e.target.value) })} />
          </Row>
          <Row id="item-note" label="Poznámka">
            <Textarea id="item-note" rows={2} maxLength={500} value={v.note} onChange={(e) => set({ note: e.target.value })} />
          </Row>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Zpět</Button>
            <Button type="submit" disabled={saving} data-testid="item-save">Uložit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GeneratorDialog({ onClose, onGenerate }: { onClose: () => void; onGenerate: (input: Parameters<typeof generateSlots>[0]) => Promise<void> }) {
  const [v, setV] = useState({ date: "", from: "09:00", to: "12:00", step: "30", duration: "30", capacity: "20" });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));
  const input = { date: v.date, from: v.from, to: v.to, stepMinutes: Number(v.step), durationMinutes: Number(v.duration), capacity: capacityValue(v.capacity) };

  const preview = useMemo(() => {
    if (!v.date) return { error: "Vyberte datum.", slots: [] };
    try {
      return { error: null, slots: generateSlots(input) };
    } catch (e) {
      return { error: (e as Error).message, slots: [] };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  const n = preview.slots.length;
  const list = preview.slots.map((s) => itemTimeRange({ label: null, startsAt: s.startsAt, endsAt: s.endsAt }));

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]" data-testid="generator-dialog">
        <DialogHeader>
          <DialogTitle>Vygenerovat řadu termínů</DialogTitle>
          <DialogDescription>Termíny od času „od“ po zadaném rozestupu; poslední končí nejpozději v čase „do“. Najednou nejvýše {MAX_GENERATED_ITEMS}.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (preview.error || n === 0) return;
            setSaving(true);
            try {
              await onGenerate(input);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Row id="gen-date" label="Datum">
            <Input id="gen-date" type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row id="gen-from" label="Od">
              <Input id="gen-from" type="time" value={v.from} onChange={(e) => set({ from: e.target.value })} />
            </Row>
            <Row id="gen-to" label="Do">
              <Input id="gen-to" type="time" value={v.to} onChange={(e) => set({ to: e.target.value })} />
            </Row>
            <Row id="gen-step" label="Rozestup (min)">
              <Input id="gen-step" type="number" min={1} inputMode="numeric" value={v.step} onChange={(e) => set({ step: e.target.value, duration: v.duration === v.step ? e.target.value : v.duration })} />
            </Row>
            <Row id="gen-duration" label="Délka termínu (min)">
              <Input id="gen-duration" type="number" min={1} inputMode="numeric" value={v.duration} onChange={(e) => set({ duration: e.target.value })} />
            </Row>
          </div>
          <Row id="gen-capacity" label="Kapacita každého termínu" hint="Prázdné = bez omezení.">
            <Input id="gen-capacity" type="number" min={1} inputMode="numeric" value={v.capacity} onChange={(e) => set({ capacity: e.target.value })} />
          </Row>
          <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="generator-preview" aria-live="polite">
            {preview.error ? (
              <span className="text-muted-foreground">{preview.error}</span>
            ) : n === 0 ? (
              <span className="text-muted-foreground">V zadaném období se nevejde žádný termín.</span>
            ) : (
              <>
                <strong data-testid="generator-count">Vznikne {n} {plural(n, "termín", "termíny", "termínů")}</strong>
                <span className="text-muted-foreground">: {n > 6 ? `${list.slice(0, 3).join(", ")} … ${list[n - 1]}` : list.join(", ")}</span>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Zpět</Button>
            <Button type="submit" disabled={saving || !!preview.error || n === 0} data-testid="generator-submit">Vytvořit termíny</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
