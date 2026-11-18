import { prisma, type TxClient } from "@/lib/prisma";
import {
  checkSubmissionWith,
  createChallengeWith,
  generateKey,
  signRenderTime,
  verifySolutionWith,
  type Challenge,
  type SolutionCheck,
  type SubmissionInput,
  type SubmissionResult,
} from "@/lib/antibot-core";

// Ochrana proti robotům: proof-of-work (ALTCHA), honeypot, minimální doba vyplnění a limity.
// Obecné, nezávislé na modulu událostí (může ji později použít i registrace účtů). Pomocná část bez DB: `antibot-core.ts`.

const KEY_SETTING = "antibot.key";

/** Tajný klíč (čte se z DB při každém použití, jeden levný dotaz); při prvním použití se vygeneruje a uloží do `SystemSetting` (souběžné první použití vyhraje jeden zápis). */
async function getKey(): Promise<string> {
  let row = await prisma.systemSetting.findUnique({ where: { key: KEY_SETTING } });
  if (!row) {
    await prisma.systemSetting.createMany({ data: [{ key: KEY_SETTING, value: generateKey() }], skipDuplicates: true });
    row = await prisma.systemSetting.findUnique({ where: { key: KEY_SETTING } });
  }
  return row!.value;
}

const testMode = () => process.env.ANTIBOT_TEST_MODE === "1";

/** Jednorázová spotřeba řešení: hash výzvy se zapíše do `EventRateLimit` (`pow:<hash>`); podruhé už zápis selže. */
async function consume(challenge: string, expires: Date): Promise<boolean> {
  // skipDuplicates = INSERT … ON CONFLICT DO NOTHING: počet 0 znamená, že řešení už někdo použil (bez chyby v logu)
  const { count } = await prisma.eventRateLimit.createMany({ data: [{ key: `pow:${challenge}`, windowStart: expires, count: 1 }], skipDuplicates: true });
  return count === 1;
}

export async function createChallenge(): Promise<Challenge> {
  return createChallengeWith(await getKey());
}

/** Ověří řešení výzvy a jednorázově ho spotřebuje. */
export async function verifySolution(payload: string | null | undefined): Promise<SolutionCheck> {
  return verifySolutionWith({ key: await getKey(), consume, testMode: testMode() }, payload);
}

/** Podepsaný čas zobrazení formuláře (stránka ho vloží do formuláře, server ho při odeslání zkontroluje). */
export async function createRenderToken(): Promise<string> {
  return signRenderTime(await getKey());
}

/** Honeypot, minimální doba a řešení výzvy najednou. `honeypot` = volající předstírá úspěch a nic neuloží. */
export async function checkSubmission(input: SubmissionInput): Promise<SubmissionResult> {
  return checkSubmissionWith({ key: await getKey(), consume, testMode: testMode() }, input);
}

export type RateLimitResult = { allowed: boolean; count: number; limit: number; retryAfterSeconds: number };

/**
 * Počítadlo v pevných oknech: zvýší počet pro `key` v aktuálním okně o `windowSeconds` a řekne, zda je ještě pod limitem.
 * Staré záznamy maže denní úloha (U13).
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number, db: Pick<TxClient, "eventRateLimit"> = prisma, now: Date = new Date()): Promise<RateLimitResult> {
  const ms = windowSeconds * 1000;
  const start = Math.floor(now.getTime() / ms) * ms;
  const windowStart = new Date(start);
  const row = await db.eventRateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  return { allowed: row.count <= limit, count: row.count, limit, retryAfterSeconds: Math.max(1, Math.ceil((start + ms - now.getTime()) / 1000)) };
}
