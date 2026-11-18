"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { emptyAudienceState, AudiencePickerBase, type AudiencePickerApi, type AudienceState } from "@/modules/core/components/audience/AudiencePicker";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { createEvent, deleteEvent, updateEvent } from "@/modules/events/actions/events";
import { getEventAudienceOptions, previewEventAudience, searchEventAudienceStudents } from "@/modules/events/actions/audience";
import { CONFIRM_CHANNELS, type EventConfirmChannelValue, type EventVisibilityValue } from "@/modules/events/settings";
import { looksRandomSlug } from "@/modules/events/slug";

const AUDIENCE_API: AudiencePickerApi = { getOptions: getEventAudienceOptions, searchStudents: searchEventAudienceStudents, preview: previewEventAudience };

/** Hodnoty formuláře nastavení (vstup z detailu události; u nové události výchozí). */
export type EventSettingsValues = {
  id?: string;
  slug: string;
  title: string;
  subtitle: string;
  place: string;
  contact: string;
  visibility: EventVisibilityValue;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  maxItemsPerRegistration: number;
  allowGuests: boolean;
  maxGuests: number;
  changeDeadlineMinutes: number;
  maxRegistrationsPerEmail: number;
  confirmChannel: EventConfirmChannelValue;
  confirmationText: string;
  consentText: string;
  organizerIds: string[];
  audience: AudienceState;
  status?: string;
  registrationCount?: number;
};

export const NEW_EVENT_VALUES: EventSettingsValues = {
  slug: "",
  title: "",
  subtitle: "",
  place: "",
  contact: "",
  visibility: "PUBLIC",
  registrationOpensAt: null,
  registrationClosesAt: null,
  maxItemsPerRegistration: 1,
  allowGuests: false,
  maxGuests: 1,
  changeDeadlineMinutes: 1440,
  maxRegistrationsPerEmail: 1,
  confirmChannel: "EMAIL_AND_SCREEN",
  confirmationText: "",
  consentText: "",
  organizerIds: [],
  audience: emptyAudienceState(),
};

function Section({ title, description, testId, children }: { title: string; description?: string; testId: string; children: ReactNode }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Volitelné datum a čas s tlačítkem „Vymazat“. */
function OptionalDateTime({ id, value, onChange }: { id: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex items-center gap-2" id={id}>
      <DateTimePicker className="min-w-0 flex-1" value={value ? new Date(value) : null} onChange={(d) => onChange(d ? d.toISOString() : null)} />
      {value && (
        <Button type="button" variant="ghost" size="icon" aria-label="Vymazat" className="h-8 w-8 shrink-0" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Nastavení události: základ, odkaz, období registrace, viditelnost a publikum, pravidla,
 * potvrzení a texty, spoluorganizátoři. Bez `values.id` zakládá novou událost.
 */
export function EventSettingsForm({ values, teachers, canDelete }: { values: EventSettingsValues; teachers: { id: string; name: string }[]; canDelete?: boolean }) {
  const router = useRouter();
  const isNew = !values.id;
  const initiallyRandom = !isNew && looksRandomSlug(values.slug);

  const [v, setV] = useState(values);
  const [random, setRandom] = useState(initiallyRandom);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<EventSettingsValues>) => setV((cur) => ({ ...cur, ...patch }));

  const channel = CONFIRM_CHANNELS.find((c) => c.value === v.confirmChannel);
  const organizerNames = new Map(teachers.map((t) => [t.id, t.name]));
  const freeTeachers = teachers.filter((t) => !v.organizerIds.includes(t.id));

  async function save() {
    setSaving(true);
    try {
      const input = {
        title: v.title,
        subtitle: v.subtitle,
        place: v.place,
        contact: v.contact,
        slug: random ? "" : v.slug,
        // Náhodný odkaz se generuje při založení nebo při zapnutí přepínače, ne při každém uložení
        randomSlug: random && !initiallyRandom,
        registrationOpensAt: v.registrationOpensAt,
        registrationClosesAt: v.registrationClosesAt,
        visibility: v.visibility,
        audience: v.audience.draft,
        maxItemsPerRegistration: Number(v.maxItemsPerRegistration),
        allowGuests: v.allowGuests,
        maxGuests: Number(v.maxGuests),
        changeDeadlineMinutes: Number(v.changeDeadlineMinutes),
        maxRegistrationsPerEmail: Number(v.maxRegistrationsPerEmail),
        confirmChannel: v.confirmChannel,
        confirmationText: v.confirmationText,
        consentText: v.consentText,
        organizerIds: v.organizerIds,
      };
      if (isNew) {
        const created = unwrap(await createEvent(input));
        toast.success("Událost založena.");
        router.push(`/events/${created.id}`);
      } else {
        const saved = unwrap(await updateEvent(values.id!, input));
        set({ slug: saved.slug });
        toast.success("Nastavení uloženo.");
        router.refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      unwrap(await deleteEvent(values.id!));
      toast.success("Událost smazána.");
      router.push("/events");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const hours = Math.round(v.changeDeadlineMinutes / 60);

  return (
    <form
      className="space-y-4"
      data-testid="event-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Section title="Základ" testId="section-basics">
        <Field id="title" label="Název">
          <Input id="title" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required />
        </Field>
        <Field id="subtitle" label="Podtitulek" hint="Krátký popis, zobrazí se v náhledu odkazu.">
          <Input id="subtitle" value={v.subtitle} onChange={(e) => set({ subtitle: e.target.value })} maxLength={300} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="place" label="Místo konání">
            <Input id="place" value={v.place} onChange={(e) => set({ place: e.target.value })} maxLength={300} />
          </Field>
          <Field id="contact" label="Kontakt na organizátora" hint="E-mail nebo telefon, který uvidí účastníci.">
            <Input id="contact" value={v.contact} onChange={(e) => set({ contact: e.target.value })} maxLength={300} />
          </Field>
        </div>
      </Section>

      <Section title="Odkaz" description="Adresa, na které se účastníci registrují. Stránka má vždy noindex." testId="section-link">
        <Checkbox id="randomSlug" label="Náhodný odkaz (neuhodnutelný, 10 znaků)" checked={random} onChange={(e) => setRandom(e.target.checked)} />
        {random ? (
          <p className="text-sm text-muted-foreground" data-testid="slug-random-hint">
            {isNew || !initiallyRandom ? "Náhodný odkaz se vygeneruje po uložení." : <>Odkaz: <span className="font-mono">/akce/{v.slug}</span></>}
          </p>
        ) : (
          <Field id="slug" label="Odkaz" hint={isNew ? "Prázdné = vytvoří se z názvu. Jen malá písmena bez diakritiky, číslice a pomlčky." : "Malá písmena bez diakritiky, číslice a pomlčky. Změna odkazu zneplatní už rozeslané odkazy."}>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">/akce/</span>
              <Input id="slug" value={v.slug} onChange={(e) => set({ slug: e.target.value })} maxLength={80} placeholder={isNew ? "podle-nazvu" : undefined} className="font-mono" />
            </div>
          </Field>
        )}
      </Section>

      <Section title="Období registrace" description="Mimo toto období se nejde registrovat. Prázdné pole = bez omezení." testId="section-period">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="registrationOpensAt" label="Registrace se otevře">
            <OptionalDateTime id="registrationOpensAt" value={v.registrationOpensAt} onChange={(d) => set({ registrationOpensAt: d })} />
          </Field>
          <Field id="registrationClosesAt" label="Registrace se zavře">
            <OptionalDateTime id="registrationClosesAt" value={v.registrationClosesAt} onChange={(d) => set({ registrationClosesAt: d })} />
          </Field>
        </div>
      </Section>

      <Section title="Kdo se může registrovat" testId="section-visibility">
        <Field id="visibility" label="Viditelnost">
          <NativeSelect id="visibility" value={v.visibility} onChange={(e) => set({ visibility: e.target.value as EventVisibilityValue })}>
            <option value="PUBLIC">Veřejná: kdokoli s odkazem</option>
            <option value="USERS">Jen pro přihlášené uživatele aplikace</option>
          </NativeSelect>
        </Field>
        {v.visibility === "USERS" && (
          <AudiencePickerBase
            value={v.audience}
            onChange={(audience) => set({ audience })}
            api={AUDIENCE_API}
            texts={{
              title: "Publikum události (komu je určena)",
              description: "Událost uvidí přihlášení studenti z vybraných ročníků, tříd a konkrétní studenti, kromě vynechaných. Nevybráno nic = všichni aktivní studenti. Jméno a e-mail se jim předvyplní z účtu.",
              countText: (n) => (n === 0 ? "Událost se nikoho netýká." : `Událost je určena ${n} ${n === 1 ? "studentovi" : "studentům"}.`),
            }}
          />
        )}
      </Section>

      <Section title="Pravidla registrace" testId="section-rules">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="maxItemsPerRegistration" label="Nejvíce termínů na registraci" hint="1 = účastník si vybere jediný termín.">
            <Input id="maxItemsPerRegistration" type="number" min={1} max={50} value={v.maxItemsPerRegistration} onChange={(e) => set({ maxItemsPerRegistration: e.target.value as unknown as number })} className="w-32" />
          </Field>
          <Field id="maxRegistrationsPerEmail" label="Nejvíce registrací na jeden e-mail">
            <Input id="maxRegistrationsPerEmail" type="number" min={1} max={20} value={v.maxRegistrationsPerEmail} onChange={(e) => set({ maxRegistrationsPerEmail: e.target.value as unknown as number })} className="w-32" />
          </Field>
          <Field id="changeDeadlineHours" label="Uzávěrka změn účastníkem (hodin před začátkem)" hint="0 = do začátku termínu. Organizátora se uzávěrka netýká.">
            <Input id="changeDeadlineHours" type="number" min={0} max={8760} value={hours} onChange={(e) => set({ changeDeadlineMinutes: Math.max(0, Number(e.target.value) || 0) * 60 })} className="w-32" />
          </Field>
        </div>
        <Checkbox id="allowGuests" label="Účastník smí přivést další osoby (kapacita se pak počítá podle osob)" checked={v.allowGuests} onChange={(e) => set({ allowGuests: e.target.checked })} />
        {v.allowGuests && (
          <Field id="maxGuests" label="Nejvíce osob navíc">
            <Input id="maxGuests" type="number" min={1} max={50} value={v.maxGuests} onChange={(e) => set({ maxGuests: e.target.value as unknown as number })} className="w-32" />
          </Field>
        )}
      </Section>

      <Section title="Potvrzení registrace a texty" testId="section-texts">
        <Field id="confirmChannel" label="Kde účastník dostane odkaz a kód" hint={channel?.hint}>
          <NativeSelect id="confirmChannel" value={v.confirmChannel} onChange={(e) => set({ confirmChannel: e.target.value as EventConfirmChannelValue })}>
            {CONFIRM_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="confirmationText" label="Text potvrzení" hint="Zobrazí se na potvrzovací stránce a v potvrzovacím e-mailu.">
          <Textarea id="confirmationText" rows={3} value={v.confirmationText} onChange={(e) => set({ confirmationText: e.target.value })} maxLength={5000} />
        </Field>
        <Field id="consentText" label="Text souhlasu se zpracováním osobních údajů" hint="Účastník ho musí zaškrtnout. Prázdné = výchozí text s odkazem na stránku Zpracování osobních údajů.">
          <Textarea id="consentText" rows={3} value={v.consentText} onChange={(e) => set({ consentText: e.target.value })} maxLength={5000} />
        </Field>
      </Section>

      <Section title="Spoluorganizátoři" description="Další učitelé, kteří smějí událost vidět a upravovat. Správce vidí všechny události." testId="section-organizers">
        {v.organizerIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {v.organizerIds.map((id) => (
              <span key={id} data-testid="organizer-chip" className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                {organizerNames.get(id) ?? id}
                <Button type="button" variant="ghost" size="icon" aria-label={`Odebrat ${organizerNames.get(id) ?? id}`} className="h-4 w-4 rounded-full hover:bg-transparent hover:text-danger" onClick={() => set({ organizerIds: v.organizerIds.filter((x) => x !== id) })}>
                  <X className="h-3 w-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
        <Field id="addOrganizer" label="Přidat spoluorganizátora">
          <NativeSelect id="addOrganizer" value="" onChange={(e) => e.target.value && set({ organizerIds: [...v.organizerIds, e.target.value] })} disabled={freeTeachers.length === 0}>
            <option value="">{freeTeachers.length === 0 ? "Žádní další učitelé" : "Vyberte učitele…"}</option>
            {freeTeachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {canDelete && (
            <ConfirmAction
              trigger={<Button type="button" variant="destructive" className="w-full sm:w-auto" data-testid="delete-event">Smazat událost</Button>}
              title="Opravdu smazat událost?"
              description={`Smažete koncept „${values.title}“. Tato akce je nevratná.`}
              actionLabel="Smazat"
              onConfirm={remove}
            />
          )}
        </div>
        <Button type="submit" disabled={saving} data-testid="save-event">
          {saving ? "Ukládám…" : isNew ? "Založit událost" : "Uložit nastavení"}
        </Button>
      </div>
    </form>
  );
}
