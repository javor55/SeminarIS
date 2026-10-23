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
