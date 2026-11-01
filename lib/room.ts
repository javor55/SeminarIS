/**
 * Místnost do věty: „učebna 204“ (název „204“), ale „Učebna 2.04“ nebo „učebna 2.04“ (název už slovo
 * „učebna“ obsahuje) se nezdvojí. Názvy jako „Knihovna“ dostanou předponu „učebna“ jen tehdy, když jde o číslo.
 */
export function roomText(room: string): string {
  const r = room.trim();
  if (/^učebn/i.test(r)) return r.charAt(0).toLowerCase() + r.slice(1);
  // Číslo nebo kód místnosti (204, 2.04, B12) = „učebna …“; slovní název (Knihovna, Tělocvična) bez předpony
  return /\d/.test(r) && !/\s/.test(r) ? `učebna ${r}` : r;
}

/** Název místnosti bez předpony „učebna“ (pro e-mailové šablony, kde je „učebna {{ucebna}}“ napsané napevno). */
export function roomBare(room: string): string {
  return room.trim().replace(/^učebna\s+/i, "");
}
