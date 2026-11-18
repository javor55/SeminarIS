"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { appUrl, isValidEmail, sendEventEmail } from "@/lib/email";
import { getEmailUsage, loadEmailConfig } from "@/lib/email/settings";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/safe-action";
import { requirePermission } from "@/lib/session";
import { plural } from "@/lib/plural";
import { isUnsendableEmail, planBulkSend, roomLeft, validateBulkMessage, type BulkScope } from "@/modules/events/bulk-core";
import { itemFullLabel } from "@/modules/events/format";
import { assertEditable, loadManaged } from "@/modules/events/manage";

// Hromadný e-mail účastníkům události (všem aktivním registracím nebo jednomu termínu). Posílá se přes `manual.bulk`, takže platí
// hlavní vypínač e-mailů, denní a měsíční limit a zápis do EmailLog. Zrušené registrace a registrace po smazání osobních údajů
// se přeskočí. Oprávnění: `canManageEvent` (přes `loadManaged`); v režimu „zobrazit jako“ jen čtení (`safeAction`).

export type BulkPreviewData = {
  recipients: number;
  // Aktivní registrace v rozsahu, ze kterých příjemci vznikli (před odfiltrováním)
  registrations: number;
  skipped: { reason: string; count: number }[];
  dailyLimit: number;
  today: number;
  monthlyLimit: number;
  month: number;
  room: number;
  /** Důvod, proč nejde posílat vůbec (vypnuté e-maily, smazané údaje, bez příjemců) */
  blocked: string | null;
  scopeLabel: string;
};

type Recipient = { regId: string; email: string; userId: string | null; vars: Record<string, string> };

const ACTIVE = ["CONFIRMED", "PENDING", "WAITLIST"] as const;

function parseScope(raw: unknown): BulkScope {
  if (raw && typeof raw === "object" && (raw as { kind?: unknown }).kind === "item" && typeof (raw as { itemId?: unknown }).itemId === "string") {
    return { kind: "item", itemId: (raw as { itemId: string }).itemId };
  }
  return { kind: "all" };
}

/** Příjemci podle rozsahu: aktivní (nezrušené) registrace, bez smazaných nebo neplatných adres a bez opakovaných adres; nejstarší registrace první. */
async function collect(user: Awaited<ReturnType<typeof requirePermission>>, eventId: string, scope: BulkScope) {
  const event = await loadManaged(prisma, user, eventId);
  assertEditable(event);
  let scopeLabel = "všechny aktivní registrace";
  if (scope.kind === "item") {
    const item = await prisma.eventItem.findFirst({ where: { id: scope.itemId, eventId } });
    if (!item) throw new Error("Termín neexistuje.");
    scopeLabel = itemFullLabel(item);
  }
  const regs = await prisma.eventRegistration.findMany({
    where: { eventId, status: { in: [...ACTIVE] }, cancelledAt: null, ...(scope.kind === "item" ? { items: { some: { itemId: scope.itemId } } } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { items: { include: { item: true } } },
  });
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const r of regs) {
    const key = r.email.trim().toLowerCase();
    if (event.purgedAt || isUnsendableEmail(r.email)) skip("osobní údaje už jsou smazané");
    else if (!isValidEmail(r.email.trim())) skip("neplatná e-mailová adresa");
    else if (seen.has(key)) skip("stejná adresa už je mezi příjemci");
    else {
      seen.add(key);
      const items = r.items.map((x) => x.item).filter((i) => !i.cancelledAt).sort((a, b) => (a.startsAt?.getTime() ?? 9e15) - (b.startsAt?.getTime() ?? 9e15) || a.order - b.order);
      recipients.push({
        regId: r.id,
        email: r.email.trim(),
        userId: r.userId,
        vars: {
          jmeno: r.name ?? r.email,
          akce: event.title,
          terminy: items.length ? items.map((i) => `• ${itemFullLabel(i)}`).join("\n") : "—",
          misto: event.place ?? "—",
          kod: r.code,
          odkaz: appUrl(`/akce/${event.slug}`),
        },
      });
    }
  }
  return { event, scopeLabel, registrations: regs.length, recipients, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
}

async function limits() {
  const cfg = await loadEmailConfig();
  const usage = await getEmailUsage(cfg.settings);
  let blocked: string | null = null;
  if (!cfg.settings.enabled) blocked = "E-mailová upozornění jsou vypnutá (hlavní vypínač v Administraci, Upozornění), zpráva by se neodeslala.";
  else if (!cfg.status.configured) blocked = `Odesílání e-mailů není nastavené (chybí ${cfg.status.missing.join(", ")}).`;
  return { usage, blocked };
}

/** Náhled před odesláním: počet příjemců, kolik se jich vejde do limitu a proč případně nejde posílat. */
export async function previewEventBulkEmail(eventId: string, rawScope: unknown) {
  return safeAction(async (): Promise<BulkPreviewData> => {
    const user = await requirePermission("events.manage.own");
    const c = await collect(user, eventId, parseScope(rawScope));
    const { usage, blocked } = await limits();
    const room = roomLeft(usage);
    return {
      recipients: c.recipients.length,
      registrations: c.registrations,
      skipped: c.skipped,
      dailyLimit: usage.dailyLimit,
      today: usage.today,
      monthlyLimit: usage.monthlyLimit,
      month: usage.month,
      room,
      blocked: blocked ?? (c.recipients.length === 0 ? "Vybraný rozsah nemá žádné příjemce." : room === 0 ? "Denní nebo měsíční limit e-mailů je vyčerpán, nic by se neodeslalo." : null),
      scopeLabel: c.scopeLabel,
    };
  });
}

export type BulkSendInput = {
  scope: BulkScope;
  subject: string;
  body: string;
  /** Počet příjemců z náhledu; když se mezitím změnil, odeslání se odmítne */
  expected: number;
  /** Při nedostatku limitu: poslat jen prvním N (nejstarším registracím) */
  limitTo?: number | null;
};

/** Odešle zprávu a zapíše souhrn do historie (bez adres a osobních údajů). */
export async function sendEventBulkEmail(eventId: string, input: BulkSendInput) {
  return safeAction(async () => {
    const user = await requirePermission("events.manage.own");
    if (!input || typeof input !== "object") throw new Error("Neplatný požadavek.");
    const msg = validateBulkMessage(input.subject, input.body);
    if (!msg.ok) throw new Error((msg as { error: string }).error);
    const message = msg as { subject: string; body: string };
    const scope = parseScope(input.scope);
    const c = await collect(user, eventId, scope);
    const { usage, blocked } = await limits();
    if (blocked) throw new Error(blocked);
    if (c.recipients.length !== input.expected) throw new Error("Počet příjemců se mezitím změnil. Zkontrolujte náhled a odešlete znovu.");
    const plan = planBulkSend(c.recipients.length, roomLeft(usage), input.limitTo);
    if (!plan.ok) throw new Error((plan as { error: string }).error);
    const chosen = c.recipients.slice(0, plan.send);

    const res = await sendEventEmail("manual.bulk", chosen.map((r) => ({ email: r.email, userId: r.userId, vars: r.vars })), { content: { subject: message.subject, body: message.body } });

    const parts = [`odesláno ${res.sent} z ${chosen.length}`];
    if (chosen.length < c.recipients.length) parts.push(`${c.recipients.length - chosen.length} ${plural(c.recipients.length - chosen.length, "příjemce", "příjemci", "příjemců")} vynecháno kvůli limitu`);
    if (res.skippedLimit) parts.push(`přeskočeno kvůli limitu ${res.skippedLimit}`);
    if (res.skippedDisabled) parts.push(`přeskočeno ${res.skippedDisabled}`);
    if (res.failed) parts.push(`selhalo ${res.failed}`);
    try {
      await prisma.$transaction((tx) =>
        audit(tx, user, {
          action: "events.bulk_email",
          entityType: "event",
          entityId: eventId,
          summary: `Událost „${c.event.title}“: hromadný e-mail „${message.subject.slice(0, 80)}“ (${c.scopeLabel}): ${parts.join(", ")}`,
          data: { scope, subject: message.subject, recipients: c.recipients.length, attempted: chosen.length, sent: res.sent, skippedLimit: res.skippedLimit, skippedDisabled: res.skippedDisabled, failed: res.failed },
        })
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Audit hromadného e-mailu události se nezapsal:", e);
    }
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/admin/notifications");
    return { sent: res.sent, attempted: chosen.length, omitted: c.recipients.length - chosen.length, skippedLimit: res.skippedLimit, skippedDisabled: res.skippedDisabled, failed: res.failed, error: res.firstError };
  });
}
