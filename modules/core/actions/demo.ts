"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { clearDemoData, DEMO_TX_OPTIONS, seedDemoData, type DemoClearResult } from "@/modules/core/demo";
import { DEMO_CLEAR_CONFIRM_WORD, DEMO_SEED_CONFIRM_WORD } from "@/modules/core/demo/constants";

// Administrace → Ukázková data. Jen admin (core.admin); safeAction odmítne i režim „zobrazit jako“.
// Hromadné vkládání a mazání běží v jedné transakci s prodlouženým timeoutem; e-maily se neposílají.

const sameWord = (value: string | undefined, word: string) => (value ?? "").trim().toLocaleUpperCase("cs-CZ") === word;

export async function seedDemoDataAction(confirmWord: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    if (!sameWord(confirmWord, DEMO_SEED_CONFIRM_WORD)) throw new Error(`Pro naplnění opište ${DEMO_SEED_CONFIRM_WORD}.`);
    const result = await prisma.$transaction((tx) => seedDemoData(tx, admin), DEMO_TX_OPTIONS);
    revalidatePath("/", "layout");
    return result.summary;
  });
}

export async function clearDemoDataAction(confirmWord: string) {
  return safeAction(async (): Promise<DemoClearResult> => {
    const admin = await requirePermission("core.admin");
    if (!sameWord(confirmWord, DEMO_CLEAR_CONFIRM_WORD)) throw new Error(`Pro smazání opište ${DEMO_CLEAR_CONFIRM_WORD}.`);
    const result = await prisma.$transaction((tx) => clearDemoData(tx, admin), DEMO_TX_OPTIONS);
    revalidatePath("/", "layout");
    return result;
  });
}
