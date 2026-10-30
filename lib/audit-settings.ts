import { getSetting } from "@/lib/settings-registry";

// Jak dlouho se uchovává historie změn (AuditLog). Starší záznamy maže denní úloha.
// Hodnota je v registru nastavení (klíč `audit.retentionYears`, 1–20 let, výchozí 2).

export const AUDIT_RETENTION_KEY = "audit.retentionYears";

export async function getAuditRetentionYears(): Promise<number> {
  return getSetting<number>(AUDIT_RETENTION_KEY);
}
