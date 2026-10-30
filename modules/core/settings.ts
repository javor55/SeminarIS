import { getSetting } from "@/lib/settings-registry";

// Globální nastavení jádra: tenké obálky nad registrem nastavení (lib/settings-registry.ts,
// deklarace v modules/core/manifest.ts). Interní funkce bez autorizace (používá je i veřejná registrace).

export async function isRegistrationEnabled(): Promise<boolean> {
  try {
    return await getSetting<boolean>("registration_enabled");
  } catch {
    return false;
  }
}

export async function getDefaultRole(): Promise<"GUEST" | "STUDENT"> {
  try {
    return (await getSetting<string>("default_user_role")) === "STUDENT" ? "STUDENT" : "GUEST";
  } catch {
    return "GUEST";
  }
}

/** Výběr třídy při registraci: vypnuto / volitelný / povinný. */
export type RegistrationClassMode = "off" | "optional" | "required";

export async function getRegistrationClassMode(): Promise<RegistrationClassMode> {
  try {
    return await getSetting<RegistrationClassMode>("registration_class_mode");
  } catch {
    return "off";
  }
}
