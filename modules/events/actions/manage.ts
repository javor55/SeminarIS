"use server";

import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/antibot";
import { audit, PUBLIC_ACTOR } from "@/lib/audit";
import { sendEventEmail, appUrl } from "@/lib/email";
import { isModuleEnabled } from "@/lib/modules";
import type { TxClient } from "@/lib/prisma";
import { safeAction } from "@/lib/safe-action";
import { serializable } from "@/lib/serializable";
import { effectiveFields, validateAnswers } from "@/modules/events/form";
import { itemFullLabel } from "@/modules/events/format";
import { changeWindow, takenWithoutOwn } from "@/modules/events/manage-core";
import { loadTakenByItem, mergeFields } from "@/modules/events/public-data";
import { placesOf } from "@/modules/events/public-state";
import {
  RECOVER_LIMIT,
  RECOVER_WINDOW_SECONDS,
  TOKEN_RE,
  answersToStore,
  capacityError,
  checkSelectedItems,
  clientIp,
  generateToken,
  hashIp,
  hashToken,
  normalizeCode,
} from "@/modules/events/registration-core";

// Veřejné serverové akce: účastník spravuje svou registraci bez přihlášení. Oprávněním je tajný token z odkazu
// (v databázi jen jeho hash). Token se nikdy nelogují, nezapisuje do auditu ani do textu chyb.

const NOT_FOUND = "Registrace nebyla nalezena.";
const CLOSED = "Změny už nejsou možné.";

type Own = Awaited<ReturnType<typeof loadOwn>>;

/** Registrace podle tokenu a adresy události (jinak obecná chyba). Zrušená registrace se nespravuje. */
async function loadOwn(tx: TxClient, slug: unknown, token: unknown) {
  if (typeof slug !== "string" || typeof token !== "string" || !TOKEN_RE.test(token)) throw new Error(NOT_FOUND);
  const reg = await tx.eventRegistration.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      event: { include: { items: { orderBy: [{ order: "asc" }, { startsAt: "asc" }] }, fields: true } },
      items: true,
    },
  });
  if (!reg || reg.event.slug !== slug) throw new Error(NOT_FOUND);
  if (reg.status === "CANCELLED") throw new Error("Registrace už je zrušená.");
  return reg;
}

function ownItems(reg: Own) {
  const ids = new Set(reg.items.map((i) => i.itemId));
  return reg.event.items.filter((i) => ids.has(i.id));
}

/** Změny smí účastník jen do uzávěrky (podle jeho aktuálních termínů). */
function assertOpen(reg: Own) {
  if (!changeWindow(reg.event, ownItems(reg).map((i) => i.startsAt)).open) throw new Error(CLOSED);
}

type ChangeKind = "items" | "answers" | "cancel";

/** E-mail o změně až po commitu. U události s potvrzením „jen na obrazovce“ se neposílá. Selhání registraci neovlivní. */
async function notifyChanged(reg: { email: string; name: string | null }, event: { slug: string; title: string; place: string | null; confirmChannel: string }, token: string, kind: ChangeKind, change: string, items: { label: string | null; startsAt: Date | null; endsAt: Date | null }[]) {
  if (event.confirmChannel === "SCREEN_ONLY") return;
  await sendEventEmail("events.registration.changed", [
    {
      email: reg.email,
      vars: {
        jmeno: reg.name ?? reg.email,
        akce: event.title,
        zmena: change,
        terminy: kind === "cancel" ? "—" : items.map((i) => `• ${itemFullLabel(i)}`).join("\n"),
        odkaz: kind === "cancel" ? appUrl(`/akce/${event.slug}`) : appUrl(`/akce/${event.slug}/r/${token}`),
        misto: event.place ?? "—",
      },
    },
  ]);
}

/** Změna termínu: nový výběr se ověří a zapíše v jedné serializable transakci s kontrolou kapacity (i doprovodu). */
export async function changeRegistrationItems(slug: string, token: string, itemIds: string[]) {
  return safeAction(async () => {
    if (!(await isModuleEnabled("events"))) throw new Error(NOT_FOUND);
    const done = await serializable(async (tx) => {
      const reg = await loadOwn(tx, slug, token);
      assertOpen(reg);
      const ev = reg.event;
      const chosen = checkSelectedItems(itemIds, ev.items, ev.maxItemsPerRegistration);
      if (!chosen.ok) throw new Error((chosen as { error: string }).error);
      const ids = (chosen as { ids: string[] }).ids;
      const own = reg.items.map((i) => i.itemId);
      if (ids.length === own.length && ids.every((id) => own.includes(id))) throw new Error("Termín se nezměnil.");
      const picked = ev.items.filter((i) => ids.includes(i.id));
      if (!changeWindow(ev, picked.map((i) => i.startsAt)).open) throw new Error("Na vybraný termín už nejde přejít, uzávěrka změn pro něj uplynula.");

      // Obsazenost se čte znovu uvnitř transakce; kontrolují se jen nově přidané termíny (vlastní místo se neodečítá dvakrát)
      const added = ids.filter((id) => !own.includes(id));
      const full = capacityError(added, ev.items, await loadTakenByItem(ev.id, tx), reg.guests);
      if (full) throw new Error(full);

      await tx.eventRegistrationItem.deleteMany({ where: { registrationId: reg.id, itemId: { notIn: ids } } });
      if (added.length) await tx.eventRegistrationItem.createMany({ data: added.map((itemId) => ({ registrationId: reg.id, itemId })) });
      const before = ownItems(reg);
      await audit(tx, PUBLIC_ACTOR, {
        action: "events.registration.change_items",
        entityType: "event",
        entityId: ev.id,
        summary: `Událost „${ev.title}“: účastník změnil termín registrace ${reg.code} (termínů: ${ids.length})`,
        data: { registrationId: reg.id, from: own, to: ids },
      });
      return { reg, event: ev, before, after: picked };
    });
    const label = (xs: typeof done.after) => xs.map((i) => itemFullLabel(i)).join(", ");
    await notifyChanged(done.reg, done.event, token, "items", `Změna termínu: původně ${label(done.before)}, nově ${label(done.after)}.`, done.after);
    return { ok: true as const };
  });
}

/** Úprava údajů stejnou validací jako při registraci (e-mail se nemění, je jím účastník dohledatelný). */
export async function updateRegistrationAnswers(slug: string, token: string, values: Record<string, unknown>) {
  return safeAction(async () => {
    if (!values || typeof values !== "object") throw new Error("Neplatný formulář.");
    if (!(await isModuleEnabled("events"))) throw new Error(NOT_FOUND);
    const done = await serializable(async (tx) => {
      const reg = await loadOwn(tx, slug, token);
      assertOpen(reg);
      const ev = reg.event;
      const result = validateAnswers(effectiveFields(mergeFields(ev.fields), ev.allowGuests), { ...values, email: reg.email }, { maxGuests: ev.allowGuests ? ev.maxGuests : 0 });
      if (!result.ok) throw new Error(Object.values(result.errors)[0] ?? "Formulář není správně vyplněný.");
      const v = result.values;
      const name = "name" in v ? (typeof v.name === "string" && v.name ? v.name : null) : reg.name;
      const guests = ev.allowGuests && "guests" in v ? Number(v.guests || 0) : reg.guests;

      // Víc osob = víc míst na všech termínech registrace (vlastní původní místa se odečtou)
      if (guests > reg.guests) {
        const own = ownItems(reg);
        const full = capacityError(own.map((i) => i.id), ev.items, takenWithoutOwn(await loadTakenByItem(ev.id, tx), own.map((i) => i.id), reg.guests), guests);
        if (full) throw new Error(full);
      }
      // Hodnoty polí, která jsou teď skrytá, zůstanou; zobrazená pole se přepíšou
      const kept = Object.fromEntries(Object.entries((reg.answers ?? {}) as Record<string, string | boolean>).filter(([k]) => !(k in v)));
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { name, guests, answers: { ...kept, ...answersToStore(v) } } });
      await audit(tx, PUBLIC_ACTOR, {
        action: "events.registration.update",
        entityType: "event",
        entityId: ev.id,
        summary: `Událost „${ev.title}“: účastník upravil údaje registrace ${reg.code} (osob: ${placesOf(guests)})`,
        data: { registrationId: reg.id },
      });
      return { reg: { email: reg.email, name }, event: ev, items: ownItems(reg) };
    });
    await notifyChanged(done.reg, done.event, token, "answers", "Upravili jste své údaje v registraci.", done.items);
    return { ok: true as const };
  });
}

/** Zrušení registrace: stav CANCELLED a čas zrušení; místa se tím uvolní. */
export async function cancelRegistration(slug: string, token: string) {
  return safeAction(async () => {
    if (!(await isModuleEnabled("events"))) throw new Error(NOT_FOUND);
    const done = await serializable(async (tx) => {
      const reg = await loadOwn(tx, slug, token);
      assertOpen(reg);
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await audit(tx, PUBLIC_ACTOR, {
        action: "events.registration.cancel",
        entityType: "event",
        entityId: reg.event.id,
        summary: `Událost „${reg.event.title}“: účastník zrušil registraci ${reg.code}`,
        data: { registrationId: reg.id },
      });
      return { reg, event: reg.event };
    });
    await notifyChanged(done.reg, done.event, token, "cancel", "Registraci jste zrušili.", []);
    return { ok: true as const };
  });
}

const RECOVER_FAILED = "Registraci se nepodařilo najít. Zkontrolujte kód a e-mail.";

/**
 * „Už jste registrovaní?“: kód + e-mail. Při shodě vystaví NOVÝ token a starý přestane platit (odkaz z e-mailu tím přestane fungovat).
 * Limit 5 pokusů za 15 minut na IP (v databázi jen hash); při neshodě je hláška vždy stejná.
 */
export async function recoverRegistration(slug: string, input: { code: string; email: string }) {
  return safeAction(async () => {
    if (typeof slug !== "string" || !input || typeof input.code !== "string" || typeof input.email !== "string") throw new Error(RECOVER_FAILED);
    if (!(await isModuleEnabled("events"))) throw new Error(RECOVER_FAILED);

    const h = headers();
    // Každý pokus se počítá (i úspěšný), aby nešlo kód hádat
    const limit = await checkRateLimit(`rec:ip:${hashIp(clientIp((n) => h.get(n)))}`, RECOVER_LIMIT, RECOVER_WINDOW_SECONDS);
    if (!limit.allowed) throw new Error("Příliš mnoho pokusů. Zkuste to prosím za 15 minut.");

    const code = normalizeCode(input.code.slice(0, 40));
    const email = input.email.trim().slice(0, 200);
    if (!code || !email) throw new Error(RECOVER_FAILED);
    const token = generateToken();
    const found = await serializable(async (tx) => {
      const reg = await tx.eventRegistration.findFirst({
        where: { code, email: { equals: email, mode: "insensitive" }, status: { not: "CANCELLED" }, event: { slug, status: { not: "DRAFT" } } },
        include: { event: { select: { id: true, title: true } } },
      });
      if (!reg) return false;
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { tokenHash: hashToken(token) } });
      await audit(tx, PUBLIC_ACTOR, {
        action: "events.registration.token_renew",
        entityType: "event",
        entityId: reg.event.id,
        summary: `Událost „${reg.event.title}“: registrace ${reg.code} nalezena přes kód a e-mail, vydán nový odkaz (starý přestal platit)`,
        data: { registrationId: reg.id },
      });
      return true;
    });
    if (!found) throw new Error(RECOVER_FAILED);
    return { token };
  });
}
