import type { User } from "@/lib/types";
import type { StudentTab } from "@/modules/server-types";
import { collectStudentTabs } from "@/modules/core/extensions";
import { formatName } from "@/lib/names";

// Zjednodušená navigace studenta (F12): jen záložky, na kterých pro něj něco je. Záložky dodávají zapnuté moduly
// (bod rozšíření `getStudentTabs`), rozhoduje se na serveru. Úvodní stránka po přihlášení: záložka, kde má
// student něco dokončit, jinak záložka, kde ještě něco může dělat, jinak prázdný stav (`/dashboard`).

export type StudentNav = {
  userId: string;
  name: string;
  email: string;
  initials: string;
  tabs: StudentTab[];
  /** Kam vede `/` pro studenta (první záložka, kde je co dělat; bez záložek prázdný stav). */
  home: string;
};

/** Úvodní stránka studenta podle jeho záložek. */
export function pickStudentHome(tabs: readonly StudentTab[]): string {
  const tab = tabs.find((t) => t.attention) ?? tabs.find((t) => !t.complete) ?? tabs[0];
  return tab?.href ?? "/dashboard";
}

export async function getStudentNav(user: User): Promise<StudentNav> {
  const tabs = await collectStudentTabs(user);
  return {
    userId: user.id,
    name: formatName(user, "text"),
    email: user.email,
    initials: `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase(),
    tabs,
    home: pickStudentHome(tabs),
  };
}
