import { getSetting } from "@/lib/settings";

// Globální nastavení jádra. Interní funkce bez autorizace (používá je i veřejná registrace).

export async function isRegistrationEnabled(): Promise<boolean> {
  try {
    const value = await getSetting("registration_enabled");
    // Pokud klíč neexistuje, registrace je povolena (výchozí stav)
    return value == null ? true : value === "true";
  } catch {
    return false;
  }
}

export async function getDefaultRole(): Promise<"GUEST" | "STUDENT"> {
  try {
    const value = await getSetting("default_user_role");
    return value === "STUDENT" ? "STUDENT" : "GUEST";
  } catch {
    return "GUEST";
  }
}

/** Výběr třídy při registraci: vypnuto / volitelný / povinný. */
export type RegistrationClassMode = "off" | "optional" | "required";

export const REGISTRATION_CLASS_MODES: readonly RegistrationClassMode[] = ["off", "optional", "required"];

export const REGISTRATION_CLASS_MODE_KEY = "registration_class_mode";

export async function getRegistrationClassMode(): Promise<RegistrationClassMode> {
  try {
    const value = await getSetting(REGISTRATION_CLASS_MODE_KEY);
    return REGISTRATION_CLASS_MODES.includes(value as RegistrationClassMode) ? (value as RegistrationClassMode) : "off";
  } catch {
    return "off";
  }
}
