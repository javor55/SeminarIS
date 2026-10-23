import { prisma } from "@/lib/prisma";

// Čtení a zápis klíč–hodnota nastavení (tabulka SystemSetting).
// Interní helpery bez autorizace – volají je server actions, které ji řeší.

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
