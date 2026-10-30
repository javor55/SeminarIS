import { prisma } from "@/lib/prisma";
import { getSettingValues } from "@/lib/settings-registry";
import { startOfSchoolDay, startOfSchoolMonth } from "@/lib/datetime";
import { EMAIL_EVENTS } from "@/lib/email/events";
import { getEmailStatus, type EmailStatus } from "@/lib/email/transport";

// Nastavení e-mailových upozornění v administraci (tabulka SystemSetting, klíče `email.*`).
// Tajný klíč RESEND_API_KEY tu NENÍ – ten je jen v env.

// Výchozí hodnoty a meze limitů jsou v deklaracích nastavení (modules/core/manifest.ts)
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

/** Celé nastavení e-mailů (z registru nastavení). */
export async function loadEmailConfig(): Promise<EmailConfig> {
  const v = await getSettingValues((d) => d.key.startsWith("email."));
  const get = (k: string) => v[k];

  const settings: EmailSettings = {
    enabled: get(EMAIL_SETTING_KEYS.enabled) === true,
    from: String(get(EMAIL_SETTING_KEYS.from)) || null,
    replyTo: String(get(EMAIL_SETTING_KEYS.replyTo)) || null,
    dailyLimit: get(EMAIL_SETTING_KEYS.dailyLimit) as number,
    monthlyLimit: get(EMAIL_SETTING_KEYS.monthlyLimit) as number,
    logRetentionDays: get(EMAIL_SETTING_KEYS.logRetentionDays) as number,
  };

  const events = new Map<string, EmailEventConfig>();
  for (const def of EMAIL_EVENTS) {
    events.set(def.id, {
      enabled: get(eventKey(def.id, "enabled")) === true,
      subject: String(get(eventKey(def.id, "subject"))) || null,
      body: String(get(eventKey(def.id, "body"))) || null,
    });
  }
  return { settings, events, status: getEmailStatus(settings) };
}

/** Je upozornění zapnuté (hlavní vypínač i událost)? Cron podle toho přeskočí zbytečné dotazy. */
export async function isEmailEventActive(eventId: string): Promise<boolean> {
  const cfg = await loadEmailConfig();
  return cfg.settings.enabled && (cfg.events.get(eventId)?.enabled ?? false);
}

/** Klíče nastavení jedné události v registru (zapnutí, předmět, text šablony). */
export const emailEventKeys = (id: string) => ({
  enabled: eventKey(id, "enabled"),
  subject: eventKey(id, "subject"),
  body: eventKey(id, "body"),
});

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
