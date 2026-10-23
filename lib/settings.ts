import { prisma, type TxClient } from "@/lib/prisma";

// Čtení a zápis klíč–hodnota nastavení (tabulka SystemSetting).
// Interní helpery bez autorizace – volají je server actions, které ji řeší.

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

/** `db` = transakce (kvůli zápisu do historie změn ve stejné transakci). */
export async function setSetting(key: string, value: string, db: TxClient = prisma) {
  return db.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
