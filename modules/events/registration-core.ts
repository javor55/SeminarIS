import { createHash, randomBytes, randomInt } from "node:crypto";
import { placesOf } from "@/modules/events/public-state";

// Čistá logika odeslání registrace (bez DB): token, kód, hash IP, kontrola vybraných termínů a kapacity.
// Použije ji serverová akce `registerForEvent` a `scripts/events-registration-test.ts`.

/** Abeceda kódu bez záměnných znaků (bez 0/O, 1/I/L) */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
/** Token: 32 bajtů v base64url = 43 znaků */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Limit registrací z jedné IP adresy za hodinu */
export const IP_LIMIT = 10;
export const IP_WINDOW_SECONDS = 3600;

/** Obnova registrace přes kód a e-mail: nejvýše 5 pokusů za 15 minut z jedné IP adresy */
export const RECOVER_LIMIT = 5;
export const RECOVER_WINDOW_SECONDS = 900;

/** Nový tajný token (jen v odkazu; v databázi je jen jeho hash). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Kód ve tvaru XXX-XXXX z abecedy bez záměnných znaků. */
export function generateCode(): string {
  const ch = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${ch()}${ch()}${ch()}-${ch()}${ch()}${ch()}${ch()}`;
}

/** Kód zadaný člověkem: velká písmena, mezera nebo chybějící pomlčka se odpustí. */
export function normalizeCode(input: string): string {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 7 ? `${c.slice(0, 3)}-${c.slice(3)}` : input.trim().toUpperCase();
}

/** IP adresa z hlavičky `x-forwarded-for` (první položka) nebo `x-real-ip`; bez ní „unknown“. */
export function clientIp(get: (name: string) => string | null): string {
  const fwd = get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || get("x-real-ip")?.trim() || "unknown";
}

/** Hash IP pro počítadla limitů; samotná adresa se nikde neukládá. */
export function hashIp(ip: string, secret: string = process.env.NEXTAUTH_SECRET ?? ""): string {
  return createHash("sha256").update(`${secret}|ip|${ip}`).digest("hex");
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type SubmitItem = { id: string; label: string | null; startsAt: Date | string | null; capacity: number | null; cancelledAt: Date | string | null };

export type ItemsCheck = { ok: true; ids: string[] } | { ok: false; error: string };

/** Kontrola výběru termínů: počet (1 až maximum), jedinečnost, existence a zrušené položky. */
export function checkSelectedItems(selected: unknown, items: readonly SubmitItem[], maxItems: number): ItemsCheck {
  if (!Array.isArray(selected) || selected.some((x) => typeof x !== "string")) return { ok: false, error: "Vyberte termín." };
  const ids = [...new Set(selected as string[])];
  if (ids.length === 0) return { ok: false, error: maxItems <= 1 ? "Vyberte termín." : "Vyberte alespoň jeden termín." };
  if (ids.length > Math.max(1, maxItems)) return { ok: false, error: `Vybrat jde nejvýše ${Math.max(1, maxItems)} ${maxItems === 1 ? "termín" : maxItems < 5 ? "termíny" : "termínů"}.` };
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) return { ok: false, error: "Vybraný termín neexistuje." };
    if (item.cancelledAt) return { ok: false, error: "Vybraný termín byl zrušen. Vyberte jiný." };
  }
  return { ok: true, ids };
}

/** Kapacita: `taken` jsou už obsazená místa (včetně doprovodu); nová registrace potřebuje `1 + guests`. Vrací text chyby, nebo null. */
export function capacityError(ids: readonly string[], items: readonly SubmitItem[], taken: ReadonlyMap<string, number>, guests: number): string | null {
  const need = placesOf(guests);
  for (const id of ids) {
    const item = items.find((i) => i.id === id)!;
    if (item.capacity === null) continue;
    const free = Math.max(0, item.capacity - (taken.get(id) ?? 0));
    if (free <= 0) return "Vybraný termín je už plný. Vyberte jiný.";
    if (need > free) return free === 1 ? "Na vybraném termínu je volné jen jedno místo, pro vás a doprovod nestačí." : `Na vybraném termínu jsou volná jen ${free} místa, pro vás a doprovod nestačí.`;
  }
  return null;
}

/** Souhlas se zpracováním osobních údajů je povinný (server nevěří klientovi). */
export function consentError(consent: unknown): string | null {
  return consent === true ? null : "K registraci je potřeba souhlas se zpracováním osobních údajů.";
}

/**
 * Odpovědi k uložení do JSON: bez e-mailu, jména a počtu osob (mají vlastní sloupce), bez prázdných hodnot
 * a nezaškrtnutých polí. Díky tomu „pole má odpovědi“ znamená, že v něm někdo opravdu něco vyplnil.
 */
export function answersToStore(values: Record<string, string | boolean>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k === "email" || k === "name" || k === "guests") continue;
    if (v === "" || v === false) continue;
    out[k] = v;
  }
  return out;
}
