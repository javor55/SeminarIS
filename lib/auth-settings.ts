import { getSettingValues } from "@/lib/settings-registry";
import type { Role } from "@/lib/types";

// Nastavení přihlašování (Microsoft 365 a heslo). Hodnoty jsou v registru nastavení (SystemSetting),
// přístupové údaje k Microsoftu v proměnných prostředí (nikdy ne v DB ani v repu).

/** Kdo se smí přihlásit heslem, když je zapnuté Microsoft 365. Admin vždy. */
export type PasswordLoginScope = "ALL" | "STAFF" | "ADMIN";

export const PASSWORD_SCOPES: readonly PasswordLoginScope[] = ["ALL", "STAFF", "ADMIN"];

export const AUTH_SETTING_KEYS = {
  microsoftEnabled: "auth.microsoft.enabled",
  microsoftAutoCreate: "auth.microsoft.autoCreate",
  passwordScope: "auth.password.scope",
} as const;

export type AuthSettings = {
  // Jsou nastavené proměnné AZURE_AD_* (registrace aplikace v Microsoft Entra ID)?
  microsoftConfigured: boolean;
  // Admin přihlášení přes Microsoft nevypnul
  microsoftEnabled: boolean;
  // Smí se přes Microsoft přihlásit i ten, kdo v systému ještě nemá účet (založí se)?
  microsoftAutoCreate: boolean;
  passwordScope: PasswordLoginScope;
};

export function isMicrosoftConfigured(): boolean {
  return !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID);
}

export async function getAuthSettings(): Promise<AuthSettings> {
  const v = await getSettingValues((d) => Object.values(AUTH_SETTING_KEYS).includes(d.key as never));
  return {
    microsoftConfigured: isMicrosoftConfigured(),
    microsoftEnabled: v[AUTH_SETTING_KEYS.microsoftEnabled] === true,
    microsoftAutoCreate: v[AUTH_SETTING_KEYS.microsoftAutoCreate] === true,
    passwordScope: v[AUTH_SETTING_KEYS.passwordScope] as PasswordLoginScope,
  };
}

/** Lze se právě teď přihlásit přes Microsoft 365? */
export function isMicrosoftActive(settings: AuthSettings): boolean {
  return settings.microsoftConfigured && settings.microsoftEnabled;
}

/**
 * Smí se uživatel s rolí přihlásit heslem? Omezení platí jen tehdy, když je
 * Microsoft 365 skutečně k dispozici – jinak by se nikdo nedostal dovnitř.
 */
export function isPasswordLoginAllowed(settings: AuthSettings, role: Role): boolean {
  if (!isMicrosoftActive(settings)) return true;
  switch (settings.passwordScope) {
    case "ALL":
      return true;
    case "STAFF":
      return role === "TEACHER" || role === "ADMIN";
    case "ADMIN":
      return role === "ADMIN";
  }
}
