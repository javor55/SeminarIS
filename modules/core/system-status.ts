import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { addDaysToDayKey, schoolDayKey } from "@/lib/datetime";
import { loadEmailConfig, getEmailUsage, type EmailUsage } from "@/lib/email/settings";
import type { EmailStatus } from "@/lib/email/transport";

// Stav systému pro Diagnostiku a přehled „co udělat“ v administraci. Jen čtení, bez autorizace
// (volají ho stránky administrace a `getAdminTodos`, které si oprávnění hlídají samy).

export const CRON_LAST_RUN_KEY = "cron.daily.lastRun";

export type CronStatus = {
  secretConfigured: boolean;
  // Den (RRRR-MM-DD, pásmo školy) posledního spuštění denní úlohy; null = ještě neběžela
  lastRunDay: string | null;
  // Kolik dní uplynulo od posledního běhu (0 = dnes)
  daysSince: number | null;
  // Poslední zaznamenané selhání kroku denní úlohy a zda patří k poslednímu běhu
  lastFailure: { at: Date; summary: string; latestRun: boolean } | null;
};

export async function getCronStatus(now = new Date()): Promise<CronStatus> {
  const [lastRunDay, failure] = await Promise.all([
    getSetting(CRON_LAST_RUN_KEY),
    prisma.auditLog.findFirst({ where: { action: "system.cron.daily" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, summary: true } }),
  ]);
  let daysSince: number | null = null;
  if (lastRunDay) {
    const today = schoolDayKey(now);
    daysSince = 0;
    while (daysSince < 400 && addDaysToDayKey(lastRunDay, daysSince) < today) daysSince++;
  }
  return {
    secretConfigured: !!process.env.CRON_SECRET,
    lastRunDay,
    daysSince,
    lastFailure: failure ? { at: failure.createdAt, summary: failure.summary, latestRun: !!lastRunDay && schoolDayKey(failure.createdAt) >= lastRunDay } : null,
  };
}

export type MigrationStatus = {
  ok: boolean;
  error?: string;
  applied: number;
  failed: string[];
  latest: { name: string; at: Date | null } | null;
  // Migrace ze složky prisma/migrations, které DB ještě nemá (null = složka na serveru není)
  pending: string[] | null;
};

export async function getMigrationStatus(): Promise<MigrationStatus> {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
      SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC`;
    const applied = rows.filter((r) => r.finished_at && !r.rolled_back_at);
    const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
    let pending: string[] | null = null;
    try {
      const dir = path.join(process.cwd(), "prisma", "migrations");
      const onDisk = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      const have = new Set(applied.map((r) => r.migration_name));
      pending = onDisk.filter((n) => !have.has(n)).sort();
    } catch {
      pending = null;
    }
    return {
      ok: failed.length === 0 && (pending?.length ?? 0) === 0,
      applied: applied.length,
      failed,
      latest: applied[0] ? { name: applied[0].migration_name, at: applied[0].finished_at } : null,
      pending,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Chyba", applied: 0, failed: [], latest: null, pending: null };
  }
}

export type EmailDiagnostics = {
  enabled: boolean;
  status: EmailStatus;
  usage: EmailUsage;
  // Neúspěšně odeslané e-maily za posledních 24 hodin
  failed24h: number;
};

export async function getEmailDiagnostics(now = new Date()): Promise<EmailDiagnostics> {
  const cfg = await loadEmailConfig();
  const [usage, failed24h] = await Promise.all([
    getEmailUsage(cfg.settings),
    prisma.emailLog.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } } }),
  ]);
  return { enabled: cfg.settings.enabled, status: cfg.status, usage, failed24h };
}

export type DeploymentInfo = {
  commit: string | null;
  environment: string | null;
  node: string;
  startedAt: Date;
};

const startedAt = new Date();

export function getDeploymentInfo(): DeploymentInfo {
  return {
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    node: process.version,
    startedAt,
  };
}

export async function getDatabaseStatus(): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: null, error: e instanceof Error ? e.message : "Chyba" };
  }
}
