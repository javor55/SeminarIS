"use server";

import type { Prisma } from "@prisma/client";
import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditAreaLabel, auditUserWhere, AUDIT_AREAS } from "@/lib/audit";
import { AUDIT_RETENTION_KEY, getAuditRetentionYears } from "@/lib/audit-settings";
import { saveSettings } from "@/lib/settings-registry";
import { startOfSchoolDay } from "@/lib/datetime";

// Administrace → Historie: kdo, co a kdy změnil (AuditLog).

export type AuditFilter = {
  // jméno toho, kdo změnu provedl (část jména)
  actor?: string;
  // oblast = první část akce (users, makeup, …)
  area?: string;
  // období, dny ve tvaru RRRR-MM-DD (včetně)
  from?: string;
  to?: string;
  // hledání v popisu
  search?: string;
  // historie jednoho uživatele: co dělal on a co se dělo s ním
  userId?: string;
  page?: number;
};

export type AuditRow = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  impersonatorName: string | null;
  action: string;
  areaLabel: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  data: unknown;
};

const PAGE_SIZE = 50;

function dayStart(key: string): Date | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // poledne UTC leží vždy ve stejném kalendářním dni v Praze
  return startOfSchoolDay(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
}

export async function getAuditLog(filter: AuditFilter = {}): Promise<{ rows: AuditRow[]; total: number; pageSize: number }> {
  await requirePermission("core.admin");
  const and: Prisma.AuditLogWhereInput[] = [];
  if (filter.actor?.trim()) and.push({ actorName: { contains: filter.actor.trim(), mode: "insensitive" } });
  if (filter.area && filter.area in AUDIT_AREAS) and.push({ action: { startsWith: `${filter.area}.` } });
  if (filter.search?.trim()) and.push({ summary: { contains: filter.search.trim(), mode: "insensitive" } });
  const from = filter.from ? dayStart(filter.from) : null;
  const toDay = filter.to ? dayStart(filter.to) : null;
  if (from) and.push({ createdAt: { gte: from } });
  // „do“ včetně celého dne: do půlnoci následujícího dne
  if (toDay) and.push({ createdAt: { lt: startOfSchoolDay(toDay, 1) } });
  if (filter.userId) and.push(auditUserWhere(filter.userId));
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};
  const page = Math.max(0, Math.floor(filter.page ?? 0));

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
  ]);
  const impersonatorIds = [...new Set(rows.map((r) => r.impersonatorId).filter((x): x is string => !!x))];
  const impersonators = impersonatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: impersonatorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const names = new Map(impersonators.map((u) => [u.id, `${u.lastName} ${u.firstName}`.trim()]));

  return {
    total,
    pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorId: r.actorId,
      actorName: r.actorName,
      impersonatorName: r.impersonatorId ? (names.get(r.impersonatorId) ?? "smazaný uživatel") : null,
      action: r.action,
      areaLabel: auditAreaLabel(r.action),
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      data: r.data,
    })),
  };
}

/** Jméno uživatele, jehož historie se zobrazuje (hlavička stránky). */
export async function getHistoryUserName(userId: string): Promise<string | null> {
  await requirePermission("core.admin");
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}` : null;
}

export async function getHistorySettings(): Promise<{ retentionYears: number }> {
  await requirePermission("core.admin");
  return { retentionYears: await getAuditRetentionYears() };
}

export async function saveHistoryRetention(years: number) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    await saveSettings(admin, { [AUDIT_RETENTION_KEY]: years });
  });
}
