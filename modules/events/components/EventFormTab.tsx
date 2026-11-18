"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { createField, deleteField, moveField, setFieldMode, updateField } from "@/modules/events/actions/fields";
import type { EventFieldRow } from "@/modules/events/data";
import { CUSTOM_FIELDS_LIMIT, EMAIL_LABEL, MODE_LABEL, TYPE_LABEL, effectiveFields, type FieldMode, type FieldType } from "@/modules/events/form";
import { EventFormPreview } from "@/modules/events/components/EventFormPreview";

const MODES: FieldMode[] = ["REQUIRED", "OPTIONAL", "HIDDEN"];

/** Záložka Formulář: nastavení polí vlevo (nahoře na mobilu), živý náhled vpravo (dole na mobilu). */
export function EventFormTab({ eventId, fields, allowGuests, maxGuests, consentText, readOnly }: { eventId: string; fields: EventFieldRow[]; allowGuests: boolean; maxGuests: number; consentText: string; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ field: EventFieldRow | null } | null>(null);
  const customCount = fields.filter((f) => !f.builtin).length;
  const effective = effectiveFields(fields, allowGuests);

  async function run(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      unwrap((await fn()) as never);
      if (done) toast.success(done);
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="form-tab">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pole formuláře</CardTitle>
          <CardDescription>E-mail je vždy povinný a vždy první. Souhlas se zpracováním osobních údajů je vždy poslední a nejde ho skrýt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-sm" data-testid="field-email">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">{EMAIL_LABEL}</span><Badge variant="secondary">Vždy povinné</Badge></div>
          </div>

          {fields.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-md border p-3" data-field-row={f.key}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.builtin ? "Pevné pole" : `Vlastní pole · ${TYPE_LABEL[f.type].toLowerCase()}`}</div>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="outline" size="icon" aria-label={`Posunout pole ${f.label} nahoru`} disabled={busy || i === 0} onClick={() => run(() => moveField(eventId, f.id, "up"))}><ArrowUp /></Button>
                    <Button type="button" variant="outline" size="icon" aria-label={`Posunout pole ${f.label} dolů`} disabled={busy || i === fields.length - 1} onClick={() => run(() => moveField(eventId, f.id, "down"))}><ArrowDown /></Button>
                  </div>
                )}
              </div>

              {f.key === "guests" ? (
                <p className="text-sm text-muted-foreground" data-testid="guests-note">
                  {allowGuests ? `Zobrazeno (volitelné), nejvýše ${maxGuests} osob navíc.` : "Skryté."} Řídí se nastavením Doprovod na záložce Nastavení.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div role="radiogroup" aria-label={`Režim pole ${f.label}`} className="inline-flex flex-wrap gap-2">
                    {MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={f.mode === m}
                        data-mode={m}
                        disabled={readOnly || busy}
                        onClick={() => f.mode !== m && run(() => setFieldMode(eventId, f.id, m))}
                        className={`min-h-9 rounded-md border px-3 text-sm ${f.mode === m ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
                      >
                        {MODE_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  {!f.builtin && !readOnly && (
                    <>
                      <Button type="button" variant="outline" size="sm" disabled={busy} data-action="edit" onClick={() => setEditing({ field: f })}><Pencil /> Upravit</Button>
                      {f.answered ? (
                        <span className="text-xs text-muted-foreground" data-testid="delete-blocked" data-field-key={f.key}>
                          Pole má odpovědi účastníků, nejde smazat. Můžete ho skrýt.
                        </span>
                      ) : (
                      <ConfirmAction
                        title="Smazat pole?"
                        description={`Pole „${f.label}“ zmizí z formuláře.`}
                        actionLabel="Smazat"
                        cancelLabel="Zpět"
                        onConfirm={async () => void (await run(() => deleteField(eventId, f.id), "Pole je smazané."))}
                        trigger={<Button type="button" variant="outline" size="sm" disabled={busy} data-action="delete"><Trash2 /> Smazat</Button>}
                      />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="rounded-md border bg-muted/30 p-3 text-sm" data-testid="field-consent">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">Souhlas se zpracováním osobních údajů</span><Badge variant="secondary">Vždy povinné</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">Text souhlasu upravíte v Nastavení; odkaz na Zpracování osobních údajů je vždy součástí.</p>
          </div>

          {!readOnly && (
            <Button type="button" variant="outline" disabled={busy || customCount >= CUSTOM_FIELDS_LIMIT} onClick={() => setEditing({ field: null })} data-testid="add-field">
              <Plus /> Přidat vlastní pole
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Náhled formuláře</CardTitle>
          <CardDescription>Tak uvidí formulář účastník. Povinná pole jsou označena hvězdičkou.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventFormPreview fields={effective} allowGuests={allowGuests} maxGuests={maxGuests} consentText={consentText} />
        </CardContent>
      </Card>

      {editing && (
        <FieldDialog
          key={editing.field?.id ?? "new"}
          field={editing.field}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            const f = editing.field;
            if (await run(() => (f ? updateField(eventId, f.id, v) : createField(eventId, v)), f ? "Pole je uložené." : "Pole je přidané.")) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

type FieldValues = { type: FieldType; label: string; options: string[]; required: boolean };

function FieldDialog({ field, onClose, onSave }: { field: EventFieldRow | null; onClose: () => void; onSave: (v: FieldValues) => Promise<void> }) {
  const [type, setType] = useState<FieldType>(field?.type ?? "TEXT");
  const [label, setLabel] = useState(field?.label ?? "");
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  const [required, setRequired] = useState(field ? field.mode === "REQUIRED" : false);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]" data-testid="field-dialog">
        <DialogHeader>
          <DialogTitle>{field ? "Upravit pole" : "Přidat vlastní pole"}</DialogTitle>
          <DialogDescription>Pole se zobrazí ve formuláři za pevnými poli.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await onSave({ type, label, options: options.split("\n"), required });
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="field-type">Typ</Label>
            <NativeSelect id="field-type" value={type} disabled={!!field} onChange={(e) => setType(e.target.value as FieldType)}>
              {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="field-label">Popisek</Label>
            <Input id="field-label" value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {type === "SELECT" && (
            <div className="space-y-1">
              <Label htmlFor="field-options">Možnosti (každá na samostatném řádku)</Label>
              <Textarea id="field-options" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />
            </div>
          )}
          <Checkbox label="Povinné" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Zpět</Button>
            <Button type="submit" disabled={saving} data-testid="field-save">Uložit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
