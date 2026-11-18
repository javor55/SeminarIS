import { addDaysToDayKey, schoolDateTime, schoolDayKey, SCHOOL_TIME_ZONE } from "@/lib/datetime";

// Duplikace události: ověření vstupu a posun data o dny (čistá logika bez DB; použije ji i dialog v prohlížeči).

export const MAX_SHIFT_DAYS = 3650;
export const TITLE_MAX = 200;

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: SCHOOL_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * Posune okamžik o celé dny podle kalendáře školy: čas na hodinách zůstane stejný (i přes přechod letního času),
 * např. „9:00 za 14 dní“ je zase v 9:00. Sekundy a milisekundy se zachovají.
 */
export function shiftByDays(d: Date, days: number): Date {
  if (days === 0) return new Date(d);
  const rest = d.getTime() % 60_000;
  const shifted = schoolDateTime(addDaysToDayKey(schoolDayKey(d), days), clock.format(d));
  // jen když zadaný čas ve škole neexistuje (přechod na letní čas ve 2:30): o 24 hodin za den
  return shifted ? new Date(shifted.getTime() + rest) : new Date(d.getTime() + days * 86_400_000);
}

export type DuplicateInput = { title: string; shiftDays: number };

export function cleanDuplicateInput(input: DuplicateInput): { title: string; shiftDays: number } {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) throw new Error("Zadejte název nové události.");
  if (title.length > TITLE_MAX) throw new Error(`Název je příliš dlouhý (nejvýše ${TITLE_MAX} znaků).`);
  const days = typeof input.shiftDays === "number" ? input.shiftDays : Number(input.shiftDays);
  if (!Number.isInteger(days) || Math.abs(days) > MAX_SHIFT_DAYS) throw new Error(`Posun termínů: zadejte celé číslo dní od -${MAX_SHIFT_DAYS} do ${MAX_SHIFT_DAYS}.`);
  return { title, shiftDays: days };
}
