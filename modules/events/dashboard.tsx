import Link from "next/link";
import { formatDateTime, formatDayRelative, formatTime } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { plural } from "@/lib/plural";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import type { DashboardCard } from "@/modules/server-types";
import type { AdminTodo } from "@/modules/types";
import { Meter } from "@/components/ui/meter";
import { eventsVisibleWhere } from "@/modules/events/access";
import { placesOf } from "@/modules/events/public-state";
import { EventStatusBadge } from "@/modules/events/components/EventStatusBadge";
import { HOLDING_STATUSES } from "@/modules/events/public-data";

// Karta přehledu a úkol administrace modulu Události. Obojí vrací jen to, co smí uživatel vidět (`eventsVisibleWhere`).

/** Kolik událostí karta ukáže. */
const CARD_EVENTS = 4;

/** Moje nadcházející události (jsem autor nebo spoluorganizátor): termín, obsazenost míst, počet registrací. */
export async function getEventsDashboardCards(user: User): Promise<DashboardCard[]> {
  if (!can(user.role, "events.manage.own")) return [];
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      OR: [{ createdById: user.id }, { organizers: { some: { userId: user.id } } }],
      status: { in: ["PUBLISHED", "CLOSED"] },
      items: { some: { cancelledAt: null, startsAt: { gte: now } } },
    },
    select: {
      id: true,
      title: true,
      status: true,
      items: { where: { cancelledAt: null, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, capacity: true } },
    },
  });
  if (events.length === 0) return [];

  // Obsazená místa na nadcházejících termínech, včetně doprovodu
  const itemIds = events.flatMap((e) => e.items.map((i) => i.id));
  const held = await prisma.eventRegistrationItem.findMany({
    where: { itemId: { in: itemIds }, registration: { status: { in: [...HOLDING_STATUSES] } } },
    select: { itemId: true, registrationId: true, registration: { select: { guests: true } } },
  });
  const taken = new Map<string, number>();
  const regsByEvent = new Map<string, Set<string>>();
  const eventOfItem = new Map(events.flatMap((e) => e.items.map((i) => [i.id, e.id] as const)));
  for (const h of held) {
    taken.set(h.itemId, (taken.get(h.itemId) ?? 0) + placesOf(h.registration.guests));
    const eid = eventOfItem.get(h.itemId)!;
    regsByEvent.set(eid, (regsByEvent.get(eid) ?? new Set()).add(h.registrationId));
  }

  const rows = events
    .map((e) => {
      const capacity = e.items.every((i) => i.capacity != null) ? e.items.reduce((s, i) => s + (i.capacity ?? 0), 0) : null;
      const places = e.items.reduce((s, i) => s + (taken.get(i.id) ?? 0), 0);
      return { ...e, next: e.items[0].startsAt!, capacity, places, registrations: regsByEvent.get(e.id)?.size ?? 0 };
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime());
  const shown = rows.slice(0, CARD_EVENTS);
  const first = rows[0];

  return [
    {
      id: "mine",
      title: "Moje události",
      order: 30,
      size: "md",
      href: "/events",
      linkLabel: "Všechny události",
      highlights: [
        {
          id: "next-event",
          order: 30,
          tone: "info",
          icon: "people",
          title: `${formatDayRelative(first.next, now)} ${formatTime(first.next)} ${first.title}`,
          text: first.capacity != null ? `Obsazeno ${first.places} z ${first.capacity} míst` : `${first.registrations} ${plural(first.registrations, "registrace", "registrace", "registrací")}`,
          href: `/events/${first.id}?tab=registrations`,
        },
      ],
      content: (
        <ul className="space-y-3 text-sm" data-testid="events-widget">
          {shown.map((e) => (
            <li key={e.id} className="space-y-1.5 rounded-lg border p-3" data-testid="dashboard-event" data-event={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/events/${e.id}?tab=registrations`} className="min-w-0 font-semibold hover:underline">
                  {e.title}
                </Link>
                <EventStatusBadge status={e.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                Nejbližší termín {formatDateTime(e.next)} · {e.registrations} {plural(e.registrations, "registrace", "registrace", "registrací")}
              </p>
              {e.capacity != null ? (
                <>
                  <Meter value={e.places} max={e.capacity} label={`Obsazeno ${e.places} z ${e.capacity} míst`} />
                  <p className="text-xs text-muted-foreground" data-testid="dashboard-event-occupancy">
                    Obsazeno {e.places} z {e.capacity} {plural(e.capacity, "místa", "míst", "míst")}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground" data-testid="dashboard-event-occupancy">
                  Obsazeno {e.places} {plural(e.places, "místo", "místa", "míst")} (kapacita není omezená)
                </p>
              )}
            </li>
          ))}
          {rows.length > shown.length && <li className="text-xs text-muted-foreground">A dalších {rows.length - shown.length} v seznamu událostí.</li>}
        </ul>
      ),
    },
  ];
}

/** Úkol: událost začíná do 3 dnů a některé registrace nedostaly potvrzovací e-mail (limit, vypnuto, chyba). */
export async function getEventsAdminTodos(user: User): Promise<AdminTodo[]> {
  if (!can(user.role, "events.manage.own")) return [];
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 3600_000);
  const groups = await prisma.eventRegistration.groupBy({
    by: ["eventId"],
    where: {
      confirmEmailFailed: true,
      status: { not: "CANCELLED" },
      event: {
        AND: [eventsVisibleWhere(user)],
        status: { in: ["PUBLISHED", "CLOSED"] },
        confirmChannel: { not: "SCREEN_ONLY" },
        items: { some: { cancelledAt: null, startsAt: { gte: now, lte: soon } } },
      },
    },
    _count: { _all: true },
  });
  const count = groups.reduce((s, g) => s + g._count._all, 0);
  return [
    {
      id: "unsent-confirmations",
      label: "Registrace bez odeslaného potvrzovacího e-mailu u událostí, které začínají do 3 dnů",
      count,
      severity: "warning",
      href: groups.length === 1 ? `/events/${groups[0].eventId}?tab=registrations` : "/events",
      permission: "events.manage.own",
    },
  ];
}
