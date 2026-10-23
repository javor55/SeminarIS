import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { schoolDayKey } from "@/lib/datetime";
import { getEnabledModuleIds } from "@/lib/modules";
import { audit } from "@/lib/audit";
import { MODULE_SERVERS } from "@/modules/server-registry";
import type { DailyJobStep } from "@/modules/server-types";

// Denní úloha (Vercel Cron, viz vercel.json): připomínky na zítřek, denní souhrny, automatické
// připomínky nezapsaným a mazání starých záznamů. Chráněno hlavičkou
// `Authorization: Bearer ${CRON_SECRET}` (přesně takovou posílá Vercel Cron).
//
// Idempotence: úloha si na začátku atomicky „zabere“ dnešní den (SystemSetting `cron.daily.lastRun`,
// den v pásmu Europe/Prague). Druhé spuštění téhož dne se přeskočí, takže nic nepošle dvakrát.

export const dynamic = "force-dynamic";
// Hromadné e-maily po dávkách mohou chvíli trvat
export const maxDuration = 60;

const LAST_RUN_KEY = "cron.daily.lastRun";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Bez nastaveného tajemství endpoint nikoho nepustí
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Atomicky zabere dnešní den; false, když už dnes proběhla. */
async function claimToday(today: string): Promise<boolean> {
  // INSERT … ON CONFLICT DO UPDATE … WHERE: změní řádek jen tehdy, když dnešek ještě není uložený
  const affected = await prisma.$executeRaw`
    INSERT INTO "SystemSetting" ("key", "value") VALUES (${LAST_RUN_KEY}, ${today})
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"
    WHERE "SystemSetting"."value" <> EXCLUDED."value"`;
  return affected > 0;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = schoolDayKey(now);
  try {
    if (!(await claimToday(today))) {
      return NextResponse.json({ ok: true, skipped: true, reason: `Denní úloha ${today} už proběhla.` });
    }

    const enabled = await getEnabledModuleIds();
    const steps: DailyJobStep[] = [];
    for (const { id, server } of MODULE_SERVERS) {
      if (!enabled.includes(id) || !server.runDailyJob) continue;
      try {
        steps.push(...(await server.runDailyJob(now)));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Denní úloha modulu ${id} selhala:`, e);
        steps.push({ task: `${id}.daily`, ok: false, detail: e instanceof Error ? e.message : "Chyba." });
      }
    }

    const failed = steps.filter((s) => !s.ok);
    // Do historie jen tehdy, když se něco stalo nebo selhalo (ne každý den jeden prázdný řádek)
    if (failed.length > 0) {
      await audit(prisma, null, {
        action: "system.cron.daily",
        entityType: "system",
        summary: `Denní úloha ${today}: ${failed.length} kroků selhalo (${failed.map((f) => f.task).join(", ")})`,
        data: { steps },
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: failed.length === 0, day: today, steps });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Denní úloha selhala:", e);
    // Další pokus téhož dne (např. ruční spuštění) má projít
    await prisma.systemSetting.deleteMany({ where: { key: LAST_RUN_KEY, value: today } }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "Denní úloha selhala." }, { status: 500 });
  }
}
