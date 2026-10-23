import { Prisma } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { assertNotImpersonating } from "@/lib/session";

/**
 * Obalí tělo server action: chyby vrátí jako `{ ok: false, error }`. Text běžných chyb
 * (validace v kódu) se předá uživateli; chyby databáze se jen zalogují a uživatel
 * dostane obecnou hlášku, aby se neprozradily detaily dotazů.
 * Zároveň odmítne vše v režimu „zobrazit jako“ (jen pro čtení).
 */
export async function safeAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    // Režim „zobrazit jako“ je jen pro čtení: žádná akce zabalená v safeAction (= každá změna dat)
    // se v něm neprovede ani nezapíše do historie ani nepošle e-mail.
    await assertNotImpersonating();
    return { ok: true, data: await fn() };
  } catch (e) {
    // Interní signály Next.js (redirect, notFound) musí projít dál
    if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) {
      throw e;
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return { ok: false, error: "Ve stejnou chvíli proběhla jiná změna. Zkuste to prosím znovu." };
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError ||
      e instanceof Prisma.PrismaClientUnknownRequestError ||
      e instanceof Prisma.PrismaClientValidationError ||
      e instanceof Prisma.PrismaClientInitializationError ||
      e instanceof Prisma.PrismaClientRustPanicError
    ) {
      // eslint-disable-next-line no-console
      console.error(e);
      return { ok: false, error: "Akce se nezdařila (chyba databáze)." };
    }
    return { ok: false, error: e instanceof Error && e.message ? e.message : "Akce se nezdařila." };
  }
}
