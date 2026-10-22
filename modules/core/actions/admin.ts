"use server";

import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";
import { getEnabledModuleIds, setModuleEnabled } from "@/lib/modules";
import { requirePermission } from "@/lib/session";
import { MODULES } from "@/modules/registry";
import { MODULE_SERVERS } from "@/modules/server-registry";
import type { AdminStat } from "@/modules/server-types";
import { getDefaultRole, getGlobalCohort, isRegistrationEnabled } from "@/modules/core/settings";

export type AdminModuleInfo = {
  id: string;
  name: string;
  description: string;
  core: boolean;
  enabled: boolean;
};

// === SYSTEM SETTINGS & STATS ===

/** Vše, co potřebuje administrační centrum, jedním voláním. */
export async function getAdminOverview() {
  await requirePermission("core.admin");
  const enabledIds = await getEnabledModuleIds();

  const statGroups = await Promise.all(
    MODULE_SERVERS.filter(({ id }) => enabledIds.includes(id)).map(({ server }) =>
      server.getAdminStats ? server.getAdminStats() : Promise.resolve([] as AdminStat[])
    )
  );

  const [cohort, registrationEnabled, defaultRole] = await Promise.all([
    getGlobalCohort(),
    isRegistrationEnabled(),
    getDefaultRole(),
  ]);

  const modules: AdminModuleInfo[] = MODULES.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    core: "core" in m && m.core,
    enabled: enabledIds.includes(m.id),
  }));

  return { stats: statGroups.flat(), cohort, registrationEnabled, defaultRole, modules };
}

export async function setGlobalCohort(cohort: string) {
  await requirePermission("core.admin");
  return await setSetting("current_cohort", cohort);
}

export async function setRegistrationEnabled(enabled: boolean) {
  await requirePermission("core.admin");
  return await setSetting("registration_enabled", enabled ? "true" : "false");
}

export async function setDefaultRole(role: "GUEST" | "STUDENT") {
  await requirePermission("core.admin");
  if (role !== "GUEST" && role !== "STUDENT") throw new Error("Neplatná role.");
  return await setSetting("default_user_role", role);
}

export async function setModuleEnabledAction(moduleId: string, enabled: boolean) {
  await requirePermission("core.admin");
  await setModuleEnabled(moduleId, enabled);
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
