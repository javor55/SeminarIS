"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { addRegistration, cancelRegistrationByOrganizer, moveRegistration, removeFromItem, updateRegistration } from "@/modules/events/actions/organizer";
import { effectiveFields } from "@/modules/events/form";
import { itemFullLabel } from "@/modules/events/format";
import { overCapacityMessage, type RegItemRef, type RegRow } from "@/modules/events/organizer-core";
import type { OrganizerFormField, OrganizerItem, RegistrationsData } from "@/modules/events/registrations-data";
import { placesOf } from "@/modules/events/public-state";

// Dialogy akcí organizátora nad registracemi: přidání, úprava, přesun, odebrání z termínu a zrušení.
// Organizátor smí vše; kapacitu ukážou jako varování s výslovným potvrzením „přesto“.

export type DialogState =
  | { kind: "add" }
  | { kind: "bulk" }
  | { kind: "edit"; reg: RegRow }
  | { kind: "move"; reg: RegRow }
  | { kind: "remove"; reg: RegRow }
  | { kind: "cancel"; reg: RegRow };

type CommonProps = { data: RegistrationsData; onClose: () => void; onDone: () => void };

const CONTENT = "max-h-[90dvh] overflow-y-auto";

/** Výsledek akce: chyba jako toast, neodeslaný e-mail jako varování. */
function useRunner(onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      const out = unwrap((await fn()) as never) as { emailed?: boolean | null } | undefined;
      toast.success(done);
      if (out && out.emailed === false) toast.warning("E-mail účastníkovi se nepodařilo odeslat (vyčerpaný limit, vypnuté e-maily nebo chyba odesílání).");
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function EmailOption({ checked, onChange, label = "Poslat účastníkovi e-mail" }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <Checkbox data-testid="send-email" checked={checked} onChange={(e) => onChange(e.target.checked)} label={label} />;
}

function OverWarning({ messages, force, onForce, verb }: { messages: string[]; force: boolean; onForce: (v: boolean) => void; verb: string }) {
  if (messages.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-banner-border bg-banner px-3 py-2 text-sm text-banner-foreground" role="status" data-testid="over-capacity">
      {messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
      <Checkbox data-testid="force-over" checked={force} onChange={(e) => onForce(e.target.checked)} label={`Přesto ${verb} nad kapacitu`} />
    </div>
  );
}

const freeText = (i: OrganizerItem, extra = 0) => (i.capacity === null ? "bez omezení" : `volno ${Math.max(0, i.capacity - Math.max(0, i.taken - extra))} z ${i.capacity}`);

// --- Přidání a úprava ---

function initialValues(fields: OrganizerFormField[], reg?: RegRow): Record<string, string | boolean> {
  const v: Record<string, string | boolean> = { email: reg?.email ?? "" };
  for (const f of fields) {
    if (f.key === "name") v.name = reg?.name ?? "";
    else if (f.key === "guests") v.guests = String(reg?.guests ?? 0);
    else v[f.key] = reg?.answers[f.key] ?? (f.type === "CHECKBOX" ? false : "");
  }
  return v;
}

export function RegistrationFormDialog({ data, reg, onClose, onDone }: CommonProps & { reg?: RegRow }) {
  const editing = !!reg;
  const fields = useMemo(() => effectiveFields(data.fields, data.event.allowGuests).filter((f) => f.mode !== "HIDDEN"), [data]);
  const [values, setValues] = useState(() => initialValues(data.fields, reg));
  const [picked, setPicked] = useState<string[]>([]);
  const [force, setForce] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const { busy, run } = useRunner(onDone, onClose);
  const set = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }));

  const guests = data.event.allowGuests ? Number(values.guests || 0) || 0 : 0;
  const over = useMemo(() => {
    if (editing) {
      if (guests <= reg.guests) return [];
      const own = data.items.filter((i) => reg.items.some((r) => r.id === i.id));
      return own.flatMap((i) => {
        const m = overCapacityMessage(i.capacity, Math.max(0, i.taken - placesOf(reg.guests)), guests);
        return m ? [`${itemFullLabel(i)}: ${m}`] : [];
      });
    }
    return data.items.filter((i) => picked.includes(i.id)).flatMap((i) => {
      const m = overCapacityMessage(i.capacity, i.taken, guests);
      return m ? [`${itemFullLabel(i)}: ${m}`] : [];
    });
  }, [editing, reg, data.items, picked, guests]);
  const canSubmit = (editing || picked.length > 0) && (over.length === 0 || force);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) void run(() => updateRegistration(data.event.id, reg.id, { values, force }), "Údaje registrace jsou uložené.");
    else void run(() => addRegistration(data.event.id, { itemIds: picked, values, force, sendEmail }), "Registrace je přidaná.");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={CONTENT} data-testid={editing ? "dialog-edit" : "dialog-add"}>
        <DialogHeader>
          <DialogTitle>{editing ? `Upravit registraci ${reg.code}` : "Přidat registraci ručně"}</DialogTitle>
          <DialogDescription>{editing ? "Změna údajů účastníka. Termíny se mění přesunem." : "Bez ochrany proti robotům a bez uzávěrek. Povinná pole jsou pro organizátora volitelná, e-mail je potřeba vždy."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rf-email">E-mail <span aria-hidden className="text-danger">*</span></Label>
            <Input id="rf-email" type="email" inputMode="email" autoComplete="off" data-testid="rf-email" value={String(values.email)} onChange={(e) => set("email", e.target.value)} className="h-11 text-base md:h-9 md:text-sm" />
          </div>
          {fields.map((f) => {
            const id = `rf-${f.key}`;
            const v = values[f.key];
            if (f.type === "CHECKBOX") return <Checkbox key={f.key} id={id} data-testid={id} checked={v === true} onChange={(e) => set(f.key, e.target.checked)} label={f.label} />;
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={id}>{f.label}</Label>
                {f.key === "guests" ? (
                  <NativeSelect id={id} data-testid={id} className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={String(v)} onChange={(e) => set(f.key, e.target.value)}>
                    {Array.from({ length: data.event.maxGuests + 1 }, (_, n) => (
                      <option key={n} value={n}>{n === 0 ? "Bez doprovodu" : `+ ${n}`}</option>
                    ))}
                  </NativeSelect>
                ) : f.type === "SELECT" ? (
                  <NativeSelect id={id} data-testid={id} className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={String(v)} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </NativeSelect>
                ) : f.type === "TEXTAREA" ? (
                  <Textarea id={id} data-testid={id} rows={3} value={String(v)} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <Input id={id} data-testid={id} className="h-11 text-base md:h-9 md:text-sm" value={String(v)} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </div>
            );
          })}
          {!editing && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Termíny</legend>
              {data.items.filter((i) => !i.cancelled).map((i) => (
                <Checkbox
                  key={i.id}
                  data-testid="add-item"
                  data-item={i.id}
                  checked={picked.includes(i.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))}
                  label={<span>{itemFullLabel(i)} <span className="text-muted-foreground">({freeText(i)})</span></span>}
                  labelClassName="flex min-h-9 items-start"
                />
              ))}
            </fieldset>
          )}
          <OverWarning messages={over} force={force} onForce={setForce} verb={editing ? "uložit" : "přidat"} />
          {!editing && <EmailOption checked={sendEmail} onChange={setSendEmail} label="Poslat účastníkovi potvrzení (odkaz na správu a kód)" />}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose}>Zpět</Button>
            <Button type="submit" disabled={busy || !canSubmit} data-testid="submit-reg">{editing ? "Uložit" : "Přidat registraci"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Přesun ---

export function MoveDialog({ data, reg, onClose, onDone }: CommonProps & { reg: RegRow }) {
  const targets = data.items.filter((i) => !i.cancelled && !reg.items.some((r) => r.id === i.id));
  const [from, setFrom] = useState(reg.items[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [force, setForce] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const { busy, run } = useRunner(onDone, onClose);
  const target = targets.find((i) => i.id === to);
  const msg = target ? overCapacityMessage(target.capacity, target.taken, reg.guests) : null;
  const ok = !!to && (!msg || force);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={CONTENT} data-testid="dialog-move">
        <DialogHeader>
          <DialogTitle>Přesunout registraci {reg.code}</DialogTitle>
          <DialogDescription>{reg.name ?? reg.email} · {placesOf(reg.guests) === 1 ? "1 osoba" : `${placesOf(reg.guests)} osoby`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mv-from">Z termínu</Label>
            <NativeSelect id="mv-from" data-testid="move-from" className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={from} onChange={(e) => setFrom(e.target.value)} disabled={reg.items.length < 2}>
              {reg.items.map((i) => (
                <option key={i.id} value={i.id}>{itemFullLabel(i)}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mv-to">Na termín</Label>
            <NativeSelect id="mv-to" data-testid="move-to" className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={to} onChange={(e) => { setTo(e.target.value); setForce(false); }}>
              <option value="">Vyberte termín</option>
              {targets.map((i) => (
                <option key={i.id} value={i.id}>{itemFullLabel(i)} ({freeText(i)})</option>
              ))}
            </NativeSelect>
            {targets.length === 0 && <p className="text-sm text-muted-foreground">Není kam přesunout: ostatní termíny neexistují nebo jsou zrušené.</p>}
          </div>
          {msg && <OverWarning messages={[msg]} force={force} onForce={setForce} verb="přesunout" />}
          <EmailOption checked={sendEmail} onChange={setSendEmail} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>Zpět</Button>
          <Button type="button" disabled={busy || !ok} data-testid="submit-move" onClick={() => run(() => moveRegistration(data.event.id, reg.id, { fromItemId: from, toItemId: to, force, sendEmail }), "Registrace je přesunutá.")}>Přesunout</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Odebrání z termínu ---

export function RemoveDialog({ data, reg, onClose, onDone }: CommonProps & { reg: RegRow }) {
  const [itemId, setItemId] = useState(reg.items[0]?.id ?? "");
  const [sendEmail, setSendEmail] = useState(true);
  const { busy, run } = useRunner(onDone, onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={CONTENT} data-testid="dialog-remove">
        <DialogHeader>
          <DialogTitle>Odebrat z termínu</DialogTitle>
          <DialogDescription>Registrace {reg.code} ({reg.name ?? reg.email}) zůstane na ostatních termínech, místo na odebraném se uvolní.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rm-item">Termín</Label>
            <NativeSelect id="rm-item" data-testid="remove-item" className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {reg.items.map((i: RegItemRef) => (
                <option key={i.id} value={i.id}>{itemFullLabel(i)}</option>
              ))}
            </NativeSelect>
          </div>
          <EmailOption checked={sendEmail} onChange={setSendEmail} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>Zpět</Button>
          <Button type="button" variant="destructive" disabled={busy || !itemId} data-testid="submit-remove" onClick={() => run(() => removeFromItem(data.event.id, reg.id, { itemId, sendEmail }), "Účastník je odebraný z termínu.")}>Odebrat z termínu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Zrušení registrace ---

export function CancelDialog({ data, reg, onClose, onDone }: CommonProps & { reg: RegRow }) {
  const [sendEmail, setSendEmail] = useState(true);
  const { busy, run } = useRunner(onDone, onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={CONTENT} data-testid="dialog-cancel">
        <DialogHeader>
          <DialogTitle>Zrušit registraci?</DialogTitle>
          <DialogDescription>Registrace {reg.code} ({reg.name ?? reg.email}) se zruší na všech termínech a místa se uvolní. Záznam zůstane ve stavu „Zrušená“.</DialogDescription>
        </DialogHeader>
        <EmailOption checked={sendEmail} onChange={setSendEmail} />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>Zpět</Button>
          <Button type="button" variant="destructive" disabled={busy} data-testid="submit-cancel" onClick={() => run(() => cancelRegistrationByOrganizer(data.event.id, reg.id, { sendEmail }), "Registrace je zrušená.")}>Zrušit registraci</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
