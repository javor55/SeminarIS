"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { appUrl, sendEventEmail } from "@/lib/email";
import { prisma, type TxClient } from "@/lib/prisma";
import { safeAction } from "@/lib/safe-action";
import { serializable } from "@/lib/serializable";
import { requirePermission } from "@/lib/session";
import { effectiveFields, validateAnswers } from "@/modules/events/form";
import { itemFullLabel } from "@/modules/events/format";
import { takenWithoutOwn } from "@/modules/events/manage-core";
import { assertEditable, loadManaged } from "@/modules/events/manage";
import { relaxRequired } from "@/modules/events/organizer-core";
import { loadTakenByItem, mergeFields } from "@/modules/events/public-data";
import { placesOf } from "@/modules/events/public-state";
import { answersToStore, capacityError, checkSelectedItems, generateCode, generateToken, hashToken } from "@/modules/events/registration-core";

// Akce organizátora nad registracemi. Každá projde `requirePermission` + `loadManaged` (= `canManageEvent`; cizí událost se tváří,
// že neexistuje) a `safeAction` (režim „zobrazit jako“ je jen pro čtení). Uzávěrky pro organizátora neplatí; kapacitu hlídá,
// ale organizátor ji smí výslovně přeskočit (`force`). Audit se píše ve stejné transakci, e-maily až po commitu a bez osobních
// údajů v historii (jen kód registrace).

const NOT_FOUND = "Registrace neexistuje.";
const refresh = (eventId: string) => revalidatePath(`/events/${eventId}`);

type Fields = Parameters<typeof mergeFields>[0];
type ItemRow = { id: string; label: string | null; startsAt: Date | null; endsAt: Date | null; capacity: number | null; cancelledAt: Date | null };

async function loadRegistration(tx: TxClient, eventId: string, regId: unknown, opts: { allowCancelled?: boolean } = {}) {
  if (typeof regId !== "string") throw new Error(NOT_FOUND);
  const reg = await tx.eventRegistration.findUnique({ where: { id: regId }, include: { items: true } });
  if (!reg || reg.eventId !== eventId) throw new Error(NOT_FOUND);
  if (reg.status === "CANCELLED" && !opts.allowCancelled) throw new Error("Registrace je zrušená.");
  return reg;
}

async function loadEventParts(tx: TxClient, eventId: string) {
  const [items, fields] = await Promise.all([
    tx.eventItem.findMany({ where: { eventId }, orderBy: [{ order: "asc" }, { startsAt: "asc" }] }),
    tx.eventField.findMany({ where: { eventId }, orderBy: [{ order: "asc" }, { key: "asc" }] }),
  ]);
  return { items, fields: mergeFields(fields as Fields) };
}

const labelOf = (items: ItemRow[], id: string) => {
  const i = items.find((x) => x.id === id);
  return i ? itemFullLabel(i) : "Termín";
};
const list = (items: ItemRow[], ids: string[]) => (ids.length ? ids.map((id) => `• ${labelOf(items, id)}`).join("\n") : "—");

type EventMail = { slug: string; title: string; place: string | null };

/** Zprávu o změně posílá organizátor výslovně, proto se posílá i u událostí s potvrzením „jen na obrazovce“. */
async function mail(id: "events.registration.moved" | "events.registration.removed", reg: { email: string; name: string | null; code: string }, ev: EventMail, vars: Record<string, string>): Promise<boolean> {
  const sent = await sendEventEmail(id, [
    { email: reg.email, vars: { jmeno: reg.name ?? reg.email, akce: ev.title, kod: reg.code, odkaz: appUrl(`/akce/${ev.slug}`), misto: ev.place ?? "—", ...vars } },
  ]);
  return sent.sent > 0;
}

export type AddRegistrationInput = {
  itemIds: string[];
  values: Record<string, unknown>;
  /** Přesto přidat, i když se na termín nevejde */
  force: boolean;
  /** Poslat účastníkovi potvrzení s odkazem na správu a kódem */
  sendEmail: boolean;
};

/** Ruční přidání registrace (bez ochrany proti robotům, uzávěrek a limitu na e-mail). Token a kód vznikají stejně jako při veřejné registraci. */
export async function addRegistration(eventId: string, input: AddRegistrationInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!input || typeof input !== "object" || !input.values || typeof input.values !== "object") throw new Error("Neplatný formulář.");
    const token = generateToken();
    const done = await serializable(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const { items, fields } = await loadEventParts(tx, eventId);
      const chosen = checkSelectedItems(input.itemIds, items, items.length);
      if (!chosen.ok) throw new Error((chosen as { error: string }).error);
      const itemIds = (chosen as { ids: string[] }).ids;
      const result = validateAnswers(effectiveFields(relaxRequired(fields), event.allowGuests), input.values, { maxGuests: event.allowGuests ? event.maxGuests : 0 });
      if (!result.ok) throw new Error(Object.values(result.errors)[0] ?? "Formulář není správně vyplněný.");
      const v = result.values;
      const name = typeof v.name === "string" && v.name ? v.name : null;
      const guests = event.allowGuests ? Number(v.guests || 0) : 0;
      if (!input.force) {
        const full = capacityError(itemIds, items, await loadTakenByItem(eventId, tx), guests);
        if (full) throw new Error(full);
      }
      let code = generateCode();
      for (let i = 0; i < 20 && (await tx.eventRegistration.findFirst({ where: { eventId, code }, select: { id: true } })); i++) code = generateCode();
      const registration = await tx.eventRegistration.create({
        data: {
          eventId,
          email: String(v.email),
          name,
          guests,
          answers: answersToStore(v),
          status: "CONFIRMED",
          tokenHash: hashToken(token),
          code,
          consentAt: new Date(),
          items: { create: itemIds.map((itemId) => ({ itemId })) },
        },
      });
      await audit(tx, user, {
        action: "events.registration.create_manual",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: organizátor ručně přidal registraci ${code} (termínů: ${itemIds.length}, osob: ${placesOf(guests)}${input.force ? ", nad kapacitu" : ""})`,
        data: { registrationId: registration.id, itemIds, force: !!input.force },
      });
      return { registration, event, picked: items.filter((i) => itemIds.includes(i.id)) };
    });

    let emailed: boolean | null = null;
    if (input.sendEmail) {
      const { registration: reg, event, picked } = done;
      const sent = await sendEventEmail("events.registration.confirmed", [
        {
          email: reg.email,
          vars: {
            jmeno: reg.name ?? reg.email,
            akce: event.title,
            terminy: picked.map((i) => `• ${itemFullLabel(i)}`).join("\n"),
            odkaz: appUrl(`/akce/${event.slug}/r/${token}`),
            kod: reg.code,
            misto: event.place ?? "—",
            text: event.confirmationText ?? "",
          },
        },
      ]);
      emailed = sent.sent > 0;
      if (!emailed) await prisma.eventRegistration.update({ where: { id: reg.id }, data: { confirmEmailFailed: true } }).catch(() => undefined);
    }
    refresh(eventId);
    return { id: done.registration.id, code: done.registration.code, emailed };
  });
}

/** Úprava údajů registrace organizátorem (e-mail, jméno, osoby navíc, ostatní pole). Termíny se mění přesunem. */
export async function updateRegistration(eventId: string, regId: string, input: { values: Record<string, unknown>; force: boolean }) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!input || typeof input !== "object" || !input.values || typeof input.values !== "object") throw new Error("Neplatný formulář.");
    await serializable(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const reg = await loadRegistration(tx, eventId, regId);
      const { items, fields } = await loadEventParts(tx, eventId);
      const result = validateAnswers(effectiveFields(relaxRequired(fields), event.allowGuests), input.values, { maxGuests: event.allowGuests ? event.maxGuests : 0 });
      if (!result.ok) throw new Error(Object.values(result.errors)[0] ?? "Formulář není správně vyplněný.");
      const v = result.values;
      const name = "name" in v ? (typeof v.name === "string" && v.name ? v.name : null) : reg.name;
      const guests = event.allowGuests && "guests" in v ? Number(v.guests || 0) : reg.guests;
      if (guests > reg.guests && !input.force && reg.status !== "WAITLIST") {
        const own = reg.items.map((i) => i.itemId);
        const full = capacityError(own, items, takenWithoutOwn(await loadTakenByItem(eventId, tx), own, reg.guests), guests);
        if (full) throw new Error(full);
      }
      const kept = Object.fromEntries(Object.entries((reg.answers ?? {}) as Record<string, string | boolean>).filter(([k]) => !(k in v)));
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { email: String(v.email), name, guests, answers: { ...kept, ...answersToStore(v) } } });
      await audit(tx, user, {
        action: "events.registration.update_manual",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: organizátor upravil údaje registrace ${reg.code} (osob: ${placesOf(guests)})`,
        data: { registrationId: reg.id },
      });
    });
    refresh(eventId);
  });
}

export type MoveInput = { fromItemId: string; toItemId: string; force: boolean; sendEmail: boolean };

/** Přesun registrace z jednoho termínu na jiný; kapacitu cílového termínu hlídá, organizátor ji smí potvrzením přeskočit. */
export async function moveRegistration(eventId: string, regId: string, input: MoveInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!input || typeof input.fromItemId !== "string" || typeof input.toItemId !== "string") throw new Error("Vyberte termín.");
    const done = await serializable(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const reg = await loadRegistration(tx, eventId, regId);
      const { items } = await loadEventParts(tx, eventId);
      if (input.fromItemId === input.toItemId) throw new Error("Vyberte jiný termín.");
      const own = reg.items.map((i) => i.itemId);
      if (!own.includes(input.fromItemId)) throw new Error("Registrace na tomto termínu není.");
      const to = items.find((i) => i.id === input.toItemId);
      if (!to) throw new Error("Cílový termín neexistuje.");
      if (to.cancelledAt) throw new Error("Cílový termín je zrušený.");
      if (own.includes(to.id)) throw new Error("Registrace na cílovém termínu už je.");
      if (!input.force && reg.status !== "WAITLIST") {
        const full = capacityError([to.id], items, await loadTakenByItem(eventId, tx), reg.guests);
        if (full) throw new Error(full);
      }
      await tx.eventRegistrationItem.delete({ where: { registrationId_itemId: { registrationId: reg.id, itemId: input.fromItemId } } });
      await tx.eventRegistrationItem.create({ data: { registrationId: reg.id, itemId: to.id } });
      const after = [...own.filter((id) => id !== input.fromItemId), to.id];
      await audit(tx, user, {
        action: "events.registration.move",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: organizátor přesunul registraci ${reg.code} z termínu ${labelOf(items, input.fromItemId)} na ${itemFullLabel(to)}${input.force ? " (nad kapacitu)" : ""}`,
        data: { registrationId: reg.id, from: input.fromItemId, to: to.id, force: !!input.force },
      });
      return { reg, event, items, after };
    });
    const emailed = input.sendEmail
      ? await mail("events.registration.moved", done.reg, done.event, {
          puvodni: labelOf(done.items, input.fromItemId),
          novy: labelOf(done.items, input.toItemId),
          terminy: list(done.items, done.after),
        })
      : null;
    refresh(eventId);
    return { emailed };
  });
}

/** Odebrání z jednoho termínu (registrace na dalších zůstává). Jediný termín registrace se neodebírá, tu je třeba zrušit celou. */
export async function removeFromItem(eventId: string, regId: string, input: { itemId: string; sendEmail: boolean }) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!input || typeof input.itemId !== "string") throw new Error("Vyberte termín.");
    const done = await serializable(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const reg = await loadRegistration(tx, eventId, regId);
      const { items } = await loadEventParts(tx, eventId);
      const own = reg.items.map((i) => i.itemId);
      if (!own.includes(input.itemId)) throw new Error("Registrace na tomto termínu není.");
      if (own.length < 2) throw new Error("Je to jediný termín registrace. Zrušte celou registraci.");
      await tx.eventRegistrationItem.delete({ where: { registrationId_itemId: { registrationId: reg.id, itemId: input.itemId } } });
      await audit(tx, user, {
        action: "events.registration.remove_item",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: organizátor odebral registraci ${reg.code} z termínu ${labelOf(items, input.itemId)}`,
        data: { registrationId: reg.id, itemId: input.itemId },
      });
      return { reg, event, items, after: own.filter((id) => id !== input.itemId) };
    });
    const emailed = input.sendEmail
      ? await mail("events.registration.removed", done.reg, done.event, {
          zmena: `Organizátor vás odebral z termínu: ${labelOf(done.items, input.itemId)}.`,
          terminy: list(done.items, done.after),
        })
      : null;
    refresh(eventId);
    return { emailed };
  });
}

/** Zrušení celé registrace organizátorem (místa se uvolní, záznam zůstane se stavem „Zrušená“). */
export async function cancelRegistrationByOrganizer(eventId: string, regId: string, input: { sendEmail: boolean }) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const done = await serializable(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const reg = await loadRegistration(tx, eventId, regId);
      const { items } = await loadEventParts(tx, eventId);
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await audit(tx, user, {
        action: "events.registration.cancel_manual",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: organizátor zrušil registraci ${reg.code}`,
        data: { registrationId: reg.id },
      });
      return { reg, event, items, own: reg.items.map((i) => i.itemId) };
    });
    const emailed = input?.sendEmail
      ? await mail("events.registration.removed", done.reg, done.event, { zmena: "Organizátor vaši registraci zrušil.", terminy: "—" })
      : null;
    refresh(eventId);
    return { emailed };
  });
}

