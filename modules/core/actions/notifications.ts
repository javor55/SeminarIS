"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { audit, describeChanges } from "@/lib/audit";
import { getEnabledModuleIds } from "@/lib/modules";
import { CONFIGURABLE_EMAIL_EVENTS, getEmailEvent, type EmailEventId } from "@/lib/email/events";
import { unknownVariables } from "@/lib/email/template";
import {
  loadEmailConfig,
  getEmailUsage,
  saveEmailEvent,
  saveEmailSettings,
  MIN_LOG_RETENTION_DAYS,
  type EmailSettings,
  type EmailUsage,
} from "@/lib/email/settings";
import { sendEventEmail } from "@/lib/email/send";
import type { EmailStatus } from "@/lib/email/transport";
import { MODULE_SERVERS } from "@/modules/server-registry";
import { revalidatePath } from "next/cache";

// Administrace → Upozornění: hlavní vypínač, odesílatel, limity, události a šablony,
// zkušební e-mail a přehled odeslaných e-mailů (EmailLog).

export type NotificationEventView = {
  id: EmailEventId;
  group: string;
  label: string;
  description: string;
  mandatory: boolean;
  bulk: boolean;
  enabled: boolean;
  moduleEnabled: boolean;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  variables: { name: string; description: string }[];
  // Odhad počtu příjemců při příštím spuštění (jen hromadné události)
  estimate: number | null;
};

export type NotificationsOverview = {
  status: EmailStatus;
  settings: EmailSettings;
  usage: EmailUsage;
  // Hodnoty z env (zobrazí se jako výchozí, když je pole v administraci prázdné)
  envFrom: string | null;
  envReplyTo: string | null;
  minLogRetentionDays: number;
  events: NotificationEventView[];
};

export async function getNotificationsOverview(): Promise<NotificationsOverview> {
  await requirePermission("core.admin");
  const [cfg, enabledModules] = await Promise.all([loadEmailConfig(), getEnabledModuleIds()]);
  const usage = await getEmailUsage(cfg.settings);

  const estimates: Record<string, number> = {};
  await Promise.all(
    MODULE_SERVERS.filter(({ id }) => enabledModules.includes(id)).map(async ({ server }) => {
      try {
        Object.assign(estimates, (await server.getEmailEstimates?.()) ?? {});
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Odhad příjemců selhal:", e);
      }
    })
  );

  return {
    status: cfg.status,
    settings: cfg.settings,
    usage,
    envFrom: process.env.EMAIL_FROM?.trim() || null,
    envReplyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
    minLogRetentionDays: MIN_LOG_RETENTION_DAYS,
    events: CONFIGURABLE_EMAIL_EVENTS.map((def) => {
      const c = cfg.events.get(def.id)!;
      return {
        id: def.id,
        group: def.group,
        label: def.label,
        description: def.description,
        mandatory: def.mandatory,
        bulk: def.bulk,
        enabled: c.enabled,
        moduleEnabled: enabledModules.includes(def.module),
        subject: c.subject ?? def.defaultSubject,
        body: c.body ?? def.defaultBody,
        defaultSubject: def.defaultSubject,
        defaultBody: def.defaultBody,
        variables: def.variables,
        estimate: def.bulk ? (estimates[def.id] ?? null) : null,
      };
    }),
  };
}

export async function saveNotificationSettings(data: {
  enabled: boolean;
  from: string;
  replyTo: string;
  dailyLimit: number;
  monthlyLimit: number;
  logRetentionDays: number;
}) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    const before = (await loadEmailConfig()).settings;
    await prisma.$transaction(async (tx) => {
      await saveEmailSettings(data, tx);
      const after = {
        enabled: data.enabled,
        from: data.from.trim() || null,
        replyTo: data.replyTo.trim() || null,
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
        logRetentionDays: data.logRetentionDays,
      };
      const changes = describeChanges(before, after, {
        enabled: "e-mailová upozornění",
        from: "odesílatel",
        replyTo: "reply-to",
        dailyLimit: "denní limit",
        monthlyLimit: "měsíční limit",
        logRetentionDays: "uchovávání záznamů o e-mailech (dny)",
      });
      await audit(tx, admin, {
        action: "settings.notifications",
        entityType: "setting",
        entityId: "email",
        summary: `Nastavení e-mailových upozornění${changes ? `: ${changes}` : " uloženo beze změny"}`,
        data: { before, after },
      });
    });
    revalidatePath("/admin/notifications");
  });
}

/** Zapnutí/vypnutí události a úprava její šablony (prázdný text = výchozí). */
export async function saveNotificationEvent(
  eventId: string,
  data: { enabled?: boolean; subject?: string; body?: string }
) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    const def = getEmailEvent(eventId);
    if (!def || def.id === "test") throw new Error("Neznámé upozornění.");
    const allowed = def.variables.map((v) => v.name);
    for (const [label, text] of [["předmětu", data.subject], ["textu", data.body]] as const) {
      if (text === undefined) continue;
      const unknown = unknownVariables(text, allowed);
      if (unknown.length > 0) {
        throw new Error(`V ${label} jsou neznámé proměnné: ${unknown.map((u) => `{{${u}}}`).join(", ")}. Povolené: ${allowed.map((a) => `{{${a}}}`).join(", ")}.`);
      }
    }
    if ((data.subject ?? "").length > 300) throw new Error("Předmět je příliš dlouhý (max. 300 znaků).");
    if ((data.body ?? "").length > 10_000) throw new Error("Text je příliš dlouhý (max. 10 000 znaků).");

    // Šablona shodná s výchozí se neukládá (zůstane „výchozí“)
    const clean = {
      ...data,
      subject: data.subject === undefined ? undefined : data.subject.trim() === def.defaultSubject ? "" : data.subject,
      body: data.body === undefined ? undefined : data.body.trim() === def.defaultBody ? "" : data.body,
    };
    const before = (await loadEmailConfig()).events.get(def.id)!;
    await prisma.$transaction(async (tx) => {
      await saveEmailEvent(def, clean, tx);
      const parts: string[] = [];
      if (data.enabled !== undefined && data.enabled !== before.enabled) parts.push(data.enabled ? "zapnuto" : "vypnuto");
      if (data.subject !== undefined || data.body !== undefined) parts.push("upravena šablona");
      await audit(tx, admin, {
        action: "settings.notifications.event",
        entityType: "setting",
        entityId: `email.event.${def.id}`,
        summary: `Upozornění „${def.label}“: ${parts.join(", ") || "uloženo beze změny"}`,
        data: { event: def.id, enabled: data.enabled ?? null, subjectChanged: data.subject !== undefined, bodyChanged: data.body !== undefined },
      });
    });
    revalidatePath("/admin/notifications");
  });
}

/** Zkušební e-mail přihlášenému adminovi. Posílá se i při vypnutých upozorněních; počítá se do limitů. */
export async function sendTestEmailToMe() {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    const res = await sendEventEmail("test", [{ email: admin.email, userId: admin.id, vars: { jmeno: admin.firstName } }]);
    if (res.sent === 0) throw new Error(res.firstError ?? "E-mail se nepodařilo odeslat.");
    return { to: admin.email };
  });
}

// === PŘEHLED ODESLANÝCH E-MAILŮ ===

export type EmailLogFilter = {
  status?: string;
  event?: string;
  search?: string;
  page?: number;
};

export type EmailLogRow = {
  id: string;
  createdAt: string;
  recipient: string;
  event: string;
  eventLabel: string;
  subject: string;
  status: "SENT" | "FAILED" | "SKIPPED_LIMIT" | "SKIPPED_DISABLED";
  error: string | null;
};

const PAGE_SIZE = 50;

export async function getEmailLog(filter: EmailLogFilter = {}): Promise<{ rows: EmailLogRow[]; total: number; pageSize: number }> {
  await requirePermission("core.admin");
  const where = {
    ...(filter.status && ["SENT", "FAILED", "SKIPPED_LIMIT", "SKIPPED_DISABLED"].includes(filter.status)
      ? { status: filter.status as EmailLogRow["status"] }
      : {}),
    ...(filter.event ? { event: filter.event } : {}),
    ...(filter.search?.trim()
      ? {
          OR: [
            { recipient: { contains: filter.search.trim(), mode: "insensitive" as const } },
            { subject: { contains: filter.search.trim(), mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const page = Math.max(0, Math.floor(filter.page ?? 0));
  const [rows, total] = await Promise.all([
    prisma.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.emailLog.count({ where }),
  ]);
  return {
    total,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      recipient: r.recipient,
      event: r.event,
      eventLabel: getEmailEvent(r.event)?.label ?? r.event,
      subject: r.subject,
      status: r.status,
      error: r.error,
    })),
  };
}
