import { getSetting } from "@/lib/settings-registry";

// Výchozí texty a lhůty modulu z nastavení (`/events/settings`). Čtení je jen pro server.

export const PURGE_DAYS_KEY = "events.purgeAfterDays";
export const DEFAULT_PURGE_DAYS = 90;

export type EventTextDefaults = { consentText: string; confirmationText: string };

/** Výchozí texty souhlasu a potvrzení (prázdný řetězec = nenastaveno). */
export async function loadEventTextDefaults(): Promise<EventTextDefaults> {
  const [consentText, confirmationText] = await Promise.all([
    getSetting<string>("events.defaultConsentText"),
    getSetting<string>("events.defaultConfirmationText"),
  ]);
  return { consentText: String(consentText ?? "").trim(), confirmationText: String(confirmationText ?? "").trim() };
}

/** Lhůta pro smazání osobních údajů v dnech po konci události. */
export async function loadPurgeAfterDays(): Promise<number> {
  const v = await getSetting<number>(PURGE_DAYS_KEY);
  return typeof v === "number" && v >= 1 ? v : DEFAULT_PURGE_DAYS;
}
