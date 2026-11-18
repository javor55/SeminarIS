"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/serializable";
import { safeAction } from "@/lib/safe-action";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { plural } from "@/lib/plural";
import { formatDate } from "@/lib/datetime";
import { itemLabel } from "@/modules/events/format";
import { cleanCapacity, cleanItemInput, generateSlots, type GeneratorInput, type ItemInput } from "@/modules/events/items";
import { assertEditable, loadManaged } from "@/modules/events/manage";
import { HOLDING_STATUSES } from "@/modules/events/public-data";
import { notifyPromoted, promoteFromWaitlist } from "@/modules/events/waitlist";

type Tx = Parameters<typeof loadManaged>[0];

async function loadItem(tx: Tx, eventId: string, itemId: string) {
  const item = await tx.eventItem.findUnique({ where: { id: itemId }, include: { _count: { select: { registrations: true } } } });
  if (!item || item.eventId !== eventId) throw new Error("Termín neexistuje.");
  return item;
}

async function nextOrder(tx: Tx, eventId: string) {
  const agg = await tx.eventItem.aggregate({ where: { eventId }, _max: { order: true } });
  return (agg._max.order ?? -1) + 1;
}

const refresh = (eventId: string) => revalidatePath(`/events/${eventId}`);

export async function createItem(eventId: string, input: ItemInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const data = cleanItemInput(input);
    const id = await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const item = await tx.eventItem.create({ data: { eventId, ...data, order: await nextOrder(tx, eventId) } });
      await audit(tx, user, { action: "events.item.create", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: přidán termín ${itemLabel(item)}` });
      return item.id;
    });
    refresh(eventId);
    return { id };
  });
}

export async function updateItem(eventId: string, itemId: string, input: ItemInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const data = cleanItemInput(input);
    const promoted = await serializable(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const before = await loadItem(tx, eventId, itemId);
      // Čekající místo nedrží, kapacitu omezují jen registrace, které místo drží
      const active = await tx.eventRegistrationItem.count({ where: { itemId, registration: { status: { in: [...HOLDING_STATUSES] } } } });
      if (data.capacity !== null && data.capacity < active) throw new Error(`Na termín je zaregistrováno ${active}, kapacitu nejde snížit pod tento počet.`);
      const after = await tx.eventItem.update({ where: { id: itemId }, data });
      await audit(tx, user, { action: "events.item.update", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: upraven termín ${itemLabel(before)} → ${itemLabel(after)}, kapacita ${before.capacity ?? "bez omezení"} → ${after.capacity ?? "bez omezení"}` });
      // Víc míst posune čekající (kapacita může být i zvýšená na „bez omezení“)
      return promoteFromWaitlist(tx, [itemId], user);
    });
    await notifyPromoted(promoted);
    refresh(eventId);
  });
}

async function setCancelled(eventId: string, itemId: string, cancel: boolean) {
  const user = await requirePermission("events.manage.own");
  await prisma.$transaction(async (tx) => {
    const event = await loadManaged(tx, user, eventId);
    assertEditable(event);
    const item = await loadItem(tx, eventId, itemId);
    await tx.eventItem.update({ where: { id: itemId }, data: { cancelledAt: cancel ? new Date() : null } });
    await audit(tx, user, {
      action: cancel ? "events.item.cancel" : "events.item.restore",
      entityType: "event",
      entityId: eventId,
      summary: `Událost „${event.title}“: termín ${itemLabel(item)} ${cancel ? "zrušen" : "obnoven"}`,
    });
  });
  refresh(eventId);
}

export async function cancelItem(eventId: string, itemId: string) {
  return safeAction(() => setCancelled(eventId, itemId, true));
}

export async function restoreItem(eventId: string, itemId: string) {
  return safeAction(() => setCancelled(eventId, itemId, false));
}

/** Smazat jde jen termín bez registrací; jinak ho zrušte. */
export async function deleteItem(eventId: string, itemId: string) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const item = await loadItem(tx, eventId, itemId);
      if (item._count.registrations > 0) throw new Error("Na termín jsou registrace, nejde smazat. Zrušte ho.");
      await tx.eventItem.delete({ where: { id: itemId } });
      await audit(tx, user, { action: "events.item.delete", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: smazán termín ${itemLabel(item)}` });
    });
    refresh(eventId);
  });
}

/** Nastaví pořadí termínů podle pořadí `itemIds` (používá se u termínů bez času). */
export async function reorderItems(eventId: string, itemIds: string[]) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!Array.isArray(itemIds) || new Set(itemIds).size !== itemIds.length) throw new Error("Neplatné pořadí termínů.");
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const existing = await tx.eventItem.findMany({ where: { eventId, id: { in: itemIds } }, select: { id: true } });
      if (existing.length !== itemIds.length) throw new Error("Termín neexistuje.");
      for (let i = 0; i < itemIds.length; i++) await tx.eventItem.update({ where: { id: itemIds[i] }, data: { order: i } });
      await audit(tx, user, { action: "events.item.reorder", entityType: "event", entityId: eventId, summary: `Událost „${event.title}“: změněno pořadí termínů` });
    });
    refresh(eventId);
  });
}

/** Vytvoří řadu termínů (nejvýše 100 najednou). */
export async function generateItems(eventId: string, input: GeneratorInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    const slots = generateSlots(input);
    if (slots.length === 0) throw new Error("V zadaném období se nevejde žádný termín.");
    const capacity = cleanCapacity(input.capacity);
    await prisma.$transaction(async (tx) => {
      const event = await loadManaged(tx, user, eventId);
      assertEditable(event);
      const start = await nextOrder(tx, eventId);
      await tx.eventItem.createMany({ data: slots.map((s, i) => ({ eventId, startsAt: s.startsAt, endsAt: s.endsAt, capacity, order: start + i })) });
      await audit(tx, user, {
        action: "events.item.generate",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: vygenerováno ${slots.length} ${plural(slots.length, "termín", "termíny", "termínů")} na ${formatDate(slots[0].startsAt)}`,
      });
    });
    refresh(eventId);
    return { count: slots.length };
  });
}
