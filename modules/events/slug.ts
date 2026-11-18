// Odkaz události (slug): z názvu bez diakritiky, nebo náhodný neuhodnutelný.
// Čistá logika bez DB; unikátnost řeší volající (`uniqueSlug` dostane funkci „už existuje?“).

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 80;

/** „Den otevřených dveří 2027“ → „den-otevrenych-dveri-2027“. */
export function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base.length >= SLUG_MIN ? base : base ? `${base}-akce`.slice(0, SLUG_MAX) : "udalost";
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Neuhodnutelný odkaz: 10 znaků z [a-z0-9]. */
export function randomSlug(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // 256 % 36 != 0, ale zkreslení je zanedbatelné; odkaz není kryptografický klíč, jen se nemá dát uhodnout
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Vypadá odkaz jako náhodný (10 znaků [a-z0-9] bez pomlček)? */
export function looksRandomSlug(slug: string): boolean {
  return /^[a-z0-9]{10}$/.test(slug);
}

/** Při kolizi přidá -2, -3 … (`exists` ověří volnost). */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("Nepodařilo se vytvořit volný odkaz, zvolte jiný.");
}
