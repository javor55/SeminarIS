import type { TxClient } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { canManageEvent } from "@/modules/events/access";

/** Událost, kterou smí uživatel spravovat; jinak chyba (cizí událost se tváří, že neexistuje). */
export async function loadManaged(tx: TxClient, user: User, id: string) {
  const event = await tx.event.findUnique({ where: { id }, include: { organizers: { select: { userId: true } } } });
  if (!event || !canManageEvent(user, event)) throw new Error("Událost neexistuje nebo k ní nemáte přístup.");
  return event;
}

/** Archivovaná událost se už needituje. */
export function assertEditable(event: { status: string }) {
  if (event.status === "ARCHIVED") throw new Error("Událost je archivovaná, nejde ji upravovat.");
}
