// Stav veřejné stránky události: co se v bloku registrace zobrazí a kolik je volných míst.
// Čistá logika bez DB (použije ji stránka, později i odeslání registrace a testy).

export type PublicPhase = "DRAFT" | "NOT_OPEN" | "OPEN" | "ENDED";

export type PhaseInput = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  registrationOpensAt: Date | string | null;
  registrationClosesAt: Date | string | null;
};

/**
 * Fáze registrace: koncept, ještě neotevřená, otevřená, skončená (uzavřená, archivovaná nebo po termínu).
 * Zveřejněná událost je otevřená, dokud nenastane konec období; bez období je otevřená stále.
 */
export function registrationPhase(e: PhaseInput, now: Date = new Date()): PublicPhase {
  if (e.status === "DRAFT") return "DRAFT";
  if (e.status === "CLOSED" || e.status === "ARCHIVED") return "ENDED";
  if (e.registrationOpensAt && now < new Date(e.registrationOpensAt)) return "NOT_OPEN";
  if (e.registrationClosesAt && now > new Date(e.registrationClosesAt)) return "ENDED";
  return "OPEN";
}

/** Zbývající místa; `null` = bez omezení. Záporné hodnoty (přeplnění ručními úpravami) se ořežou na 0. */
export function freePlaces(capacity: number | null, taken: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken);
}

/** Obsazená místa jedné registrace: ona sama a její doprovod. */
export function placesOf(guests: number): number {
  return 1 + Math.max(0, guests);
}
