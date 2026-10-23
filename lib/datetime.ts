// Formátování data a času v časovém pásmu školy. Server na Vercelu běží v UTC,
// proto se časové pásmo uvádí vždy výslovně (stejný výstup na serveru i v prohlížeči).

export const SCHOOL_TIME_ZONE = "Europe/Prague";

const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: SCHOOL_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: SCHOOL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** "út 4. 11. 2026" */
export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

/** "14:05" */
export function formatTime(d: Date | string): string {
  return timeFmt.format(new Date(d));
}

/** "út 4. 11. 2026, 14:00–14:45" */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatDate(start)}, ${formatTime(start)}–${formatTime(end)}`;
}

/** Délka v minutách jako text: 30 → "30 min", 60 → "1 h", 1440 → "24 h" */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "do začátku";
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const dateTimeFmt = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: SCHOOL_TIME_ZONE,
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "23. 10. 2026 08:58" – výchozí formát data a času v tabulkách */
export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
}

// === Kalendářní dny ve školním pásmu (pro denní úlohy a limity) ===

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zoneParts(d: Date) {
  const get: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(d)) if (p.type !== "literal") get[p.type] = Number(p.value);
  return get;
}

/** Odchylka pásma Europe/Prague od UTC v milisekundách v daném okamžiku (zima 1 h, léto 2 h). */
function zoneOffsetMs(d: Date): number {
  const p = zoneParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

export type DayParts = { year: number; month: number; day: number };

/** Kalendářní den v pásmu školy. */
export function schoolDayParts(d: Date = new Date()): DayParts {
  const p = zoneParts(d);
  return { year: p.year, month: p.month, day: p.day };
}

/** "2026-10-23" – den v pásmu školy (klíč pro značky „už proběhlo“). */
export function schoolDayKey(d: Date = new Date()): string {
  const { year, month, day } = schoolDayParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Okamžik půlnoci (začátek dne) v pásmu školy; `offsetDays` posouvá o dny (1 = zítra). */
export function startOfSchoolDay(d: Date = new Date(), offsetDays = 0): Date {
  const { year, month, day } = schoolDayParts(d);
  const guess = Date.UTC(year, month - 1, day + offsetDays);
  let t = guess - zoneOffsetMs(new Date(guess));
  // kolem přechodu na letní/zimní čas odchylka v poledne a o půlnoci nemusí sedět
  const off2 = zoneOffsetMs(new Date(t));
  t = guess - off2;
  return new Date(t);
}

/** Začátek měsíce (1. den půlnoc) v pásmu školy. */
export function startOfSchoolMonth(d: Date = new Date()): Date {
  const { year, month } = schoolDayParts(d);
  const guess = Date.UTC(year, month - 1, 1);
  return new Date(guess - zoneOffsetMs(new Date(guess)));
}

/** "út 4. 11." – den bez roku, pro e-maily a souhrny */
export function formatDayShort(d: Date | string): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: SCHOOL_TIME_ZONE, weekday: "short", day: "numeric", month: "numeric" }).format(new Date(d));
}

/** "2026-10-23" + 3 → "2026-10-26" (kalendářní posun klíče dne, bez vlivu časového pásma) */
export function addDaysToDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
