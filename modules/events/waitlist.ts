import { audit, type AuditActor } from "@/lib/audit";
import { appUrl, sendEventEmail } from "@/lib/email";
import type { TxClient } from "@/lib/prisma";
import { itemFullLabel } from "@/modules/events/format";
import { loadTakenByItem } from "@/modules/events/public-data";
import { selectPromotions } from "@/modules/events/waitlist-core";

// Čekací listina: po uvolnění místa se v TÉŽE transakci posune nejstarší čekající, který se vejde (včetně doprovodu).
// Volá se ze všech míst, kde se místo uvolňuje (zrušení účastníkem i organizátorem, přesun, odebrání z termínu, snížení
// počtu osob, zvýšení kapacity). E-mail se posílá až po commitu (`notifyPromoted`).

export type Promoted = {
  registration: { id: string; email: string; name: string | null; code: string; userId: string | null };
  event: { id: string; slug: string; title: string; place: string | null };
  items: { label: string | null; startsAt: Date | null; endsAt: Date | null }[];
};

/**
 * Posune čekající registrace (stav WAITLIST na CONFIRMED) na termínech `itemIds`. Čeká se podle času registrace (nejstarší první);
 * kdo se nevejde (termín nebo doprovod), se přeskočí a čeká dál. Posouvá se jen u zveřejněných a uzavřených událostí se
 * zachovanými údaji; nezávisle na přepínači čekací listiny (kdo už čeká, na místo nárok má). Audit pod jménem toho, kdo místo uvolnil.
 * Volat v serializable transakci; souběžné uvolnění se tak nepřidělí dvakrát.
 */
export async function promoteFromWaitlist(tx: TxClient, itemIds: readonly string[], actor: AuditActor = null): Promise<Promoted[]> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return [];
  const touched = await tx.eventItem.findMany({ where: { id: { in: ids } }, select: { eventId: true } });
  const out: Promoted[] = [];
  for (const eventId of new Set(touched.map((i) => i.eventId))) {
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, slug: true, title: true, place: true, status: true, purgedAt: true } });
    if (!event || event.purgedAt || (event.status !== "PUBLISHED" && event.status !== "CLOSED")) continue;
    const waiting = await tx.eventRegistration.findMany({
      where: { eventId, status: "WAITLIST", items: { some: { itemId: { in: ids } } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { items: { select: { itemId: true } } },
    });
    if (waiting.length === 0) continue;
    const items = await tx.eventItem.findMany({ where: { eventId }, orderBy: [{ order: "asc" }, { startsAt: "asc" }] });
    // Zrušený termín nikoho nepřijme
    const capacities = new Map(items.map((i) => [i.id, i.cancelledAt ? 0 : i.capacity] as const));
    const picked = selectPromotions(
      waiting.map((r) => ({ id: r.id, guests: r.guests, itemIds: r.items.map((x) => x.itemId) })),
      capacities,
      await loadTakenByItem(eventId, tx)
    );
    for (const id of picked) {
      const reg = waiting.find((r) => r.id === id)!;
      await tx.eventRegistration.update({ where: { id }, data: { status: "CONFIRMED" } });
      await audit(tx, actor, {
        action: "events.registration.promote",
        entityType: "event",
        entityId: eventId,
        summary: `Událost „${event.title}“: registrace ${reg.code} se posunula z čekací listiny (osob: ${1 + reg.guests})`,
        data: { registrationId: id },
      });
      const own = new Set(reg.items.map((x) => x.itemId));
      out.push({
        registration: { id, email: reg.email, name: reg.name, code: reg.code, userId: reg.userId },
        event: { id: eventId, slug: event.slug, title: event.title, place: event.place },
        items: items.filter((i) => own.has(i.id)).map((i) => ({ label: i.label, startsAt: i.startsAt, endsAt: i.endsAt })),
      });
    }
  }
  return out;
}

/** E-mail `events.waitlist.promoted` až po commitu. Posílá se vždy (účastník se jinak o místě nedozví), i při potvrzení „jen na obrazovce“. */
export async function notifyPromoted(promoted: readonly Promoted[]): Promise<void> {
  if (promoted.length === 0) return;
  await sendEventEmail(
    "events.waitlist.promoted",
    promoted.map((p) => ({
      email: p.registration.email,
      userId: p.registration.userId,
      vars: {
        jmeno: p.registration.name ?? p.registration.email,
        akce: p.event.title,
        terminy: p.items.map((i) => `• ${itemFullLabel(i)}`).join("\n"),
        kod: p.registration.code,
        odkaz: appUrl(`/akce/${p.event.slug}`),
        misto: p.event.place ?? "—",
      },
    }))
  );
}
