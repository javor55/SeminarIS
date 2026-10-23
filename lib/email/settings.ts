import { prisma, type TxClient } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";
import { startOfSchoolDay, startOfSchoolMonth } from "@/lib/datetime";
import { EMAIL_EVENTS, type EmailEventDef } from "@/lib/email/events";
import { getEmailStatus, type EmailStatus } from "@/lib/email/transport";

// Nastavení e-mailových upozornění v administraci (tabulka SystemSetting, klíče `email.*`).
// Tajný klíč RESEND_API_KEY tu NENÍ – ten je jen v env.

export const DEFAULT_DAILY_LIMIT = 90;
export const DEFAULT_MONTHLY_LIMIT = 2900;
export const DEFAULT_LOG_RETENTION_DAYS = 90;
// Měsíční limit se počítá z EmailLogu, proto se log nesmí mazat dřív než za měsíc
export const MIN_LOG_RETENTION_DAYS = 35;

export const EMAIL_SETTING_KEYS = {
  enabled: "email.enabled",
  from: "email.from",
  replyTo: "email.replyTo",
  dailyLimit: "email.dailyLimit",
  monthlyLimit: "email.monthlyLimit",
  logRetentionDays: "email.logRetentionDays",
} as const;

const eventKey = (id: string, field: "enabled" | "subject" | "body") => `email.event.${id}.${field}`;

export type EmailSettings = {
  // Hlavní vypínač
  enabled: boolean;
  // Přepsání env; null = použije se hodnota z env
  from: string | null;
  replyTo: string | null;
  dailyLimit: number;
  monthlyLimit: number;
  logRetentionDays: number;
};

export type EmailEventConfig = {
  enabled: boolean;
  // Vlastní text šablony; null = výchozí
  subject: string | null;
  body: string | null;
};

export type EmailConfig = {
  settings: EmailSettings;
  events: Map<string, EmailEventConfig>;
  status: EmailStatus;
};

function intOr(value: string | undefined, fallback: number, min = 0): number {
  const n = Number(value);
  return value != null && value.trim() !== "" && Number.isInteger(n) && n >= min ? n : fallback;
}

/** Celé nastavení e-mailů jedním dotazem. */
export async function loadEmailConfig(): Promise<EmailConfig> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: "email." } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const get = (k: string) => map.get(k);

  const settings: EmailSettings = {
    enabled: get(EMAIL_SETTING_KEYS.enabled) !== "false",
    from: get(EMAIL_SETTING_KEYS.from)?.trim() || null,
    replyTo: get(EMAIL_SETTING_KEYS.replyTo)?.trim() || null,
    dailyLimit: intOr(get(EMAIL_SETTING_KEYS.dailyLimit), DEFAULT_DAILY_LIMIT),
    monthlyLimit: intOr(get(EMAIL_SETTING_KEYS.monthlyLimit), DEFAULT_MONTHLY_LIMIT),
    logRetentionDays: intOr(get(EMAIL_SETTING_KEYS.logRetentionDays), DEFAULT_LOG_RETENTION_DAYS, MIN_LOG_RETENTION_DAYS),
  };

  const events = new Map<string, EmailEventConfig>();
  for (const def of EMAIL_EVENTS) {
    const enabled = get(eventKey(def.id, "enabled"));
    events.set(def.id, {
      enabled: enabled == null ? def.defaultEnabled : enabled === "true",
      subject: get(eventKey(def.id, "subject"))?.trim() || null,
      body: get(eventKey(def.id, "body"))?.trim() || null,
    });
  }
  return { settings, events, status: getEmailStatus(settings) };
}

/** Je upozornění zapnuté (hlavní vypínač i událost)? Cron podle toho přeskočí zbytečné dotazy. */
export async function isEmailEventActive(eventId: string): Promise<boolean> {
  const cfg = await loadEmailConfig();
  return cfg.settings.enabled && (cfg.events.get(eventId)?.enabled ?? false);
}

export async function saveEmailSettings(
  data: {
    enabled: boolean;
    from: string;
    replyTo: string;
    dailyLimit: number;
    monthlyLimit: number;
    logRetentionDays: number;
  },
  db: TxClient = prisma
) {
  const check = (n: number, label: string, min: number, max: number) => {
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label}: zadejte celé číslo ${min}–${max}.`);
  };
  check(data.dailyLimit, "Denní limit", 0, 100_000);
  check(data.monthlyLimit, "Měsíční limit", 0, 1_000_000);
  check(data.logRetentionDays, "Uchovávání záznamů o e-mailech (dny)", MIN_LOG_RETENTION_DAYS, 3650);
  const from = data.from.trim();
  const replyTo = data.replyTo.trim();
  // „Jméno <adresa>“ nebo holá adresa
  const addr = (v: string) => (v.match(/<([^<>]+)>\s*$/)?.[1] ?? v).trim();
  const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if (from && !EMAIL_RE.test(addr(from))) throw new Error('Odesílatel musí být e-mail, nebo "Jméno <e-mail>".');
  if (replyTo && !EMAIL_RE.test(addr(replyTo))) throw new Error("Reply-to musí být platný e-mail.");

  await setSetting(EMAIL_SETTING_KEYS.enabled, data.enabled ? "true" : "false", db);
  await setSetting(EMAIL_SETTING_KEYS.from, from, db);
  await setSetting(EMAIL_SETTING_KEYS.replyTo, replyTo, db);
  await setSetting(EMAIL_SETTING_KEYS.dailyLimit, String(data.dailyLimit), db);
  await setSetting(EMAIL_SETTING_KEYS.monthlyLimit, String(data.monthlyLimit), db);
  await setSetting(EMAIL_SETTING_KEYS.logRetentionDays, String(data.logRetentionDays), db);
}

/** Uloží nastavení jedné události; prázdný předmět/text = výchozí šablona. */
export async function saveEmailEvent(
  def: EmailEventDef,
  data: { enabled?: boolean; subject?: string; body?: string },
  db: TxClient = prisma
) {
  if (data.enabled !== undefined) await setSetting(eventKey(def.id, "enabled"), data.enabled ? "true" : "false", db);
  if (data.subject !== undefined) await setSetting(eventKey(def.id, "subject"), data.subject.trim(), db);
  if (data.body !== undefined) await setSetting(eventKey(def.id, "body"), data.body.trim(), db);
}


// === Využití limitů ===

export type EmailUsage = {
  today: number;
  month: number;
  dailyLimit: number;
  monthlyLimit: number;
  // Kolik e-mailů se dnes / tento měsíc kvůli limitu neodeslalo
  skippedToday: number;
  skippedMonth: number;
};

/** Odeslané e-maily dnes a tento měsíc (podle pásma školy) a překročení limitů. */
export async function getEmailUsage(settings?: EmailSettings): Promise<EmailUsage> {
  const s = settings ?? (await loadEmailConfig()).settings;
  const dayStart = startOfSchoolDay();
  const monthStart = startOfSchoolMonth();
  const [today, month, skippedToday, skippedMonth] = await Promise.all([
    prisma.emailLog.count({ where: { status: "SENT", createdAt: { gte: dayStart } } }),
    prisma.emailLog.count({ where: { status: "SENT", createdAt: { gte: monthStart } } }),
    prisma.emailLog.count({ where: { status: "SKIPPED_LIMIT", createdAt: { gte: dayStart } } }),
    prisma.emailLog.count({ where: { status: "SKIPPED_LIMIT", createdAt: { gte: monthStart } } }),
  ]);
  return { today, month, dailyLimit: s.dailyLimit, monthlyLimit: s.monthlyLimit, skippedToday, skippedMonth };
}
