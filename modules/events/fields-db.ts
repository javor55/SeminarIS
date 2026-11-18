import type { TxClient } from "@/lib/prisma";
import { FIXED_FIELDS } from "@/modules/events/form";

/**
 * Založí chybějící pevná pole formuláře (u nové události i u události vzniklé dřív, bez migrace dat).
 * Bezpečné volat opakovaně i souběžně (existující pole se nepřepisují).
 */
export async function ensureFixedFields(tx: Pick<TxClient, "eventField">, eventId: string) {
  await tx.eventField.createMany({
    data: FIXED_FIELDS.map((f, i) => ({ eventId, key: f.key, type: f.type, label: f.label, mode: f.mode, order: i, builtin: true })),
    skipDuplicates: true,
  });
}
