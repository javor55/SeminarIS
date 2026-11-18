import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/modules/events/slug";

// Základní nastavení události: tvar vstupu z formuláře a jeho ověření (čistá logika bez DB).

export type EventVisibilityValue = "PUBLIC" | "USERS";
export type EventConfirmChannelValue = "EMAIL_AND_SCREEN" | "SCREEN_ONLY" | "EMAIL_ONLY";

export const CONFIRM_CHANNELS: { value: EventConfirmChannelValue; label: string; hint: string }[] = [
  { value: "EMAIL_AND_SCREEN", label: "E-mailem i na obrazovce", hint: "Účastník dostane odkaz a kód na obrazovce po registraci a zároveň e-mailem. Doporučeno." },
  { value: "SCREEN_ONLY", label: "Jen na obrazovce", hint: "Žádný e-mail se neodešle. Účastník si odkaz a kód musí uložit, zkopírovat nebo stáhnout." },
  { value: "EMAIL_ONLY", label: "Jen e-mailem", hint: "Na obrazovce se odkaz ani kód neukáže, účastník je najde jen v e-mailu." },
];

/** Co formulář nastavení posílá serveru (data jako ISO text). */
export type EventSettingsInput = {
  title: string;
  subtitle: string;
  place: string;
  contact: string;
  /** Odkaz; prázdný = podle názvu. Ignoruje se, je-li `randomSlug`. */
  slug: string;
  /** Vygenerovat nový náhodný odkaz (10 znaků). */
  randomSlug: boolean;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  visibility: EventVisibilityValue;
  audience: { grades: number[]; classIds: string[]; userIds: string[]; excludeUserIds: string[] };
  maxItemsPerRegistration: number;
  allowGuests: boolean;
  maxGuests: number;
  /** Uzávěrka změn pro účastníka: minuty před začátkem prvního termínu. */
  changeDeadlineMinutes: number;
  maxRegistrationsPerEmail: number;
  confirmChannel: EventConfirmChannelValue;
  confirmationText: string;
  consentText: string;
  organizerIds: string[];
};

export type CleanEventSettings = {
  title: string;
  subtitle: string | null;
  place: string | null;
  contact: string | null;
  slug: string | null;
  randomSlug: boolean;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  visibility: EventVisibilityValue;
  audience: EventSettingsInput["audience"];
  maxItemsPerRegistration: number;
  allowGuests: boolean;
  maxGuests: number;
  changeDeadlineMinutes: number;
  maxRegistrationsPerEmail: number;
  confirmChannel: EventConfirmChannelValue;
  confirmationText: string | null;
  consentText: string | null;
  organizerIds: string[];
};

const text = (v: unknown, max: number, label: string): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new Error(`${label} je příliš dlouhé (nejvýše ${max} znaků).`);
  return s || null;
};

const int = (v: unknown, min: number, max: number, label: string): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label}: zadejte celé číslo od ${min} do ${max}.`);
  return n;
};

const date = (v: unknown, label: string): Date | null => {
  if (v == null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error(`${label}: neplatné datum.`);
  return d;
};

/** Ověří vstup formuláře a vrátí čistá data; chyby jsou česky pro uživatele. */
export function cleanEventSettings(input: EventSettingsInput): CleanEventSettings {
  const title = text(input?.title, 200, "Název");
  if (!title) throw new Error("Zadejte název události.");

  let slug: string | null = null;
  const rawSlug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (!input.randomSlug && rawSlug) {
    if (rawSlug.length < SLUG_MIN || rawSlug.length > SLUG_MAX || !SLUG_PATTERN.test(rawSlug)) {
      throw new Error(`Odkaz smí obsahovat jen malá písmena bez diakritiky, číslice a pomlčky (${SLUG_MIN}–${SLUG_MAX} znaků).`);
    }
    slug = rawSlug;
  }

  const opens = date(input.registrationOpensAt, "Začátek registrace");
  const closes = date(input.registrationClosesAt, "Konec registrace");
  if (opens && closes && closes <= opens) throw new Error("Konec registrace musí být po jejím začátku.");

  if (input.visibility !== "PUBLIC" && input.visibility !== "USERS") throw new Error("Neplatná viditelnost.");
  if (!CONFIRM_CHANNELS.some((c) => c.value === input.confirmChannel)) throw new Error("Neplatný způsob potvrzení registrace.");

  const allowGuests = !!input.allowGuests;
  const maxGuests = allowGuests ? int(input.maxGuests, 1, 50, "Nejvíce osob navíc") : 0;

  return {
    title,
    subtitle: text(input.subtitle, 300, "Podtitulek"),
    place: text(input.place, 300, "Místo"),
    contact: text(input.contact, 300, "Kontakt"),
    slug,
    randomSlug: !!input.randomSlug,
    registrationOpensAt: opens,
    registrationClosesAt: closes,
    visibility: input.visibility,
    audience: input.audience ?? { grades: [], classIds: [], userIds: [], excludeUserIds: [] },
    maxItemsPerRegistration: int(input.maxItemsPerRegistration, 1, 50, "Nejvíce termínů na registraci"),
    allowGuests,
    maxGuests,
    changeDeadlineMinutes: int(input.changeDeadlineMinutes, 0, 60 * 24 * 365, "Uzávěrka změn"),
    maxRegistrationsPerEmail: int(input.maxRegistrationsPerEmail, 1, 20, "Nejvíce registrací na e-mail"),
    confirmChannel: input.confirmChannel,
    confirmationText: text(input.confirmationText, 5000, "Text potvrzení"),
    consentText: text(input.consentText, 5000, "Text souhlasu"),
    organizerIds: [...new Set((input.organizerIds ?? []).filter((x) => typeof x === "string" && x))],
  };
}
