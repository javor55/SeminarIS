import { prisma, type TxClient } from "@/lib/prisma";

// Informační položky přehledu „co udělat“, které správce skryl („Nezobrazovat“). Uloženo v nastavení systému
// (SystemSetting, klíč níže) jako seznam id položek, platí pro všechny správce. Skrýt jde jen informace;
// naléhavé a ke zpracování se zobrazují vždy.

export const HIDDEN_TODOS_KEY = "core.admin.hiddenTodos";

export async function getHiddenTodoIds(db: TxClient = prisma): Promise<string[]> {
  const row = await db.systemSetting.findUnique({ where: { key: HIDDEN_TODOS_KEY } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setHiddenTodoIds(ids: string[], db: TxClient = prisma) {
  const value = JSON.stringify([...new Set(ids)].sort());
  await db.systemSetting.upsert({ where: { key: HIDDEN_TODOS_KEY }, update: { value }, create: { key: HIDDEN_TODOS_KEY, value } });
}
