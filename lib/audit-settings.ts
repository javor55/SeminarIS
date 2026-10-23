import { prisma, type TxClient } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";

// Jak dlouho se uchovává historie změn (AuditLog). Starší záznamy maže denní úloha.

export const AUDIT_RETENTION_KEY = "audit.retentionYears";
export const DEFAULT_AUDIT_RETENTION_YEARS = 2;
export const MAX_AUDIT_RETENTION_YEARS = 20;

export async function getAuditRetentionYears(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: AUDIT_RETENTION_KEY } });
  const n = Number(row?.value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_AUDIT_RETENTION_YEARS ? n : DEFAULT_AUDIT_RETENTION_YEARS;
}

export async function setAuditRetentionYears(years: number, db: TxClient = prisma) {
  if (!Number.isInteger(years) || years < 1 || years > MAX_AUDIT_RETENTION_YEARS) {
    throw new Error(`Doba uchování musí být 1–${MAX_AUDIT_RETENTION_YEARS} let.`);
  }
  await setSetting(AUDIT_RETENTION_KEY, String(years), db);
}
