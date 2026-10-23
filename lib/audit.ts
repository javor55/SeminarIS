import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/prisma";

// Historie změn (AuditLog). Volá se ve STEJNÉ transakci jako změna samotná, aby se nemohla
// změna zapsat bez záznamu (a naopak):
//
//   await prisma.$transaction(async (tx) => {
//     await tx.user.update(…);
//     await audit(tx, user, { action: "users.role", entityType: "user", entityId: id, summary: "…" });
//   });
//
// `summary` je čitelný popis česky (zobrazuje se v Administraci → Historie), `data` jsou
// strukturovaná data před/po pro případné dohledání detailu.

/** Kdo změnu provedl: přihlášený uživatel (v náhledu i s `impersonatedBy`), nebo null = systém (cron). */
export type AuditActor = {
  id: string;
  firstName: string;
  lastName: string;
  impersonatedBy?: { id: string; name: string } | null;
} | null;

export type AuditEntry = {
  // oblast.entita.akce, např. "makeup.registration.remove"; oblast = první část
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  data?: Prisma.InputJsonValue;
};

export const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

export async function audit(db: TxClient, actor: AuditActor, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor ? fullName(actor) : "Systém",
      impersonatorId: actor?.impersonatedBy?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, 1000),
      data: entry.data,
    },
  });
}

/** Oblasti historie pro filtr (první část `action`). */
export const AUDIT_AREAS: Record<string, string> = {
  users: "Uživatelé",
  school: "Škola a třídy",
  settings: "Nastavení a moduly",
  subjects: "Předměty a úvazky",
  seminars: "Zápisy seminářů",
  makeup: "Dopisování",
  impersonation: "Náhled jako uživatel",
  system: "Systém",
};

export function auditAreaLabel(action: string): string {
  const area = action.split(".")[0];
  return AUDIT_AREAS[area] ?? area;
}

/** "denní limit: 90 → 100; hlavní vypínač: zapnuto → vypnuto" – jen položky, které se změnily. */
export function describeChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  labels: Record<keyof T & string, string>,
  format: (value: unknown) => string = (v) => (v === true ? "zapnuto" : v === false ? "vypnuto" : v == null || v === "" ? "—" : String(v))
): string {
  const parts: string[] = [];
  for (const key of Object.keys(labels) as (keyof T & string)[]) {
    if (before[key] !== after[key]) parts.push(`${labels[key]}: ${format(before[key])} → ${format(after[key])}`);
  }
  return parts.join("; ");
}
