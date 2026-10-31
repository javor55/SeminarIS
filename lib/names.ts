// Jména osob: pořadí při zobrazení a české řazení. Jedna sdílená pomocná sada pro celou aplikaci.
//
// Pořadí: v tabulkách a seznamech „Příjmení Jméno“ (`"list"`, řadí se podle příjmení), v textu, hláškách,
// e-mailech a pozdravech „Jméno Příjmení“ (`"text"`).
//
// Řazení: `Intl.Collator("cs")` (ICU v Node.js, bez závislosti na databázi). Bartáček < Bartoš < Bartošová,
// S < Š < T, H < CH. Řadí se v JS tam, kde je seznam načtený celý; stránkované řazení uživatelů na serveru
// řadí taky v JS nad úzkým výběrem (id + jména) viz modules/core/users-query.ts. Databázové řazení (výchozí
// kolace Postgresu nebývá česká) se pro jména nepoužívá.

export type PersonName = { firstName: string; lastName: string };

/** „list“ = „Příjmení Jméno“ (tabulky, seznamy), „text“ = „Jméno Příjmení“ (věty, pozdravy, e-maily). */
export function formatName(u: PersonName, mode: "list" | "text" = "text"): string {
  const parts = mode === "list" ? [u.lastName, u.firstName] : [u.firstName, u.lastName];
  return parts.map((p) => p?.trim()).filter(Boolean).join(" ");
}

const collator = new Intl.Collator("cs");

/** České porovnání textů (pro `Array.sort`). */
export function compareCs(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Řazení osob podle příjmení, pak jména. */
export function compareNames(a: PersonName, b: PersonName): number {
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);
}

/** Kopie pole seřazená podle příjmení a jména. */
export function sortByName<T extends PersonName>(items: readonly T[]): T[] {
  return [...items].sort(compareNames);
}

/** Kopie pole seřazená česky podle zvoleného textu (např. název předmětu). */
export function sortByText<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => collator.compare(key(a), key(b)));
}
