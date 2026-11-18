import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { formatName, sortByName } from "@/lib/names";
import { draftFromEntries } from "@/modules/core/audience";
import type { AudienceState } from "@/modules/core/components/audience/AudiencePicker";
import { canManageEvent, eventsVisibleWhere } from "@/modules/events/access";
import type { EventStatusValue } from "@/modules/events/status";

// Čtení dat pro stránky modulu. Do klienta jdou jen prosté (serializovatelné) hodnoty.

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: EventStatusValue;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  registrations: number;
  authorName: string;
};

/** Události, které uživatel vidí v seznamu (viz `eventsVisibleWhere`), nejnovější nahoře. */
export async function listEvents(user: User): Promise<EventListItem[]> {
  const rows = await prisma.event.findMany({
    where: eventsVisibleWhere(user),
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      // Zrušené registrace se do počtu nezapočítávají
      _count: { select: { registrations: { where: { status: { not: "CANCELLED" } } } } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    subtitle: e.subtitle,
    status: e.status,
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: e.registrationClosesAt?.toISOString() ?? null,
    registrations: e._count.registrations,
    authorName: formatName(e.createdBy, "list"),
  }));
}

export type EventDetail = Awaited<ReturnType<typeof loadEvent>>;

/** Událost pro detail a nastavení; `null`, pokud neexistuje nebo ji uživatel nesmí spravovat. */
export async function loadEvent(user: User, id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      organizers: { select: { userId: true } },
      audience: { include: { classGroup: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
      _count: { select: { registrations: true } },
    },
  });
  if (!event || !canManageEvent(user, event)) return null;

  const person = (u: { id: string; firstName: string; lastName: string; email: string }) => ({ id: u.id, name: formatName(u, "list"), email: u.email });
  const audience: AudienceState = {
    draft: draftFromEntries(event.audience),
    users: sortByName(event.audience.filter((a) => a.type === "USER" && a.user).map((a) => a.user!)).map(person),
    excluded: sortByName(event.audience.filter((a) => a.type === "EXCLUDE_USER" && a.user).map((a) => a.user!)).map(person),
  };
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle ?? "",
    place: event.place ?? "",
    contact: event.contact ?? "",
    status: event.status as EventStatusValue,
    visibility: event.visibility,
    imageId: event.imageId,
    imageAlt: event.imageAlt ?? "",
    descriptionHtml: event.descriptionHtml,
    registrationOpensAt: event.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: event.registrationClosesAt?.toISOString() ?? null,
    maxItemsPerRegistration: event.maxItemsPerRegistration,
    allowGuests: event.allowGuests,
    maxGuests: event.maxGuests,
    changeDeadlineMinutes: event.changeDeadlineMinutes,
    maxRegistrationsPerEmail: event.maxRegistrationsPerEmail,
    confirmChannel: event.confirmChannel,
    confirmationText: event.confirmationText ?? "",
    consentText: event.consentText ?? "",
    organizerIds: event.organizers.map((o) => o.userId),
    createdById: event.createdById,
    authorName: formatName(event.createdBy, "list"),
    registrationCount: event._count.registrations,
    audience,
  };
}

/** Učitelé, které jde přidat jako spoluorganizátory. */
export async function listTeachers() {
  const teachers = await prisma.user.findMany({ where: { role: "TEACHER", isActive: true }, select: { id: true, firstName: true, lastName: true } });
  return sortByName(teachers).map((t) => ({ id: t.id, name: formatName(t, "list") }));
}

export type EventItemRow = {
  id: string;
  label: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  note: string | null;
  order: number;
  cancelled: boolean;
  /** Počet aktivních (nezrušených) registrací na termín */
  taken: number;
  /** Počet všech registrací vč. zrušených (smazat jde jen termín bez nich) */
  registrations: number;
};

/** Termíny události s obsazeností (zrušené registrace se nepočítají). */
export async function loadEventItems(eventId: string): Promise<EventItemRow[]> {
  const rows = await prisma.eventItem.findMany({
    where: { eventId },
    orderBy: [{ order: "asc" }, { startsAt: "asc" }],
    include: { _count: { select: { registrations: true } } },
  });
  const taken = await prisma.eventRegistrationItem.groupBy({
    by: ["itemId"],
    where: { item: { eventId }, registration: { status: { not: "CANCELLED" } } },
    _count: { _all: true },
  });
  const takenBy = new Map(taken.map((t) => [t.itemId, t._count._all]));
  return rows.map((i) => ({
    id: i.id,
    label: i.label,
    startsAt: i.startsAt?.toISOString() ?? null,
    endsAt: i.endsAt?.toISOString() ?? null,
    capacity: i.capacity,
    note: i.note,
    order: i.order,
    cancelled: !!i.cancelledAt,
    taken: takenBy.get(i.id) ?? 0,
    registrations: i._count.registrations,
  }));
}
