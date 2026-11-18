"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AntibotField } from "@/components/antibot-field";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { unwrap } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { registerForEvent } from "@/modules/events/actions/public";
import { DEFAULT_CONSENT_TEXT, EMAIL_LABEL, PRIVACY_LINK_TEXT, effectiveFields, validateAnswers, type FormField } from "@/modules/events/form";
import { groupItemsByDay, itemLabel, itemTimeRange } from "@/modules/events/format";
import { freePlaces } from "@/modules/events/public-state";
import type { PublicItem } from "@/modules/events/public-data";

const INPUT = "h-11 text-base md:h-9 md:text-sm";
const AREA = "text-base md:text-sm";

type Props = {
  slug: string;
  items: PublicItem[];
  /** Kolik termínů smí účastník vybrat */
  maxItems: number;
  allowGuests: boolean;
  maxGuests: number;
  fields: FormField[];
  consentText: string | null;
  prefill: { email: string; name: string };
  /** Podepsaný čas zobrazení formuláře (minimální doba vyplnění) */
  renderToken: string;
};

/**
 * Výběr termínů (kompaktní řádky jako zápis studenta) a formulář účastníka na veřejné stránce.
 * Po ověření vyplnění se registrace odešle serverové akci a účastník přejde na stránku „hotovo“.
 */
export function PublicRegistration({ slug, items, maxItems, allowGuests, maxGuests, fields, consentText, prefill, renderToken }: Props) {
  const shown = useMemo(() => effectiveFields(fields, allowGuests).filter((f) => f.mode !== "HIDDEN"), [fields, allowGuests]);
  const [selected, setSelected] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({ email: prefill.email, ...(prefill.name ? { name: prefill.name } : {}) }));
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // nová výzva proti robotům po zamítnutém odeslání (řešení se spotřebuje při každém pokusu)
  const [antibotRound, setAntibotRound] = useState(0);
  // řešení výzvy proti robotům (null = ještě neověřeno) a honeypot (skryté pole, které člověk nevyplní)
  const [solution, setSolution] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const single = maxItems <= 1;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const set = (key: string, v: string | boolean) => {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  function toggle(id: string) {
    setErrors((e) => (e.items ? { ...e, items: "" } : e));
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (single) return [id];
      return cur.length >= maxItems ? cur : [...cur, id];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);
    const result = validateAnswers(fields, { ...values }, { maxGuests: allowGuests ? maxGuests : 0 });
    const next: Record<string, string> = { ...result.errors };
    if (selected.length === 0) next.items = single ? "Vyberte termín." : "Vyberte alespoň jeden termín.";
    if (!consent) next.consent = "K registraci je potřeba souhlas se zpracováním osobních údajů.";
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      const el = first === "items" ? document.getElementById("terminy") : formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setPending(true);
    try {
      const { token } = unwrap(await registerForEvent(slug, { itemIds: selected, values: { ...values }, consent, solution, website, renderToken }));
      // Token je jen v adrese stránky „hotovo“; nikam se neukládá
      router.push(`/akce/${encodeURIComponent(slug)}/hotovo?t=${encodeURIComponent(token)}`);
    } catch (err) {
      setServerError((err as Error).message || "Registraci se nepodařilo odeslat.");
      setSolution(null);
      setAntibotRound((n) => n + 1);
      setPending(false);
    }
  }

  const groups = useMemo(() => groupItemsByDay(items), [items]);
  const noItems = items.length === 0;

  return (
    <div className="space-y-6" data-testid="public-registration">
      <section id="terminy" aria-labelledby="terminy-h" className="space-y-3 scroll-mt-4">
        <div>
          <h2 id="terminy-h" className="text-lg font-semibold">{items.length === 1 && !items[0].startsAt ? "Registrace" : "Vyberte termín"}</h2>
          {!noItems && (
            <p className="text-sm text-muted-foreground" data-testid="items-hint">
              {single ? "Vyberte jeden termín." : `Vyberte nejvýše ${maxItems} ${maxItems < 5 ? "termíny" : "termínů"}`}
              {!single && <span data-testid="items-count"> (vybráno {selected.length})</span>}
            </p>
          )}
        </div>
        {noItems ? (
          <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground" data-testid="no-items">Zatím nejsou k dispozici žádné termíny.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              // plné termíny dole (zašedlé), jinak v pořadí
              const rows = [...g.items].sort((a, b) => Number(isFull(a)) - Number(isFull(b)));
              return (
                <div key={g.key} data-day={g.key}>
                  {(groups.length > 1 || g.key !== "none") && <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{g.title}</h3>}
                  <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                    {rows.map((item) => (
                      <ItemRow key={item.id} item={item} selected={selected.includes(item.id)} single={single} limitReached={!single && selected.length >= maxItems} onToggle={() => toggle(item.id)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {errors.items && <p className="text-sm text-danger" role="alert" data-testid="error-items">{errors.items}</p>}
        {selected.length > 0 && (
          <p className="text-sm" data-testid="selected-summary">
            <span className="text-muted-foreground">Vybráno: </span>
            <span className="font-medium">{selected.map((id) => itemLabel(byId.get(id)!)).join(", ")}</span>
          </p>
        )}
      </section>

      {!noItems && (
        <form ref={formRef} onSubmit={submit} noValidate className="space-y-4" data-testid="registration-form" aria-labelledby="udaje-h">
          <h2 id="udaje-h" className="text-lg font-semibold">Vaše údaje</h2>

          <Row id="rf-email" label={EMAIL_LABEL} required error={errors.email} fieldKey="email">
            <Input id="rf-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="jmeno@domena.cz" className={INPUT} value={String(values.email ?? "")} onChange={(e) => set("email", e.target.value)} />
          </Row>

          {shown.map((f) => {
            const id = `rf-${f.key}`;
            const required = f.mode === "REQUIRED";
            if (f.type === "CHECKBOX") {
              return (
                <div key={f.key} data-field={f.key} className="space-y-1">
                  <Checkbox id={id} name={f.key} checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} label={<span>{f.label}{required && <span aria-hidden className="text-danger"> *</span>}</span>} />
                  {errors[f.key] && <p className="text-sm text-danger">{errors[f.key]}</p>}
                </div>
              );
            }
            const v = String(values[f.key] ?? "");
            return (
              <Row key={f.key} id={id} label={f.label} required={required} error={errors[f.key]} fieldKey={f.key} hint={f.key === "guests" ? `Kolik osob přijde s vámi, nejvýše ${maxGuests}.` : undefined}>
                {f.type === "TEXTAREA" ? (
                  <Textarea id={id} name={f.key} rows={3} className={AREA} value={v} onChange={(e) => set(f.key, e.target.value)} />
                ) : f.type === "SELECT" ? (
                  <NativeSelect id={id} name={f.key} className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={v} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">— vyberte —</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={id}
                    name={f.key}
                    className={INPUT}
                    value={v}
                    onChange={(e) => set(f.key, e.target.value)}
                    {...(f.key === "name" ? { autoComplete: "name" } : f.key === "phone" ? { type: "tel", inputMode: "tel" as const, autoComplete: "tel" } : f.key === "guests" ? { inputMode: "numeric" as const, autoComplete: "off" } : {})}
                  />
                )}
              </Row>
            );
          })}

          <div data-field="consent" className="space-y-1 rounded-lg border bg-muted/30 p-3">
            <Checkbox
              id="rf-consent"
              name="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setErrors((er) => ({ ...er, consent: "" }));
              }}
              labelClassName="items-start"
              className="mt-0.5 h-5 w-5"
              label={
                <span>
                  {consentText?.trim() || DEFAULT_CONSENT_TEXT}{" "}
                  <Link href="/ochrana-udaju" target="_blank" className="text-primary underline">{PRIVACY_LINK_TEXT}</Link>
                  <span aria-hidden className="text-danger"> *</span>
                </span>
              }
            />
            {errors.consent && <p className="text-sm text-danger" data-testid="error-consent">{errors.consent}</p>}
          </div>

          {/* Honeypot: mimo obrazovku, bez zaostření a bez automatického vyplnění; roboti ho vyplní */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Web
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} data-testid="honeypot" />
            </label>
          </div>
          <input type="hidden" name="renderToken" value={renderToken} />

          <AntibotField key={antibotRound} onChange={setSolution} />

          <Button type="submit" size="lg" className="h-12 w-full text-base md:w-auto md:min-w-48" disabled={!solution || pending} data-testid="register-button">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Odesílám…
              </>
            ) : (
              "Registrovat"
            )}
          </Button>
          {serverError && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert" data-testid="submit-error">
              {serverError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function isFull(i: PublicItem): boolean {
  const free = freePlaces(i.capacity, i.taken);
  return free !== null && free <= 0;
}

function ItemRow({ item, selected, single, limitReached, onToggle }: { item: PublicItem; selected: boolean; single: boolean; limitReached: boolean; onToggle: () => void }) {
  const free = freePlaces(item.capacity, item.taken);
  const full = free !== null && free <= 0;
  const timed = !!item.startsAt;
  const title = timed ? itemTimeRange(item) : item.label?.trim() || "Termín";
  const sub = [timed ? item.label?.trim() : null, item.note?.trim()].filter(Boolean).join(" · ");
  const disabled = full || (!single && !selected && limitReached);
  const info = (
    <div className="min-w-0 flex-1">
      <div className={cn("font-medium", timed && "tabular-nums")}>{title}</div>
      <div className="text-xs text-muted-foreground">
        {sub && <span>{sub}</span>}
        {sub && free !== null && " · "}
        {full ? <span data-testid="item-full">Plno</span> : free !== null && <span data-testid="item-free">Volno: {free} z {item.capacity}</span>}
      </div>
    </div>
  );
  const rowClass = cn("flex min-h-14 items-center gap-3 px-3 py-2", full && "bg-muted/40 text-muted-foreground");

  if (!single) {
    return (
      <li data-item={item.id} data-full={full ? "true" : undefined} className={rowClass}>
        <label className={cn("flex min-h-11 flex-1 items-center gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          {info}
          <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle} aria-label={`Vybrat termín ${title}`} className="h-6 w-6 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50" data-testid="item-check" />
        </label>
      </li>
    );
  }
  return (
    <li data-item={item.id} data-full={full ? "true" : undefined} className={rowClass}>
      {info}
      <Button
        type="button"
        size="sm"
        variant={selected ? "outline" : full ? "secondary" : "default"}
        className={cn("h-11 min-w-24 shrink-0 md:h-8", selected && "border-success bg-success/15 text-success hover:bg-success/20 hover:text-success")}
        disabled={full}
        aria-pressed={selected}
        data-testid="item-pick"
        onClick={onToggle}
      >
        {selected ? <><Check className="h-4 w-4" aria-hidden="true" /> Vybráno</> : full ? "Plno" : "Vybrat"}
      </Button>
    </li>
  );
}

function Row({ id, label, required, error, hint, fieldKey, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; fieldKey: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1" data-field={fieldKey}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-danger" data-testid={`error-${fieldKey}`}>{error}</p>}
    </div>
  );
}
