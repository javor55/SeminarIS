import { registrationPhase, placesOf } from "@/modules/events/public-state";

// Čistá logika správy registrace účastníkem (bez DB): uzávěrka změn a obsazenost při změně vlastní registrace.
// Použije ji serverová akce, stránka správy a `scripts/events-manage-test.ts`.

export type ChangeWindowInput = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  registrationOpensAt: Date | string | null;
  registrationClosesAt: Date | string | null;
  /** Kolik minut před začátkem prvního vybraného termínu se změny uzavírají */
  changeDeadlineMinutes: number;
};

export type ChangeWindow = {
  /** Smí účastník teď měnit a rušit? */
  open: boolean;
  /** Do kdy to smí (u termínu bez času konec registrace; `null` = bez omezení) */
  deadline: Date | null;
};

/**
 * Uzávěrka změn. Platí jen pro účastníka (organizátor smí vždy).
 * - Vybraný termín s časem: do `changeDeadlineMinutes` před začátkem prvního z nich.
 * - Jen termíny bez času: do uzavření registrace.
 * - Koncept, uzavřená a archivovaná událost: změny nejsou možné.
 */
export function changeWindow(event: ChangeWindowInput, starts: readonly (Date | string | null)[], now: Date = new Date()): ChangeWindow {
  if (event.status !== "PUBLISHED") return { open: false, deadline: null };
  const times = starts.filter((s): s is Date | string => !!s).map((s) => new Date(s).getTime());
  if (times.length === 0) {
    return { open: registrationPhase(event, now) === "OPEN", deadline: event.registrationClosesAt ? new Date(event.registrationClosesAt) : null };
  }
  const deadline = new Date(Math.min(...times) - Math.max(0, event.changeDeadlineMinutes) * 60_000);
  return { open: now.getTime() <= deadline.getTime(), deadline };
}

/** Obsazenost bez vlastní registrace: při změně termínu se její místa vlastních (původních) termínů neodečítají dvakrát. */
export function takenWithoutOwn(taken: ReadonlyMap<string, number>, ownItemIds: readonly string[], guests: number): Map<string, number> {
  const out = new Map(taken);
  for (const id of ownItemIds) out.set(id, Math.max(0, (out.get(id) ?? 0) - placesOf(guests)));
  return out;
}
