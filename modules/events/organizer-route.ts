import { can } from "@/modules/registry";
import { isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { User } from "@/lib/types";
import { canManageEvent } from "@/modules/events/access";

// Společná kontrola pro route handlery organizátora (export CSV, QR kód): jen přihlášený uživatel, který událost smí spravovat.
// Ostatní (i cizí učitel) dostanou 404, aby se nedalo zjistit, že událost existuje.

export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export const notFoundResponse = () => new Response("Nenalezeno", { status: 404, headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });

export async function managedEventOrNull(id: string): Promise<{ user: User; event: { id: string; slug: string; title: string } } | null> {
  if (!(await isModuleEnabled("events"))) return null;
  const user = await getCurrentUser();
  if (!user || !can(user.role, "events.manage.own")) return null;
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, slug: true, title: true, createdById: true, organizers: { select: { userId: true } } } });
  if (!event || !canManageEvent(user, event)) return null;
  return { user, event: { id: event.id, slug: event.slug, title: event.title } };
}
