// Filtr seznamu termínů dopisování (učitel, admin): čistá data, parametry URL. Server z něj skládá dotaz,
// klient ho zapisuje do adresy, takže filtrovaný pohled jde sdílet a přežije obnovení stránky.

export const SESSION_PERIODS = ["upcoming", "thisWeek", "nextWeek", "past", "all"] as const;
export type SessionPeriod = (typeof SESSION_PERIODS)[number];

export const SESSION_PERIOD_LABELS: Record<SessionPeriod, string> = {
  upcoming: "Nadcházející",
  thisWeek: "Tento týden",
  nextWeek: "Příští týden",
  past: "Proběhlé",
  all: "Vše",
};

export type SessionFilter = {
  /** Dozorující učitel (id). */
  teacher?: string;
  /** Předmět (id), který termín umožňuje dopsat. */
  subject?: string;
  period: SessionPeriod;
  /** Jen termíny s volným místem (nezrušené, kapacita nenaplněna). */
  freeOnly: boolean;
};

export const DEFAULT_SESSION_FILTER: SessionFilter = { period: "upcoming", freeOnly: false };

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export function parseSessionFilter(params: Params): SessionFilter {
  const period = get(params, "period");
  return {
    teacher: get(params, "teacher"),
    subject: get(params, "subject"),
    period: (SESSION_PERIODS as readonly string[]).includes(period ?? "") ? (period as SessionPeriod) : "upcoming",
    freeOnly: get(params, "free") === "1",
  };
}

/** Parametry URL pro filtr; výchozí hodnoty se nezapisují. */
export function sessionFilterToParams(f: SessionFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.teacher) p.set("teacher", f.teacher);
  if (f.subject) p.set("subject", f.subject);
  if (f.period !== "upcoming") p.set("period", f.period);
  if (f.freeOnly) p.set("free", "1");
  return p;
}

export function isDefaultSessionFilter(f: SessionFilter): boolean {
  return !f.teacher && !f.subject && f.period === "upcoming" && !f.freeOnly;
}
