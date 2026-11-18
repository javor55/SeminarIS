import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Ochrana proti robotům bez externí služby: proof-of-work kompatibilní s ALTCHA.
// Tohle je čistá část (bez DB), `lib/antibot.ts` k ní přidává uložený klíč a jednorázové použití řešení.
//
// Postup: server vybere tajné číslo 0..maxnumber a pošle jen `challenge = sha256(salt + číslo)` s podpisem
// `HMAC-SHA256(challenge, klíč)`. Prohlížeč číslo najde zkoušením a pošle zpět; server ověří podpis, platnost a hash.

export const ALGORITHM = "SHA-256";
export const MAX_NUMBER = 100_000;
/** Platnost výzvy */
export const CHALLENGE_TTL_SECONDS = 10 * 60;
/** Dřív než za tuto dobu od zobrazení formuláře se odeslání odmítne */
export const MIN_FILL_SECONDS = 3;
/** Řešení, které server přijme v testovacím režimu (`ANTIBOT_TEST_MODE=1`, jen E2E a CI) */
export const TEST_SOLUTION = "test";

export type Challenge = {
  algorithm: typeof ALGORITHM;
  salt: string;
  challenge: string;
  maxnumber: number;
  signature: string;
  expiresAt: string;
};

export type Solution = {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
  took?: number;
};

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const hmacHex = (message: string, key: string) => createHmac("sha256", key).update(message).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function generateKey(): string {
  return randomBytes(32).toString("hex");
}

/** Vytvoří výzvu. `secretNumber` se bere náhodně (parametr je kvůli testům). */
export function createChallengeWith(key: string, now: Date = new Date(), secretNumber: number = randomInt(0, MAX_NUMBER + 1)): Challenge {
  const expires = Math.floor(now.getTime() / 1000) + CHALLENGE_TTL_SECONDS;
  const salt = `${randomBytes(12).toString("hex")}?expires=${expires}`;
  const challenge = sha256Hex(salt + secretNumber);
  return { algorithm: ALGORITHM, salt, challenge, maxnumber: MAX_NUMBER, signature: hmacHex(challenge, key), expiresAt: new Date(expires * 1000).toISOString() };
}

/** Řešení, jak ho posílá prohlížeč: JSON v base64 (stejně jako ALTCHA). */
export function encodeSolution(s: Solution): string {
  return Buffer.from(JSON.stringify(s)).toString("base64");
}

export function decodeSolution(payload: string): Solution | null {
  try {
    const o = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    if (!o || typeof o !== "object") return null;
    if (typeof o.challenge !== "string" || typeof o.salt !== "string" || typeof o.signature !== "string" || typeof o.algorithm !== "string") return null;
    if (typeof o.number !== "number" || !Number.isInteger(o.number)) return null;
    return o as Solution;
  } catch {
    return null;
  }
}

export type SolutionFailure = "malformed" | "signature" | "expired" | "wrong" | "reused";
export type SolutionCheck = { ok: true; challenge: string; expires: Date } | { ok: false; reason: SolutionFailure };

/** Ověří podpis, platnost a hash (bez jednorázové spotřeby). */
export function checkSolution(key: string, payload: string, now: Date = new Date()): SolutionCheck {
  const s = decodeSolution(payload);
  if (!s || s.algorithm !== ALGORITHM || s.number < 0 || s.number > MAX_NUMBER) return { ok: false, reason: "malformed" };
  if (!/^[0-9a-f]{64}$/.test(s.challenge) || !safeEqual(hmacHex(s.challenge, key), s.signature)) return { ok: false, reason: "signature" };
  const m = /[?&]expires=(\d+)/.exec(s.salt);
  const expires = m ? new Date(Number(m[1]) * 1000) : null;
  if (!expires || now > expires) return { ok: false, reason: "expired" };
  if (!safeEqual(sha256Hex(s.salt + s.number), s.challenge)) return { ok: false, reason: "wrong" };
  return { ok: true, challenge: s.challenge, expires };
}

/**
 * Ověří řešení a jednorázově ho spotřebuje (`consume` vrátí false, když už bylo použito).
 * V testovacím režimu přijme řešení „test“ (bez spotřeby).
 */
export async function verifySolutionWith(
  opts: { key: string; consume: (challenge: string, expires: Date) => Promise<boolean>; testMode?: boolean; now?: Date },
  payload: string | null | undefined
): Promise<SolutionCheck> {
  if (opts.testMode && payload === TEST_SOLUTION) return { ok: true, challenge: TEST_SOLUTION, expires: new Date(0) };
  if (!payload || typeof payload !== "string" || payload.length > 2000) return { ok: false, reason: "malformed" };
  const r = checkSolution(opts.key, payload, opts.now);
  if (!r.ok) return r;
  if (!(await opts.consume(r.challenge, r.expires))) return { ok: false, reason: "reused" };
  return r;
}

// === Minimální doba vyplnění: podepsaný čas zobrazení formuláře ===

/** Token s časem zobrazení formuláře: „<ms>.<podpis>“. */
export function signRenderTime(key: string, now: Date = new Date()): string {
  const t = String(now.getTime());
  return `${t}.${hmacHex(`render:${t}`, key)}`;
}

export type RenderTimeCheck = { ok: true } | { ok: false; reason: "missing" | "forged" | "too_fast" };

export function checkRenderTime(key: string, token: string | null | undefined, now: Date = new Date(), minSeconds: number = MIN_FILL_SECONDS): RenderTimeCheck {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  const [t, sig] = token.split(".");
  if (!t || !sig || !/^\d+$/.test(t) || !safeEqual(hmacHex(`render:${t}`, key), sig)) return { ok: false, reason: "forged" };
  if (now.getTime() - Number(t) < minSeconds * 1000) return { ok: false, reason: "too_fast" };
  return { ok: true };
}

// === Společná kontrola odeslání formuláře ===

export type SubmissionInput = { solution?: string | null; honeypot?: string | null; renderToken?: string | null };
/** `honeypot`: vyplněné skryté pole – volající předstírá úspěch a nic neuloží. */
export type SubmissionResult = { ok: true } | { ok: false; reason: "honeypot" | "missing" | "forged" | "too_fast" | SolutionFailure };

export async function checkSubmissionWith(
  opts: { key: string; consume: (challenge: string, expires: Date) => Promise<boolean>; testMode?: boolean; now?: Date },
  input: SubmissionInput
): Promise<SubmissionResult> {
  if (input.honeypot && String(input.honeypot).trim() !== "") return { ok: false, reason: "honeypot" };
  const time = checkRenderTime(opts.key, input.renderToken, opts.now);
  if (!time.ok) return time;
  const sol = await verifySolutionWith(opts, input.solution);
  return sol.ok ? { ok: true } : sol;
}
