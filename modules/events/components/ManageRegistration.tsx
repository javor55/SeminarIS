"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { cancelRegistration, changeRegistrationItems, updateRegistrationAnswers } from "@/modules/events/actions/manage";
import { validateAnswers, type FormField } from "@/modules/events/form";
import { groupItemsByDay, itemLabel, itemTimeRange } from "@/modules/events/format";
import type { PublicItem } from "@/modules/events/public-data";
import { freePlaces } from "@/modules/events/public-state";

export type ManageItem = PublicItem & {
  /** Je to jeden z termínů registrace */
  own: boolean;
  /** Na termín už nejde přejít (uzávěrka změn pro něj uplynula) */
  locked: boolean;
};

type Props = {
  slug: string;
  token: string;
  items: ManageItem[];
  maxItems: number;
  /** Kolik míst registrace zabírá (účastník a doprovod) */
  places: number;
  /** Zobrazená pole formuláře (bez skrytých, bez e-mailu) */
  fields: FormField[];
  values: Record<string, string | boolean>;
  email: string;
  allowGuests: boolean;
  maxGuests: number;
};

type Mode = "items" | "edit" | "cancel" | null;
const INPUT = "h-11 text-base md:h-9 md:text-sm";

/** Akce účastníka na stránce správy registrace: změnit termín, upravit údaje, zrušit. Token se předává jen serverovým akcím. */
export function ManageRegistration({ slug, token, items, maxItems, places, fields, values: initial, email, allowGuests, maxGuests }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const single = maxItems <= 1;
  const ownIds = useMemo(() => items.filter((i) => i.own).map((i) => i.id), [items]);
  const [selected, setSelected] = useState<string[]>(ownIds);
  const [values, setValues] = useState<Record<string, string | boolean>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function open(m: Mode) {
    setMode(m === mode ? null : m);
    setError(null);
    setNotice(null);
    setErrors({});
  }

  async function run(fn: () => Promise<unknown>, done: string | null) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      unwrap((await fn()) as never);
      setMode(null);
      setNotice(done);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Akce se nezdařila.");
    } finally {
      setPending(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (single) return [id];
      return cur.length >= maxItems ? cur : [...cur, id];
    });
  const unchanged = selected.length === ownIds.length && selected.every((id) => ownIds.includes(id));
  const groups = useMemo(() => groupItemsByDay(items), [items]);

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateAnswers(fields, { ...values, email }, { maxGuests: allowGuests ? maxGuests : 0 });
    setErrors(result.errors);
    if (!result.ok) return;
    void run(() => updateRegistrationAnswers(slug, token, { ...values }), "Údaje jsme uložili.");
  }
  const set = (key: string, v: string | boolean) => {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((er) => (er[key] ? { ...er, [key]: "" } : er));
  };

  return (
    <div className="space-y-4" data-testid="manage-actions">
      {notice && (
        <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm" role="status" data-testid="manage-notice">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" variant={mode === "items" ? "default" : "outline"} className="h-11 md:h-9" onClick={() => open("items")} aria-expanded={mode === "items"} data-testid="action-change">
          <CalendarClock /> Změnit termín
        </Button>
        <Button type="button" variant={mode === "edit" ? "default" : "outline"} className="h-11 md:h-9" onClick={() => open("edit")} aria-expanded={mode === "edit"} data-testid="action-edit">
          <Pencil /> Upravit údaje
        </Button>
        <Button type="button" variant="outline" className="h-11 text-danger hover:text-danger md:h-9" onClick={() => open("cancel")} aria-expanded={mode === "cancel"} data-testid="action-cancel">
          <Trash2 /> Zrušit registraci
        </Button>
      </div>

      {mode === "items" && (
        <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="change-h" data-testid="panel-change">
          <div>
            <h3 id="change-h" className="font-semibold">Změnit termín</h3>
            <p className="text-sm text-muted-foreground">{single ? "Vyberte nový termín." : `Vyberte nejvýše ${maxItems} ${maxItems < 5 ? "termíny" : "termínů"}.`} Vaše místo se uvolní, až změnu uložíte.</p>
          </div>
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.key}>
                {(groups.length > 1 || g.key !== "none") && <h4 className="mb-1 text-sm font-semibold text-muted-foreground">{g.title}</h4>}
                <ul className="divide-y overflow-hidden rounded-xl border">
                  {g.items.map((item) => (
                    <ChangeRow key={item.id} item={item} selected={selected.includes(item.id)} single={single} limitReached={!single && selected.length >= maxItems} need={places} onToggle={() => toggle(item.id)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {error && <ErrorBox text={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="h-11 md:h-9" disabled={pending || unchanged || selected.length === 0} onClick={() => run(() => changeRegistrationItems(slug, token, selected), "Termín jsme změnili.")} data-testid="save-items">
              {pending ? <Loader2 className="animate-spin" /> : null} Uložit změnu
            </Button>
            <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={() => open(null)}>Nechat, jak to je</Button>
          </div>
        </section>
      )}

      {mode === "edit" && (
        <form onSubmit={saveEdit} noValidate className="space-y-4 rounded-xl border bg-card p-4" aria-labelledby="edit-h" data-testid="panel-edit">
          <h3 id="edit-h" className="font-semibold">Upravit údaje</h3>
          <p className="text-sm text-muted-foreground">E-mail ({email}) se nemění; je podle něj možné registraci najít.</p>
          {fields.map((f) => {
            const id = `mf-${f.key}`;
            const required = f.mode === "REQUIRED";
            const v = String(values[f.key] ?? "");
            const label = (
              <span>
                {f.label}
                {required && <span aria-hidden className="text-danger"> *</span>}
              </span>
            );
            return (
              <div key={f.key} className="space-y-1" data-field={f.key}>
                {f.type === "CHECKBOX" ? (
                  <Checkbox id={id} name={f.key} checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} label={label} />
                ) : (
                  <>
                    <label htmlFor={id} className="text-sm font-medium">{label}</label>
                    {f.type === "TEXTAREA" ? (
                      <Textarea id={id} name={f.key} rows={3} className="text-base md:text-sm" value={v} onChange={(e) => set(f.key, e.target.value)} />
                    ) : f.type === "SELECT" ? (
                      <NativeSelect id={id} name={f.key} className="[&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={v} onChange={(e) => set(f.key, e.target.value)}>
                        <option value="">— vyberte —</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input id={id} name={f.key} className={INPUT} value={v} onChange={(e) => set(f.key, e.target.value)} {...(f.key === "phone" ? { type: "tel", inputMode: "tel" as const } : f.key === "guests" ? { inputMode: "numeric" as const } : {})} />
                    )}
                  </>
                )}
                {errors[f.key] && <p className="text-sm text-danger" data-testid={`error-${f.key}`}>{errors[f.key]}</p>}
              </div>
            );
          })}
          {error && <ErrorBox text={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="h-11 md:h-9" disabled={pending} data-testid="save-edit">
              {pending ? <Loader2 className="animate-spin" /> : null} Uložit údaje
            </Button>
            <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={() => open(null)}>Zavřít</Button>
          </div>
        </form>
      )}

      {mode === "cancel" && (
        <section className="space-y-3 rounded-xl border-2 border-danger/50 bg-danger/5 p-4" role="alertdialog" aria-labelledby="cancel-h" data-testid="panel-cancel">
          <h3 id="cancel-h" className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-5 w-5 text-danger" aria-hidden="true" /> Opravdu zrušit registraci?
          </h3>
          <p className="text-sm">Vaše místo se uvolní a registraci už nepůjde obnovit. Případně se můžete znovu zaregistrovat, pokud bude volno.</p>
          {error && <ErrorBox text={error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="destructive" className="h-11 md:h-9" disabled={pending} onClick={() => run(() => cancelRegistration(slug, token), null)} data-testid="confirm-cancel">
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Ano, zrušit registraci
            </Button>
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => open(null)} data-testid="keep-registration">Ponechat registraci</Button>
          </div>
        </section>
      )}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert" data-testid="manage-error">
      {text}
    </p>
  );
}

function ChangeRow({ item, selected, single, limitReached, need, onToggle }: { item: ManageItem; selected: boolean; single: boolean; limitReached: boolean; need: number; onToggle: () => void }) {
  const free = freePlaces(item.capacity, item.taken);
  // vlastní termín je plný jen kvůli vlastnímu místu; ostatní se musí vejít celá registrace včetně doprovodu
  const full = !item.own && free !== null && free < need;
  const timed = !!item.startsAt;
  const title = timed ? itemTimeRange(item) : item.label?.trim() || "Termín";
  const sub = [timed ? item.label?.trim() : null, item.note?.trim()].filter(Boolean).join(" · ");
  const disabled = item.locked || full || (!single && !selected && limitReached);
  const info = (
    <div className="min-w-0 flex-1">
      <div className={cn("font-medium", timed && "tabular-nums")}>
        {title} {item.own && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground" data-testid="item-own">Váš termín</span>}
      </div>
      <div className="text-xs text-muted-foreground">
        {sub && <span>{sub}</span>}
        {sub && " · "}
        {item.locked ? <span data-testid="item-locked">Změny už nejsou možné</span> : full ? <span data-testid="item-full">Plno</span> : free !== null ? <span data-testid="item-free">Volno: {free} z {item.capacity}</span> : <span>Bez omezení</span>}
      </div>
    </div>
  );
  const rowClass = cn("flex min-h-14 items-center gap-3 px-3 py-2", (full || item.locked) && "bg-muted/40 text-muted-foreground");
  if (!single) {
    return (
      <li data-item={item.id} className={rowClass}>
        <label className={cn("flex min-h-11 flex-1 items-center gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          {info}
          <input type="checkbox" checked={selected} disabled={disabled && !selected} onChange={onToggle} aria-label={`Vybrat termín ${itemLabel(item)}`} className="h-6 w-6 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50" data-testid="item-check" />
        </label>
      </li>
    );
  }
  return (
    <li data-item={item.id} className={rowClass}>
      {info}
      <Button type="button" size="sm" variant={selected ? "outline" : "default"} className={cn("h-11 min-w-24 shrink-0 md:h-8", selected && "border-success bg-success/15 text-success hover:bg-success/20 hover:text-success")} disabled={disabled && !selected} aria-pressed={selected} data-testid="item-pick" onClick={onToggle}>
        {selected ? "Vybráno" : full ? "Plno" : "Vybrat"}
      </Button>
    </li>
  );
}
