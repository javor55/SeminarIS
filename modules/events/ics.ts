// Kalendářní soubor (.ics, RFC 5545) pro registraci na událost. Čistá funkce bez DB a bez přístupu k času:
// čas razítka se předává (výchozí je aktuální okamžik).

const TZ = "Europe/Prague";

export type IcsEvent = {
  id: string;
  title: string;
  place?: string | null;
  /** Adresa stránky události (do popisu) */
  url?: string | null;
};

export type IcsItem = {
  id: string;
  label: string | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

/** Délka události, když termín nemá konec */
const DEFAULT_MINUTES = 60;

/** Pražský čas jako „20270111T090000“ (bez zóny; zóna se uvádí v TZID). */
function localStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escapování hodnoty TEXT: zpětné lomítko, středník, čárka a konce řádků. */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Řádek nejvýše 75 oktetů (UTF-8); delší se zalomí na další řádek začínající mezerou. Znak se nikdy nerozdělí. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > limit) {
      out.push(cur);
      cur = " ";
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

// Definice časové zóny (střední Evropa: změna času poslední neděli v březnu a v říjnu)
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/**
 * Kalendář s jednou událostí (VEVENT) na každý termín, který má čas; termíny bez času se vynechají.
 * Časy jsou v pásmu Europe/Prague, řádky končí CRLF a jsou zalomené na 75 oktetů.
 */
export function buildIcs(event: IcsEvent, items: readonly IcsItem[], now: Date = new Date()): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SeminarIS//Udalosti//CS", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...VTIMEZONE];
  const timed = items.filter((i) => i.startsAt).sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());
  for (const item of timed) {
    const start = new Date(item.startsAt!);
    const end = item.endsAt && new Date(item.endsAt) > start ? new Date(item.endsAt) : new Date(start.getTime() + DEFAULT_MINUTES * 60_000);
    const label = item.label?.trim();
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}-${item.id}@seminaris`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;TZID=${TZ}:${localStamp(start)}`,
      `DTEND;TZID=${TZ}:${localStamp(end)}`,
      `SUMMARY:${escapeIcsText(label ? `${event.title} – ${label}` : event.title)}`
    );
    if (event.place?.trim()) lines.push(`LOCATION:${escapeIcsText(event.place.trim())}`);
    if (event.url) lines.push(`DESCRIPTION:${escapeIcsText(`Událost: ${event.url}`)}`, `URL:${event.url.replace(/[\r\n]/g, "")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
