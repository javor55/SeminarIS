import { unknownVariables } from "@/lib/email/template";

// Čistá logika hromadného e-mailu účastníkům události (bez databáze): proměnné, očištění textu a plán podle limitu.
// Zprávu posílá `manual.bulk`; platí denní a měsíční limit, hlavní vypínač e-mailů a zápis do EmailLog.

export const BULK_SUBJECT_MAX = 200;
export const BULK_BODY_MAX = 5_000;

export type BulkScope = { kind: "all" } | { kind: "item"; itemId: string };

/** Proměnné, které lze použít v předmětu a textu (u každého příjemce se dosadí jeho hodnota). */
export const BULK_VARIABLES = [
  { name: "jmeno", description: "jméno účastníka (bez jména jeho e-mail)" },
  { name: "akce", description: "název události" },
  { name: "terminy", description: "termíny registrace (jeden na řádek)" },
  { name: "misto", description: "místo konání" },
  { name: "kod", description: "kód registrace" },
  { name: "odkaz", description: "stránka události" },
] as const;

/** Předmět na jeden řádek: zalomení a řídicí znaky se nahradí mezerou (žádné vkládání hlaviček). */
export function cleanSubject(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Text zprávy: sjednocená zalomení, bez řídicích znaků (kromě zalomení a tabulátoru). HTML se escapuje až při odeslání (`textToHtml`). */
export function cleanBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Zkontroluje a očistí vstup; vrací chybu česky nebo hodnoty připravené k odeslání. */
export function validateBulkMessage(subject: unknown, body: unknown): { ok: true; subject: string; body: string } | { ok: false; error: string } {
  if (typeof subject !== "string" || typeof body !== "string") return { ok: false, error: "Vyplňte předmět i text zprávy." };
  const s = cleanSubject(subject);
  const b = cleanBody(body);
  if (!s) return { ok: false, error: "Vyplňte předmět zprávy." };
  if (!b) return { ok: false, error: "Vyplňte text zprávy." };
  if (s.length > BULK_SUBJECT_MAX) return { ok: false, error: `Předmět je příliš dlouhý (nejvýš ${BULK_SUBJECT_MAX} znaků).` };
  if (b.length > BULK_BODY_MAX) return { ok: false, error: `Text je příliš dlouhý (nejvýš ${BULK_BODY_MAX} znaků).` };
  const allowed = BULK_VARIABLES.map((v) => v.name);
  const unknown = [...unknownVariables(s, allowed), ...unknownVariables(b, allowed)];
  if (unknown.length > 0) {
    return { ok: false, error: `Neznámé proměnné: ${[...new Set(unknown)].map((u) => `{{${u}}}`).join(", ")}. Povolené: ${allowed.map((a) => `{{${a}}}`).join(", ")}.` };
  }
  return { ok: true, subject: s, body: b };
}

/** Adresa po smazání osobních údajů (`smazano-…@anonym.invalid`) nebo ukázková adresa: odeslat nelze. */
export const isUnsendableEmail = (email: string) => /\.invalid$/i.test(email.trim());

export type BulkRoom = { dailyLimit: number; today: number; monthlyLimit: number; month: number };

/** Kolik e-mailů se ještě vejde (menší z denní a měsíční rezervy). */
export function roomLeft(u: BulkRoom): number {
  return Math.max(0, Math.min(u.dailyLimit - u.today, u.monthlyLimit - u.month));
}

/**
 * Plán odeslání podle limitu: všem, nebo jen části (prvním N), nebo nic.
 * `limitTo` je volba uživatele po upozornění, že limit nestačí.
 */
export function planBulkSend(recipients: number, room: number, limitTo?: number | null): { ok: true; send: number } | { ok: false; error: string } {
  if (recipients <= 0) return { ok: false, error: "Zpráva nemá žádné příjemce." };
  if (recipients <= room) return { ok: true, send: recipients };
  if (room <= 0) return { ok: false, error: "Denní nebo měsíční limit e-mailů je vyčerpán, nic by se neodeslo." };
  if (limitTo == null) return { ok: false, error: `Limit e-mailů nestačí: příjemců je ${recipients}, vejde se ${room}. Pošlete zprávu jen části příjemců, nebo ji zrušte.` };
  if (!Number.isInteger(limitTo) || limitTo < 1 || limitTo > room) return { ok: false, error: `Počet musí být od 1 do ${room}.` };
  return { ok: true, send: limitTo };
}
