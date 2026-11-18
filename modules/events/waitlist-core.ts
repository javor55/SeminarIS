import { placesOf } from "@/modules/events/public-state";

// Čistá logika čekací listiny (bez DB): kdo z čekajících se po uvolnění místa vejde. Použije ji `waitlist.ts`
// a `scripts/events-waitlist-test.ts`.

export type WaitCandidate = { id: string; guests: number; itemIds: readonly string[] };

/**
 * Z čekajících (seřazených od nejstaršího) vybere ty, kteří se vejdou na VŠECHNY své termíny včetně doprovodu.
 * Kdo se nevejde, se přeskočí (menší registrace za ním ano) a zůstane čekat; každý posunutý zabere místo, takže další
 * kandidáti počítají s už sníženou kapacitou. `capacities`: null = bez omezení; `taken` se nemění.
 */
export function selectPromotions(candidates: readonly WaitCandidate[], capacities: ReadonlyMap<string, number | null>, taken: ReadonlyMap<string, number>): string[] {
  const used = new Map(taken);
  const out: string[] = [];
  for (const c of candidates) {
    const need = placesOf(c.guests);
    const fits = c.itemIds.length > 0 && c.itemIds.every((id) => {
      if (!capacities.has(id)) return false;
      const cap = capacities.get(id)!;
      return cap === null || cap - (used.get(id) ?? 0) >= need;
    });
    if (!fits) continue;
    for (const id of c.itemIds) used.set(id, (used.get(id) ?? 0) + need);
    out.push(c.id);
  }
  return out;
}

/** Registrace se na čekací listinu nikdy nedostane, když se se svým doprovodem nevejde ani na prázdný termín. Vrací text chyby, nebo null. */
export function waitlistImpossible(ids: readonly string[], items: readonly { id: string; capacity: number | null }[], guests: number): string | null {
  const need = placesOf(guests);
  for (const id of ids) {
    const cap = items.find((i) => i.id === id)?.capacity ?? null;
    if (cap !== null && need > cap) return `Na vybraném termínu je celkem ${cap} ${cap === 1 ? "místo" : cap < 5 ? "místa" : "míst"}, pro vás a doprovod nestačí ani po uvolnění.`;
  }
  return null;
}
