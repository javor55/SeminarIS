"use server";

import { safeAction } from "@/lib/safe-action";
import { requireAuth } from "@/lib/session";
import { saveSettings } from "@/lib/settings-registry";

/**
 * Uloží jedno nebo více nastavení z registru (formuláře sekcí administrace i modulů).
 * Oprávnění a hodnoty ověřuje registr podle deklarací; změny se zapíšou do historie.
 * Vrací klíče, které se skutečně změnily.
 */
export async function saveSettingsAction(changes: Record<string, string | number | boolean>) {
  return safeAction(async () => {
    const user = await requireAuth();
    return saveSettings(user, changes);
  });
}
