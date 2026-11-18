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

/**
 * Klíče polí, ke kterým už existují odpovědi účastníků (i ve zrušených registracích). Takové pole se nesmí smazat:
 * klíč vlastního pole `custom_<n>` se po smazání může znovu použít a staré odpovědi by se přiřadily novému poli.
 */
export async function fieldKeysWithAnswers(db: Pick<TxClient, "$queryRaw">, eventId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ key: string }[]>`SELECT DISTINCT k AS key FROM "EventRegistration", jsonb_object_keys(answers) AS k WHERE "eventId" = ${eventId}`;
  return new Set(rows.map((r) => r.key));
}
