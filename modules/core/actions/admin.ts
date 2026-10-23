"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";
import { getEnabledModuleIds, invalidateModulesCache, setModuleEnabled } from "@/lib/modules";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";
import { MODULES } from "@/modules/registry";
import { MODULE_SERVERS } from "@/modules/server-registry";
import type { AdminStat } from "@/modules/server-types";
import {
  REGISTRATION_CLASS_MODES,
  REGISTRATION_CLASS_MODE_KEY,
  getDefaultRole,
  getRegistrationClassMode,
  isRegistrationEnabled,
  type RegistrationClassMode,
} from "@/modules/core/settings";
import { getSchoolYearInfo } from "@/modules/core/school";
import { ROLE_LABELS } from "@/lib/school";
import { AUTH_SETTING_KEYS, PASSWORD_SCOPES, getAuthSettings, type PasswordLoginScope } from "@/lib/auth-settings";

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

  const [registrationEnabled, defaultRole, classMode, auth, schoolYear] = await Promise.all([
    isRegistrationEnabled(),
    getDefaultRole(),
    getRegistrationClassMode(),
    getAuthSettings(),
    getSchoolYearInfo(),
  ]);

  const modules: AdminModuleInfo[] = MODULES.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    core: "core" in m && m.core,
    enabled: enabledIds.includes(m.id),
  }));

  return { stats: statGroups.flat(), registrationEnabled, defaultRole, classMode, modules, auth, schoolYear };
}

const onOff = (v: boolean) => (v ? "zapnuto" : "vypnuto");

export async function setRegistrationEnabled(enabled: boolean) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    return await prisma.$transaction(async (tx) => {
      const before = await isRegistrationEnabled();
      const res = await setSetting("registration_enabled", enabled ? "true" : "false", tx);
      await audit(tx, admin, {
        action: "settings.registration",
        entityType: "setting",
        entityId: "registration_enabled",
        summary: `Registrace nových uživatelů: ${onOff(before)} → ${onOff(enabled)}`,
        data: { before, after: enabled },
      });
      return res;
    });
  });
}

export async function setDefaultRole(role: "GUEST" | "STUDENT") {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    if (role !== "GUEST" && role !== "STUDENT") throw new Error("Neplatná role.");
    return await prisma.$transaction(async (tx) => {
      const before = await getDefaultRole();
      const res = await setSetting("default_user_role", role, tx);
      await audit(tx, admin, {
        action: "settings.defaultRole",
        entityType: "setting",
        entityId: "default_user_role",
        summary: `Výchozí role nových uživatelů: ${ROLE_LABELS[before]} → ${ROLE_LABELS[role]}`,
        data: { before, after: role },
      });
      return res;
    });
  });
}

const CLASS_MODE_LABELS: Record<RegistrationClassMode, string> = { off: "vypnuto", optional: "volitelný", required: "povinný" };

/** Výběr třídy při registraci: vypnuto / volitelný / povinný. */
export async function setRegistrationClassMode(mode: RegistrationClassMode) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    if (!REGISTRATION_CLASS_MODES.includes(mode)) throw new Error("Neplatná volba.");
    return await prisma.$transaction(async (tx) => {
      const before = await getRegistrationClassMode();
      const res = await setSetting(REGISTRATION_CLASS_MODE_KEY, mode, tx);
      await audit(tx, admin, {
        action: "settings.classMode",
        entityType: "setting",
        entityId: REGISTRATION_CLASS_MODE_KEY,
        summary: `Výběr třídy při registraci: ${CLASS_MODE_LABELS[before]} → ${CLASS_MODE_LABELS[mode]}`,
        data: { before, after: mode },
      });
      return res;
    });
  });
}

export async function setModuleEnabledAction(moduleId: string, enabled: boolean) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    const mod = MODULES.find((m) => m.id === moduleId);
    await prisma.$transaction(async (tx) => {
      await setModuleEnabled(moduleId, enabled, tx);
      await audit(tx, admin, {
        action: "settings.module",
        entityType: "module",
        entityId: moduleId,
        summary: `Modul „${mod?.name ?? moduleId}“ ${enabled ? "zapnut" : "vypnut"}`,
        data: { module: moduleId, enabled },
      });
    });
    invalidateModulesCache();
  });
}

const PASSWORD_SCOPE_NAMES: Record<PasswordLoginScope, string> = { ALL: "všichni", STAFF: "jen učitelé a admini", ADMIN: "jen admini" };

/** Nastavení přihlašování (Microsoft 365 / heslo). Přístupové údaje k Microsoftu jsou v env. */
export async function setAuthSettings(data: {
  microsoftEnabled?: boolean;
  microsoftAutoCreate?: boolean;
  passwordScope?: PasswordLoginScope;
}) {
  return safeAction(async () => {
    const admin = await requirePermission("core.admin");
    if (data.passwordScope !== undefined && !PASSWORD_SCOPES.includes(data.passwordScope)) throw new Error("Neplatná volba.");
    const before = await getAuthSettings();
    await prisma.$transaction(async (tx) => {
      const parts: string[] = [];
      if (data.microsoftEnabled !== undefined) {
        await setSetting(AUTH_SETTING_KEYS.microsoftEnabled, data.microsoftEnabled ? "true" : "false", tx);
        parts.push(`přihlášení přes Microsoft 365: ${onOff(before.microsoftEnabled)} → ${onOff(data.microsoftEnabled)}`);
      }
      if (data.microsoftAutoCreate !== undefined) {
        await setSetting(AUTH_SETTING_KEYS.microsoftAutoCreate, data.microsoftAutoCreate ? "true" : "false", tx);
        parts.push(`zakládání účtů při prvním přihlášení: ${onOff(before.microsoftAutoCreate)} → ${onOff(data.microsoftAutoCreate)}`);
      }
      if (data.passwordScope !== undefined) {
        await setSetting(AUTH_SETTING_KEYS.passwordScope, data.passwordScope, tx);
        parts.push(`kdo se smí přihlásit heslem: ${PASSWORD_SCOPE_NAMES[before.passwordScope]} → ${PASSWORD_SCOPE_NAMES[data.passwordScope]}`);
      }
      await audit(tx, admin, {
        action: "settings.auth",
        entityType: "setting",
        entityId: "auth",
        summary: `Nastavení přihlašování: ${parts.join("; ") || "beze změny"}`,
        data: { before: { microsoftEnabled: before.microsoftEnabled, microsoftAutoCreate: before.microsoftAutoCreate, passwordScope: before.passwordScope }, change: data },
      });
    });
    return getAuthSettings();
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
