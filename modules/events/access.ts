import type { Prisma } from "@prisma/client";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";

/** Co o události potřebuje kontrola oprávnění (stačí výběr `createdById` + `organizers: { userId }`). */
export type EventAccessInfo = {
  createdById: string;
  organizers: readonly { userId: string }[];
};

/**
 * Smí uživatel událost spravovat? Správce všech událostí vždy; jinak autor a spoluorganizátoři,
 * pokud mají oprávnění spravovat vlastní události.
 */
export function canManageEvent(user: Pick<User, "id" | "role">, event: EventAccessInfo): boolean {
  if (can(user.role, "events.manage.all")) return true;
  if (!can(user.role, "events.manage.own")) return false;
  return event.createdById === user.id || event.organizers.some((o) => o.userId === user.id);
}

/**
 * Podmínka na `prisma.event.findMany`: události, které uživatel smí spravovat a vidět v seznamu.
 * Správce všech vidí všechny; učitel jen svoje a ty, kde je spoluorganizátor; ostatní nic.
 */
export function eventsVisibleWhere(user: Pick<User, "id" | "role">): Prisma.EventWhereInput {
  if (can(user.role, "events.manage.all")) return {};
  if (!can(user.role, "events.manage.own")) return { id: { in: [] } };
  return { OR: [{ createdById: user.id }, { organizers: { some: { userId: user.id } } }] };
}
