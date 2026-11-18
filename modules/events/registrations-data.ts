import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { canManageEvent } from "@/modules/events/access";
import type { CsvField, RegRow } from "@/modules/events/organizer-core";
import { mergeFields, loadTakenByItem } from "@/modules/events/public-data";
import { ensureFixedFields } from "@/modules/events/fields-db";

// Čtení dat pro záložku Registrace (jen pro organizátora). Do klienta jdou jen prosté hodnoty.

export type OrganizerItem = {
  id: string;
  label: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  /** Obsazená místa včetně doprovodu (součet `1 + osoby navíc` držících registrací) */
  taken: number;
  cancelled: boolean;
};

export type OrganizerFormField = CsvField & { options: string[] };

export type RegistrationsData = {
  event: { id: string; slug: string; title: string; status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED"; allowGuests: boolean; maxGuests: number };
  items: OrganizerItem[];
  fields: OrganizerFormField[];
  rows: RegRow[];
};

/** Data záložky Registrace; `null`, pokud událost neexistuje nebo ji uživatel nesmí spravovat (cizí se tváří, že neexistuje). */
export async function loadRegistrations(user: User, eventId: string): Promise<RegistrationsData | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { organizers: { select: { userId: true } } } });
  if (!event || !canManageEvent(user, event)) return null;
  await ensureFixedFields(prisma, eventId);
  const [items, fieldRows, regs, taken] = await Promise.all([
    prisma.eventItem.findMany({ where: { eventId }, orderBy: [{ order: "asc" }, { startsAt: "asc" }] }),
    prisma.eventField.findMany({ where: { eventId }, orderBy: [{ order: "asc" }, { key: "asc" }] }),
    prisma.eventRegistration.findMany({ where: { eventId }, orderBy: { createdAt: "asc" }, include: { items: { select: { itemId: true } } } }),
    loadTakenByItem(eventId),
  ]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const ref = (i: (typeof items)[number]) => ({ id: i.id, label: i.label, startsAt: i.startsAt?.toISOString() ?? null, endsAt: i.endsAt?.toISOString() ?? null });
  const fields = mergeFields(fieldRows).map((f) => ({ key: f.key, type: f.type, label: f.label, mode: f.mode, options: f.options }));
  const rows: RegRow[] = regs.map((r) => ({
    id: r.id,
    code: r.code,
    email: r.email,
    name: r.name,
    guests: r.guests,
    answers: (r.answers ?? {}) as Record<string, string | boolean>,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    confirmEmailFailed: r.confirmEmailFailed,
    items: r.items
      .map((x) => byId.get(x.itemId))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .sort((a, b) => (a.startsAt?.getTime() ?? 9e15) - (b.startsAt?.getTime() ?? 9e15) || a.order - b.order)
      .map(ref),
  }));
  return {
    event: { id: event.id, slug: event.slug, title: event.title, status: event.status, allowGuests: event.allowGuests, maxGuests: event.maxGuests },
    items: items.map((i) => ({ ...ref(i), capacity: i.capacity, taken: taken.get(i.id) ?? 0, cancelled: !!i.cancelledAt })),
    fields,
    rows,
  };
}
