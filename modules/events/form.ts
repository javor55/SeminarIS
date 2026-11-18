// Formulář účastníka: pevná pole, ověření odpovědí a jejich tvar (čistá logika bez DB a bez importů z Next.js,
// proto ji pouští i `scripts/events-form-test.ts`).

export type FieldType = "TEXT" | "TEXTAREA" | "SELECT" | "CHECKBOX";
export type FieldMode = "REQUIRED" | "OPTIONAL" | "HIDDEN";

export type FormField = {
  key: string;
  type: FieldType;
  label: string;
  mode: FieldMode;
  options: string[];
};

export const MODE_LABEL: Record<FieldMode, string> = { REQUIRED: "Povinné", OPTIONAL: "Volitelné", HIDDEN: "Skryté" };
export const TYPE_LABEL: Record<FieldType, string> = { TEXT: "Krátký text", TEXTAREA: "Dlouhý text", SELECT: "Výběr z možností", CHECKBOX: "Zaškrtávací pole" };

export const TEXT_MAX = 200;
export const TEXTAREA_MAX = 2000;
export const EMAIL_MAX = 200;
export const LABEL_MAX = 100;
export const OPTION_MAX = 100;
export const OPTIONS_LIMIT = 30;
export const CUSTOM_FIELDS_LIMIT = 20;

/** Pevná pole v pořadí, v jakém se zakládají (e-mail tu není: je vždy povinný a vždy první). */
export const FIXED_FIELDS: { key: string; type: FieldType; label: string; mode: FieldMode }[] = [
  { key: "name", type: "TEXT", label: "Jméno a příjmení", mode: "REQUIRED" },
  { key: "phone", type: "TEXT", label: "Telefon", mode: "OPTIONAL" },
  { key: "school", type: "TEXT", label: "Současná škola", mode: "HIDDEN" },
  { key: "grade", type: "TEXT", label: "Ročník", mode: "HIDDEN" },
  { key: "guests", type: "TEXT", label: "Počet osob", mode: "HIDDEN" },
  { key: "note", type: "TEXTAREA", label: "Poznámka", mode: "OPTIONAL" },
];

export const EMAIL_LABEL = "E-mail";
export const DEFAULT_CONSENT_TEXT = "Souhlasím se zpracováním osobních údajů za účelem registrace na tuto událost.";
export const PRIVACY_LINK_TEXT = "Zpracování osobních údajů";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\d\s./-]{6,25}$/;

/**
 * Pole tak, jak se opravdu zobrazí: pole „Počet osob“ se řídí nastavením události (`allowGuests`),
 * ne vlastním režimem; je-li doprovod povolen, je volitelné.
 */
export function effectiveFields<T extends FormField>(fields: T[], allowGuests: boolean): T[] {
  return fields.map((f) => (f.key === "guests" ? { ...f, mode: (allowGuests ? "OPTIONAL" : "HIDDEN") as FieldMode } : f));
}

export type ValidateOptions = {
  /** Nejvyšší počet osob navíc (pole `guests`); výchozí 0 */
  maxGuests?: number;
};

export type ValidationResult = {
  ok: boolean;
  /** Chyby podle klíče pole (`email`, `name`, `custom_1`…) */
  errors: Record<string, string>;
  /** Očištěné hodnoty zobrazených polí (text oříznutý, zaškrtnutí jako boolean) */
  values: Record<string, string | boolean>;
};

/** Ověří odpovědi účastníka proti polím formuláře. Skrytá pole se ignorují. */
export function validateAnswers(fields: FormField[], input: Record<string, unknown>, options: ValidateOptions = {}): ValidationResult {
  const errors: Record<string, string> = {};
  const values: Record<string, string | boolean> = {};

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) errors.email = "Vyplňte e-mail.";
  else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) errors.email = "Zadejte e-mail ve tvaru jmeno@domena.cz.";
  else values.email = email;

  for (const f of fields) {
    if (f.mode === "HIDDEN") continue;
    const required = f.mode === "REQUIRED";
    const raw = input[f.key];

    if (f.type === "CHECKBOX") {
      const checked = raw === true || raw === "true" || raw === "on";
      if (required && !checked) errors[f.key] = `Potvrďte pole „${f.label}“.`;
      else values[f.key] = checked;
      continue;
    }

    const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
    if (!text) {
      if (required) errors[f.key] = `Vyplňte pole „${f.label}“.`;
      else values[f.key] = "";
      continue;
    }

    if (f.key === "guests") {
      const n = Number(text);
      const max = options.maxGuests ?? 0;
      if (!/^\d+$/.test(text) || n > max) errors[f.key] = max > 0 ? `Počet osob navíc musí být celé číslo od 0 do ${max}.` : "Osoby navíc nejde přidat.";
      else values[f.key] = String(n);
      continue;
    }

    if (f.type === "SELECT") {
      if (!f.options.includes(text)) errors[f.key] = `Vyberte jednu z nabízených možností.`;
      else values[f.key] = text;
      continue;
    }

    const max = f.type === "TEXTAREA" ? TEXTAREA_MAX : TEXT_MAX;
    if (text.length > max) errors[f.key] = `Pole „${f.label}“ může mít nejvýše ${max} znaků.`;
    else if (f.key === "phone" && !PHONE_RE.test(text)) errors[f.key] = "Zadejte telefon, např. +420 123 456 789.";
    else values[f.key] = text;
  }

  return { ok: Object.keys(errors).length === 0, errors, values };
}

/** Ověří popisek a možnosti vlastního pole; vrátí očištěné hodnoty nebo vyhodí chybu s českým textem. */
export function cleanFieldDefinition(input: { type: FieldType; label: string; options?: string[] }): { label: string; options: string[] } {
  const label = (input.label ?? "").trim();
  if (!label) throw new Error("Vyplňte popisek pole.");
  if (label.length > LABEL_MAX) throw new Error(`Popisek může mít nejvýše ${LABEL_MAX} znaků.`);
  if (input.type !== "SELECT") return { label, options: [] };
  const options: string[] = [];
  for (const raw of input.options ?? []) {
    const o = String(raw).trim();
    if (!o) continue;
    if (o.length > OPTION_MAX) throw new Error(`Možnost může mít nejvýše ${OPTION_MAX} znaků.`);
    if (!options.includes(o)) options.push(o);
  }
  if (options.length < 2) throw new Error("Výběr potřebuje alespoň dvě různé možnosti.");
  if (options.length > OPTIONS_LIMIT) throw new Error(`Výběr může mít nejvýše ${OPTIONS_LIMIT} možností.`);
  return { label, options };
}

/** Další klíč vlastního pole: `custom_<n>`, kde n je o jedna vyšší než největší dosavadní. */
export function nextCustomKey(keys: string[]): string {
  const max = keys.reduce((m, k) => {
    const n = /^custom_(\d+)$/.exec(k);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `custom_${max + 1}`;
}
