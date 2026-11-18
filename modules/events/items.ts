import { schoolDateTime } from "@/lib/datetime";

// Termíny události: ověření vstupu a generátor řady (čistá logika bez DB, použije ji i dialog v prohlížeči).

export const MAX_GENERATED_ITEMS = 100;
const LABEL_MAX = 120;
const NOTE_MAX = 500;
const CAPACITY_MAX = 100000;

export type ItemInput = {
  label: string;
  /** "2026-12-01"; prázdné = termín bez času */
  date: string;
  /** "09:00" */
  start: string;
  /** "09:30"; prázdné = bez konce */
  end: string;
  /** null = bez omezení */
  capacity: number | null;
  note: string;
};

export type CleanItem = { label: string | null; startsAt: Date | null; endsAt: Date | null; capacity: number | null; note: string | null };

export function cleanCapacity(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > CAPACITY_MAX) throw new Error(`Kapacita musí být celé číslo od 1 do ${CAPACITY_MAX}, nebo prázdná (bez omezení).`);
  return n;
}

export function cleanItemInput(input: ItemInput): CleanItem {
  const label = (input.label ?? "").trim();
  const note = (input.note ?? "").trim();
  if (label.length > LABEL_MAX) throw new Error(`Název termínu může mít nejvýše ${LABEL_MAX} znaků.`);
  if (note.length > NOTE_MAX) throw new Error(`Poznámka může mít nejvýše ${NOTE_MAX} znaků.`);
  const capacity = cleanCapacity(input.capacity);
  const hasTime = !!(input.date || input.start);
  if (!hasTime) {
    if (!label) throw new Error("Vyplňte název, nebo datum a čas termínu.");
    return { label, startsAt: null, endsAt: null, capacity, note: note || null };
  }
  if (!input.date || !input.start) throw new Error("U termínu s časem vyplňte datum i začátek.");
  const startsAt = schoolDateTime(input.date, input.start);
  if (!startsAt) throw new Error("Datum nebo začátek termínu nemá správný tvar.");
  let endsAt: Date | null = null;
  if (input.end) {
    endsAt = schoolDateTime(input.date, input.end);
    if (!endsAt) throw new Error("Konec termínu nemá správný tvar.");
    if (endsAt <= startsAt) throw new Error("Konec termínu musí být po jeho začátku.");
  }
  return { label: label || null, startsAt, endsAt, capacity, note: note || null };
}

export type GeneratorInput = { date: string; from: string; to: string; stepMinutes: number; durationMinutes: number; capacity: number | null };
export type Slot = { startsAt: Date; endsAt: Date };

const GENERATOR_STEP_MAX = 24 * 60;

/**
 * Řada termínů od `from` po `stepMinutes`; termín se vejde, pokud jeho konec (začátek + délka) není po `to`.
 * Chybu (špatný vstup nebo víc než 100 termínů) vyhodí jako `Error` s českým textem.
 */
export function generateSlots(input: GeneratorInput): Slot[] {
  const from = schoolDateTime(input.date, input.from);
  const to = schoolDateTime(input.date, input.to);
  if (!from || !to) throw new Error("Vyplňte datum, čas od a čas do.");
  if (to <= from) throw new Error("Čas „do“ musí být po čase „od“.");
  const step = Number(input.stepMinutes);
  const duration = Number(input.durationMinutes);
  if (!Number.isInteger(step) || step < 1 || step > GENERATOR_STEP_MAX) throw new Error("Rozestup termínů musí být celé číslo minut od 1.");
  if (!Number.isInteger(duration) || duration < 1 || duration > GENERATOR_STEP_MAX) throw new Error("Délka termínu musí být celé číslo minut od 1.");
  cleanCapacity(input.capacity);
  const slots: Slot[] = [];
  for (let t = from.getTime(); t + duration * 60000 <= to.getTime(); t += step * 60000) {
    slots.push({ startsAt: new Date(t), endsAt: new Date(t + duration * 60000) });
    if (slots.length > MAX_GENERATED_ITEMS) throw new Error(`Najednou jde vytvořit nejvýše ${MAX_GENERATED_ITEMS} termínů. Zkraťte období nebo zvětšete rozestup.`);
  }
  return slots;
}
