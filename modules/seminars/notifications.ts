import { prisma } from "@/lib/prisma";
import { addDaysToDayKey, formatDateTime, schoolDayKey } from "@/lib/datetime";
import { appUrl, sendEventEmail } from "@/lib/email";
import { isEmailEventActive } from "@/lib/email/settings";
import { isImpersonating } from "@/lib/session";
import { computeEnrollmentStatus } from "@/lib/utils";
import type { EmailEventId } from "@/lib/email/events";
import type { DailyJobStep } from "@/modules/server-types";
import { eligibleStudentsWhere } from "@/modules/seminars/eligibility";
import { computeUnenrolled, sendUnenrolledReminder } from "@/modules/seminars/unenrolled";

// E-maily modulu Semináře: „zápis otevřen“ a připomínky nezapsaným.

type WindowLike = { id: string; status: string; startsAt: Date | string; endsAt: Date | string };

/**
 * Upozornění „zápis otevřen“ – jednou za okno. Okno se označí jako oznámené vždy
 * (i když je upozornění vypnuté), aby se po pozdějším zapnutí neposílalo o dávno otevřeném zápisu.
 * V režimu „zobrazit jako“ se nic neděje (ani se okno neoznačí).
 */
export async function notifyWindowOpened(windowId: string) {
  try {
    if (await isImpersonating()) return;
    const claimed = await prisma.enrollmentWindow.updateMany({
      where: { id: windowId, openedNotifiedAt: null },
      data: { openedNotifiedAt: new Date() },
    });
    if (claimed.count === 0) return;
    if (!(await isEmailEventActive("seminars.window.opened"))) return;

    const ew = await prisma.enrollmentWindow.findUnique({ where: { id: windowId } });
    if (!ew) return;
    const students = await prisma.user.findMany({
      where: eligibleStudentsWhere(ew.targetGrades),
      select: { id: true, email: true, firstName: true },
    });
    await sendEventEmail(
      "seminars.window.opened",
      students.map((s) => ({
        email: s.email,
        userId: s.id,
        vars: {
          jmeno: s.firstName,
          okno: ew.name,
          zacatek: formatDateTime(ew.startsAt),
          konec: formatDateTime(ew.endsAt),
          odkaz: appUrl("/dashboard"),
        },
      }))
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Upozornění na otevření zápisu selhalo:", e);
  }
}

/** Zavolá notifyWindowOpened, pokud je okno podle času právě otevřené. */
export async function notifyWindowOpenedIfOpen(ew: WindowLike) {
  if (ew.status === "DRAFT") return;
  if (computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt).is === "open") await notifyWindowOpened(ew.id);
}

export async function getSeminarsEmailEstimates(now = new Date()): Promise<Partial<Record<EmailEventId, number>>> {
  const windows = await prisma.enrollmentWindow.findMany({ where: { status: { not: "DRAFT" }, endsAt: { gte: now } } });
  let opened = 0;
  let reminder = 0;
  const today = schoolDayKey(now);
  for (const ew of windows) {
    if (!ew.openedNotifiedAt) opened += await prisma.user.count({ where: eligibleStudentsWhere(ew.targetGrades) });
    if (ew.reminderDaysBefore != null && !ew.reminderSentOn && computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt, now).is !== "closed") {
      const dueFrom = addDaysToDayKey(schoolDayKey(ew.endsAt), -ew.reminderDaysBefore);
      // odhad jen pro okna, kterým připomínka brzy přijde (nejpozději zítra)
      if (addDaysToDayKey(today, 1) >= dueFrom) reminder += (await computeUnenrolled(ew.id))?.students.length ?? 0;
    }
  }
  return { "seminars.window.opened": opened, "seminars.window.reminder": reminder };
}

/**
 * Denní úloha: doběhne upozornění na otevřená okna (kdyby se okno otevřelo, aniž ho někdo
 * zobrazil) a pošle automatické připomínky nezapsaným. Připomínka se posílá jednou za okno:
 * v den „konec − N dní“ (nebo první úlohou po něm, dokud okno běží).
 */
export async function runSeminarsDailyJob(now: Date): Promise<DailyJobStep[]> {
  const steps: DailyJobStep[] = [];
  const windows = await prisma.enrollmentWindow.findMany({ where: { status: { not: "DRAFT" }, endsAt: { gte: now } }, orderBy: { startsAt: "asc" } });

  try {
    let opened = 0;
    for (const ew of windows) {
      if (computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt, now).is !== "open") continue;
      if (!ew.openedNotifiedAt) {
        await notifyWindowOpened(ew.id);
        opened++;
      }
    }
    steps.push({ task: "seminars.window.opened", ok: true, detail: opened ? `Zpracováno otevřených oken: ${opened}.` : "Žádné nové otevřené okno." });
  } catch (e) {
    steps.push({ task: "seminars.window.opened", ok: false, detail: e instanceof Error ? e.message : "Chyba." });
  }

  try {
    if (!(await isEmailEventActive("seminars.window.reminder"))) {
      steps.push({ task: "seminars.window.reminder", ok: true, detail: "Vypnuto." });
    } else {
      const today = schoolDayKey(now);
      let windowsDone = 0;
      let sent = 0;
      for (const ew of windows) {
        if (ew.reminderDaysBefore == null || ew.reminderSentOn) continue;
        if (computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt, now).is !== "open") continue;
        if (today < addDaysToDayKey(schoolDayKey(ew.endsAt), -ew.reminderDaysBefore)) continue;
        // označit dřív, než se začne posílat: druhé spuštění nic neposílá znovu
        const claimed = await prisma.enrollmentWindow.updateMany({ where: { id: ew.id, reminderSentOn: null }, data: { reminderSentOn: today } });
        if (claimed.count === 0) continue;
        const res = await sendUnenrolledReminder(ew.id, { manual: false });
        windowsDone++;
        sent += res?.sent ?? 0;
      }
      steps.push({ task: "seminars.window.reminder", ok: true, detail: windowsDone ? `Okna: ${windowsDone}, odesláno ${sent}.` : "Žádná připomínka k odeslání." });
    }
  } catch (e) {
    steps.push({ task: "seminars.window.reminder", ok: false, detail: e instanceof Error ? e.message : "Chyba." });
  }
  return steps;
}
