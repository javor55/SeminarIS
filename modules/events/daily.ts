import { audit } from "@/lib/audit";
import { startOfSchoolDay } from "@/lib/datetime";
import { appUrl, sendEventEmail } from "@/lib/email";
import { isEmailEventActive } from "@/lib/email/settings";
import { prisma } from "@/lib/prisma";
import type { EmailEventId } from "@/lib/email/events";
import type { DailyJobStep } from "@/modules/server-types";
import { itemFullLabel } from "@/modules/events/format";
import { HOLDING_STATUSES } from "@/modules/events/public-data";
import { loadPurgeAfterDays } from "@/modules/events/text-defaults";

// Denní úloha modulu Události: připomínka den předem, smazání osobních údajů po akci a úklid pomocných dat.
// Každý krok si hlídá chyby sám (jedna chyba nezastaví ostatní). Úloha běží jednou denně (cron `/api/cron/daily`).

const DAY_MS = 24 * 3600_000;

/** Registrace, kterým se v dané lhůtě posílá připomínka: držící místo, s nezrušeným termínem v rozmezí, bez odeslané připomínky. */
function reminderWhere(from: Date, to: Date) {
  return {
    reminderSentAt: null,
    cancelledAt: null,
    status: { in: [...HOLDING_STATUSES] },
    event: { purgedAt: null, status: { in: ["PUBLISHED", "CLOSED"] as ("PUBLISHED" | "CLOSED")[] }, confirmChannel: { not: "SCREEN_ONLY" as const } },
    items: { some: { item: { cancelledAt: null, startsAt: { gte: from, lt: to } } } },
  };
}

/** Kolik připomínek se zítra pošle (odhad do administrace Upozornění). */
export async function getEventsEmailEstimates(now = new Date()): Promise<Partial<Record<EmailEventId, number>>> {
  const count = await prisma.eventRegistration.count({ where: reminderWhere(startOfSchoolDay(now, 1), startOfSchoolDay(now, 2)) });
  return { "events.reminder": count };
}

/** Kolik připomínek se pošle při příštích `days` spuštěních denní úlohy (odhad na nejbližší dny, bez ohledu na zapnutí). */
export async function getEventsEmailForecast(days: number, now = new Date()): Promise<Partial<Record<EmailEventId, number[]>>> {
  const counts = await Promise.all(
    Array.from({ length: days }, (_, i) => prisma.eventRegistration.count({ where: reminderWhere(startOfSchoolDay(now, i + 1), startOfSchoolDay(now, i + 2)) }))
  );
  return { "events.reminder": counts };
}

/** Připomínka den předem: jednou na registraci (`reminderSentAt`), ne u potvrzení „jen na obrazovce“. */
async function sendReminders(now: Date): Promise<DailyJobStep> {
  if (!(await isEmailEventActive("events.reminder"))) return { task: "events.reminder", ok: true, detail: "Připomínky událostí jsou vypnuté." };
  const from = startOfSchoolDay(now, 1);
  const to = startOfSchoolDay(now, 2);
  const regs = await prisma.eventRegistration.findMany({
    where: reminderWhere(from, to),
    include: { event: { select: { title: true, slug: true, place: true } }, items: { include: { item: true } } },
    orderBy: { createdAt: "asc" },
  });
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of regs) {
    const tomorrow = r.items
      .map((x) => x.item)
      .filter((i) => !i.cancelledAt && i.startsAt && i.startsAt >= from && i.startsAt < to)
      .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());
    const res = await sendEventEmail("events.reminder", [
      {
        email: r.email,
        vars: {
          jmeno: r.name ?? r.email,
          akce: r.event.title,
          terminy: tomorrow.map((i) => `• ${itemFullLabel(i)}`).join("\n"),
          misto: r.event.place ?? "—",
          kod: r.code,
          odkaz: appUrl(`/akce/${r.event.slug}`),
        },
      },
    ]);
    // Zapsat „odesláno“ i při přeskočení (vypnuto, odhlášen, adresa .invalid): opakovat to nemá smysl.
    // Nezapsat při vyčerpaném limitu nebo chybě; další běh už ale termín „zítra“ nebude, takže se jen nepošle.
    if (res.sent > 0 || (res.skippedDisabled > 0 && res.skippedLimit === 0 && res.failed === 0)) {
      await prisma.eventRegistration.update({ where: { id: r.id }, data: { reminderSentAt: now } });
    }
    sent += res.sent;
    skipped += res.skippedDisabled + res.skippedLimit;
    failed += res.failed;
  }
  return { task: "events.reminder", ok: failed === 0, detail: `Odesláno ${sent}, přeskočeno ${skipped}${failed ? `, selhalo ${failed}` : ""}.` };
}

/** Konec události: konec posledního nezrušeného termínu, jinak konec registrace; `null` = neví se, nemazat. */
export function eventEnd(items: { startsAt: Date | null; endsAt: Date | null }[], registrationClosesAt: Date | null): Date | null {
  const times = items.map((i) => i.endsAt ?? i.startsAt).filter((d): d is Date => !!d).map((d) => d.getTime());
  if (times.length > 0) return new Date(Math.max(...times));
  return registrationClosesAt;
}

/**
 * Smaže osobní údaje účastníků událostí, které skončily před víc než `events.purgeAfterDays` dny: e-mail se nahradí
 * neplatnou adresou, jméno, odpovědi a vazba na účet se vymažou a odkaz na správu přestane fungovat. Počty, stavy,
 * kódy a termíny zůstanou. Událost dostane `purgedAt`; opakované spuštění ji přeskočí (idempotentní).
 */
export async function purgeExpiredEvents(now: Date): Promise<{ events: number; registrations: number }> {
  const days = await loadPurgeAfterDays();
  const candidates = await prisma.event.findMany({
    where: { purgedAt: null },
    select: { id: true, title: true, registrationClosesAt: true, items: { where: { cancelledAt: null }, select: { startsAt: true, endsAt: true } } },
  });
  let events = 0;
  let registrations = 0;
  for (const ev of candidates) {
    const end = eventEnd(ev.items, ev.registrationClosesAt);
    if (!end || now.getTime() < end.getTime() + days * DAY_MS) continue;
    const count = await prisma.$transaction(async (tx) => {
      // Odkaz na správu se zneplatní novým náhodným hashem (sloupec je povinný a jedinečný)
      const n = await tx.$executeRaw`
        UPDATE "EventRegistration"
        SET "email" = 'smazano-' || "id" || '@anonym.invalid',
            "name" = NULL,
            "answers" = '{}'::jsonb,
            "userId" = NULL,
            "tokenHash" = encode(sha256(convert_to("id" || random()::text || clock_timestamp()::text, 'UTF8')), 'hex'),
            "updatedAt" = ${now}
        WHERE "eventId" = ${ev.id}`;
      await tx.event.update({ where: { id: ev.id }, data: { purgedAt: now } });
      // Bez osobních údajů: jen počet registrací a použitá lhůta
      await audit(tx, null, {
        action: "events.purge",
        entityType: "event",
        entityId: ev.id,
        summary: `Událost „${ev.title}“: smazány osobní údaje účastníků (registrací: ${n}, lhůta ${days} dní po akci)`,
        data: { registrations: n, afterDays: days },
      });
      return n;
    });
    events++;
    registrations += count;
  }
  return { events, registrations };
}

/** Úklid: počítadla ochrany proti robotům starší než 2 dny a obrázky starší než den, na které nic neodkazuje. */
export async function cleanupEventData(now: Date): Promise<{ rateLimits: number; images: number }> {
  const rate = await prisma.eventRateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * DAY_MS) } } });
  // Obrázek se nahrává hned po výběru, takže po výměně nebo odebrání zůstane sirotek. Odkaz z popisu je text `/api/events/images/<id>`.
  const images = await prisma.$executeRaw`
    DELETE FROM "EventImage" i
    WHERE i."createdAt" < ${new Date(now.getTime() - DAY_MS)}
      AND NOT EXISTS (
        SELECT 1 FROM "Event" e
        WHERE e."imageId" = i."id" OR position('/api/events/images/' || i."id" in e."descriptionHtml") > 0
      )`;
  return { rateLimits: rate.count, images };
}

async function step(task: string, run: () => Promise<DailyJobStep | string>): Promise<DailyJobStep> {
  try {
    const r = await run();
    return typeof r === "string" ? { task, ok: true, detail: r } : r;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Denní úloha ${task} selhala:`, e);
    return { task, ok: false, detail: e instanceof Error ? e.message : "Chyba." };
  }
}

/** Denní úloha modulu (volá ji jádro přes `ModuleServer.runDailyJob`, jen když je modul zapnutý). */
export async function runEventsDailyJob(now: Date): Promise<DailyJobStep[]> {
  return [
    await step("events.reminder", () => sendReminders(now)),
    await step("events.purge", async () => {
      const r = await purgeExpiredEvents(now);
      return `Smazány osobní údaje u událostí: ${r.events}, registrací: ${r.registrations}.`;
    }),
    await step("events.cleanup", async () => {
      const r = await cleanupEventData(now);
      return `Smazáno počítadel: ${r.rateLimits}, nepoužitých obrázků: ${r.images}.`;
    }),
  ];
}
