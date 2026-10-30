"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { saveSettings } from "@/lib/settings-registry";
import { requirePermission } from "@/lib/session";
import { MODULES } from "@/modules/registry";

export type AdminModuleInfo = {
  id: string;
  name: string;
  description: string;
  core: boolean;
  enabled: boolean;
};

/** Zapnutí/vypnutí modulu; zapisuje se přes registr nastavení (klíč `module.<id>.enabled`). */
export async function setModuleEnabledAction(moduleId: string, enabled: boolean) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    const mod = MODULES.find((m) => m.id === moduleId);
    if (!mod) throw new Error("Neznámý modul.");
    if ("core" in mod && mod.core) throw new Error("Jádro systému nelze vypnout.");
    await saveSettings(admin, { [`module.${moduleId}.enabled`]: enabled }, {
      audit: {
        action: "settings.module",
        entityType: "module",
        entityId: moduleId,
        summary: `Modul „${mod.name}“ ${enabled ? "zapnut" : "vypnut"}`,
        data: { module: moduleId, enabled },
      },
    });
  });
}

let isColdStart = true;

export async function runSystemDiagnostics() {
  const admin = await requirePermission("core.admin");
  const startTime = Date.now();

  // 1. Database Latency
  const dbStart = Date.now();
  await prisma.user.count();
  const dbLatency = Date.now() - dbStart;

  // 2. Session Latency
  const sessionCheckLatency = Date.now() - startTime;

  // 3. Env Health
  const envHealth = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    VERCEL_SPEED_INSIGHTS: !!process.env.VERCEL || !!process.env.VERCEL_SPEED_INSIGHTS_ID || !!process.env.NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS_ID,
  };

  const wasColdStart = isColdStart;
  isColdStart = false;

  return {
    dbLatency,
    sessionCheckLatency,
    envHealth,
    isFirstRequest: wasColdStart,
    serverTime: new Date().toISOString(),
    userRole: admin.role,
  };
}
