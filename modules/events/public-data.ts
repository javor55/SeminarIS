import { prisma, type TxClient } from "@/lib/prisma";
import type { EventStatusValue } from "@/modules/events/status";
import type { FormField } from "@/modules/events/form";
import { FIXED_FIELDS } from "@/modules/events/form";
import { placesOf } from "@/modules/events/public-state";
import type { AudienceEntry, AudienceStudent } from "@/modules/core/audience";
import type { User } from "@/lib/types";

// Čtení dat pro veřejnou stránku události. Do klienta jdou jen prosté hodnoty.

/** Registrace, které drží místo (nepotvrzená do vypršení i potvrzená); zrušené a čekací listina ne. */
export const HOLDING_STATUSES = ["PENDING", "CONFIRMED"] as const;

/** Obsazená místa podle termínu, včetně doprovodu (součet `1 + guests`). */
export async function loadTakenByItem(eventId: string, db: Pick<TxClient, "eventRegistrationItem"> = prisma): Promise<Map<string, number>> {
  const rows = await db.eventRegistrationItem.findMany({
    where: { item: { eventId }, registration: { status: { in: [...HOLDING_STATUSES] } } },
    select: { itemId: true, registration: { select: { guests: true } } },
  });
  const taken = new Map<string, number>();
  for (const r of rows) taken.set(r.itemId, (taken.get(r.itemId) ?? 0) + placesOf(r.registration.guests));
  return taken;
}

/** Pole formuláře; pevná pole, která u starší události ještě nevznikla, se doplní výchozím nastavením (bez zápisu do DB). */
export function mergeFields(rows: { key: string; type: FormField["type"]; label: string; mode: FormField["mode"]; options: string[] }[]): FormField[] {
  const have = new Set(rows.map((f) => f.key));
  const fields: FormField[] = [
    ...rows.map((f) => ({ key: f.key, type: f.type, label: f.label, mode: f.mode, options: f.options })),
    ...FIXED_FIELDS.filter((f) => !have.has(f.key)).map((f) => ({ ...f, options: [] as string[] })),
  ];
  const order = new Map(rows.map((f, i) => [f.key, i]));
  fields.sort((a, b) => (order.get(a.key) ?? 1e6) - (order.get(b.key) ?? 1e6));
  return fields;
}

export type PublicItem = {
  id: string;
  label: string | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  order: number;
  capacity: number | null;
  taken: number;
};

export type PublicEvent = NonNullable<Awaited<ReturnType<typeof loadPublicEvent>>>;

export async function loadPublicEvent(slug: string) {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      organizers: { select: { userId: true } },
      audience: true,
      items: { where: { cancelledAt: null }, orderBy: [{ order: "asc" }, { startsAt: "asc" }] },
      fields: { orderBy: [{ order: "asc" }, { key: "asc" }] },
    },
  });
  if (!event) return null;
  const takenBy = await loadTakenByItem(event.id);

  const fields = mergeFields(event.fields);

  const items: PublicItem[] = event.items.map((i) => ({
    id: i.id,
    label: i.label,
    startsAt: i.startsAt?.toISOString() ?? null,
    endsAt: i.endsAt?.toISOString() ?? null,
    note: i.note,
    order: i.order,
    capacity: i.capacity,
    taken: takenBy.get(i.id) ?? 0,
  }));

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle,
    place: event.place,
    contact: event.contact,
    descriptionHtml: event.descriptionHtml,
    imageId: event.imageId,
    imageAlt: event.imageAlt,
    status: event.status as EventStatusValue,
    visibility: event.visibility,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    maxItemsPerRegistration: event.maxItemsPerRegistration,
    allowGuests: event.allowGuests,
    maxGuests: event.maxGuests,
    consentText: event.consentText,
    createdById: event.createdById,
    organizers: event.organizers,
    audienceRoles: event.audienceRoles as string[],
    audience: event.audience as AudienceEntry[],
    items,
    fields,
  };
}

/** Údaje studenta pro publikum události; `null`, když uživatel není aktivní student. */
export async function loadStudentAudienceInfo(user: Pick<User, "id" | "role">): Promise<AudienceStudent | null> {
  if (user.role !== "STUDENT") return null;
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, isActive: true, studyStatus: true, classGroupId: true, classGroup: { select: { grade: true } } },
  });
  if (!u || !u.isActive || u.studyStatus !== "ACTIVE") return null;
  return { id: u.id, classGroupId: u.classGroupId, grade: u.classGroup?.grade ?? null };
}
