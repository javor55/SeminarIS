import { buildCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/datetime";
import { itemFullLabel } from "@/modules/events/format";
import { placesOf } from "@/modules/events/public-state";

// Čistá logika nástrojů organizátora (bez DB): popisky stavů, hledání, přesun a export CSV.
// Použije ji serverová část, záložka Registrace a `scripts/events-organizer-test.ts`.

export type RegStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "WAITLIST";

export const REG_STATUS_LABEL: Record<RegStatus, string> = {
  PENDING: "Čeká na potvrzení",
  CONFIRMED: "Potvrzená",
  CANCELLED: "Zrušená",
  WAITLIST: "Čekací listina",
};

/** Hodnota, kterou organizátor smí nastavit: ne víc než tohle osob navíc (strop proti překlepu) */
export const ORGANIZER_MAX_GUESTS = 50;

export type RegItemRef = { id: string; label: string | null; startsAt: string | null; endsAt: string | null };

export type RegRow = {
  id: string;
  code: string;
  email: string;
  name: string | null;
  guests: number;
  /** Ostatní odpovědi (telefon, poznámka, vlastní pole) podle klíče pole */
  answers: Record<string, string | boolean>;
  status: RegStatus;
  createdAt: string;
  cancelledAt: string | null;
  confirmEmailFailed: boolean;
  /** Kdy organizátor označil příchod (prezence); `null` = nepřišel/neoznačeno */
  attendedAt: string | null;
  items: RegItemRef[];
};

/** Hledání ve jménu, e-mailu, telefonu, kódu a poznámce (bez ohledu na velikost písmen a diakritiku). */
export function matchesQuery(r: Pick<RegRow, "name" | "email" | "code" | "answers">, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const hay = [r.name ?? "", r.email, r.code, str(r.answers.phone), str(r.answers.note)].map(fold).join("\n");
  return hay.includes(q) || hay.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Volná místa termínu pro přesun (vlastní místo registrace se do `taken` nepočítá, protože na cílovém termínu nebyla). `null` = bez omezení. */
export function freeFor(capacity: number | null, taken: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken);
}

/** Text, proč se registrace na termín nevejde; `null`, když se vejde. Organizátor ho smí potvrzením přeskočit. */
export function overCapacityMessage(capacity: number | null, taken: number, guests: number): string | null {
  if (capacity === null) return null;
  const free = Math.max(0, capacity - taken);
  const need = placesOf(guests);
  if (need <= free) return null;
  if (free === 0) return "Termín je plný.";
  return `Na termínu ${free === 1 ? "je volné jen jedno místo" : `jsou volná jen ${free} místa`}, registrace potřebuje ${need}.`;
}

// --- CSV ---

export type CsvField = { key: string; label: string; mode: "REQUIRED" | "OPTIONAL" | "HIDDEN"; type: "TEXT" | "TEXTAREA" | "SELECT" | "CHECKBOX" };

/** Buňka bezpečná pro Excel: text, který by tabulka vyhodnotila jako vzorec (`=`, `@`…), dostane na začátek apostrof. */
export function csvSafe(value: string): string {
  const v = value.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t]/.test(v) && !/^[+-]?[\d\s()./-]+$/.test(v)) return `'${v}`;
  return v;
}

/** Sloupce odpovědí: pole formuláře v pořadí formuláře; skrytá pole jen když k nim existují data. Jméno a počet osob mají vlastní sloupce. */
export function exportFields(fields: readonly CsvField[], rows: readonly Pick<RegRow, "answers">[]): CsvField[] {
  const filled = new Set<string>();
  for (const r of rows) for (const [k, v] of Object.entries(r.answers)) if (v !== "" && v !== false) filled.add(k);
  return fields.filter((f) => f.key !== "name" && f.key !== "guests" && (f.mode !== "HIDDEN" || filled.has(f.key)));
}

/**
 * CSV všech registrací: kód, stav, jméno, e-mail, pole formuláře (i vlastní), počet osob, termíny, čas registrace a zrušení.
 * Zrušené registrace jsou v exportu se stavem „Zrušená“. Oddělovač `;` s BOM jako ostatní exporty.
 */
export function buildRegistrationsCsv(fields: readonly CsvField[], rows: readonly RegRow[]): string {
  const cols = exportFields(fields, rows);
  const head = ["Kód", "Stav", "Jméno", "E-mail", ...cols.map((f) => f.label), "Počet osob", "Termíny", "Registrováno", "Zrušeno"];
  const body = rows.map((r) => [
    r.code,
    REG_STATUS_LABEL[r.status],
    r.name ?? "",
    r.email,
    ...cols.map((f) => {
      const v = r.answers[f.key];
      return v === true ? "ano" : v === false || v === undefined ? "" : String(v);
    }),
    String(placesOf(r.guests)),
    r.items.map((i) => itemFullLabel(i)).join(" | "),
    formatDateTime(r.createdAt),
    r.cancelledAt ? formatDateTime(r.cancelledAt) : "",
  ]);
  return buildCsv([head, ...body].map((row) => row.map(csvSafe)));
}

/** Organizátor smí uložit i neúplný formulář: povinná pole se berou jako volitelná (formát se kontroluje dál; e-mail zůstává povinný). */
export function relaxRequired<T extends { mode: "REQUIRED" | "OPTIONAL" | "HIDDEN" }>(fields: T[]): T[] {
  return fields.map((f) => (f.mode === "REQUIRED" ? { ...f, mode: "OPTIONAL" as const } : f));
}
