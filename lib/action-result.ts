// Výsledek server action s chybovou zprávou pro uživatele.
//
// V produkčním buildu Next.js nahrazuje text výjimky vyhozené ze server action obecnou
// hláškou („An error occurred in the Server Components render…“). Akce, jejichž chyby má
// uživatel vidět (validace, kolize, uzávěrky), proto chybu vrací jako hodnotu
// (`safeAction` na serveru) a klient ji převede zpět na výjimku (`unwrap`).

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Na klientu: vrátí data, nebo vyhodí Error s textem chyby ze serveru. */
export function unwrap<T>(result: ActionResult<T>): T {
  // (projekt nemá strict mode, proto bez spoléhání na zúžení typu)
  if (!result.ok) throw new Error((result as { error: string }).error);
  return result.data;
}

/** Na klientu: pro akce předávané jako callback (`() => unwrapAsync(action(...))`). */
export async function unwrapAsync<T>(promise: Promise<ActionResult<T>>): Promise<T> {
  return unwrap(await promise);
}
