import { unstable_cache, revalidateTag } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MODULES } from "@/modules/registry";

// Stav zapnutí modulů je v SystemSetting pod klíčem `module.<id>.enabled` (deklarace a zápis
// v registru nastavení, lib/settings-registry.ts – ten po změně zavolá invalidateModulesCache).
const settingKey = (id: string) => `module.${id}.enabled`;
const MODULES_TAG = "modules";

async function loadEnabledModuleIds(): Promise<string[]> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: MODULES.map((m) => settingKey(m.id)) } },
  });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return MODULES.filter((m) => {
    if ("core" in m && m.core) return true;
    const value = stored.get(settingKey(m.id));
    return value == null ? m.enabledByDefault : value === "true";
  }).map((m) => m.id);
}

// Čte se v layoutu na každé stránce, proto je cachované a invaliduje se při změně.
export const getEnabledModuleIds = unstable_cache(loadEnabledModuleIds, ["enabled-modules"], {
  tags: [MODULES_TAG],
});

export async function isModuleEnabled(id: string): Promise<boolean> {
  return (await getEnabledModuleIds()).includes(id);
}

export function invalidateModulesCache() {
  revalidateTag(MODULES_TAG);
}

/** Pro layouty stránek modulu: vypnutý modul se tváří jako neexistující stránka. */
export async function ensureModulePage(id: string) {
  if (!(await isModuleEnabled(id))) notFound();
}
