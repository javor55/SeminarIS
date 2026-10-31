import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { User } from "@/lib/types";
import { can, moduleIdOfPermission, type ModuleId, type Permission } from "@/modules/registry";
import { redirect } from "next/navigation";
import { isModuleEnabled } from "@/lib/modules";

// Serverové pomocné funkce pro autorizaci. Záměrně NEJSOU v "use server" souboru,
// aby se nedaly zavolat z klienta jako server action.

export async function getCurrentUser(): Promise<User | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as User | undefined;
  if (!user || user.isActive === false) return null;
  return user;
}

/** Hláška, kterou dostane každá změna provedená v režimu „zobrazit jako“. */
export const PREVIEW_READONLY_MESSAGE = "V režimu náhledu nelze nic měnit.";

/** Prohlíží admin právě aplikaci jako jiný uživatel? (mimo požadavek, např. v cronu, vždy false) */
export async function isImpersonating(): Promise<boolean> {
  try {
    return !!(await getCurrentUser())?.impersonatedBy;
  } catch {
    return false;
  }
}

/** Každá změna dat musí projít tudy (safeAction ji volá sám): v režimu náhledu vyhodí chybu. */
export async function assertNotImpersonating(): Promise<void> {
  if (await isImpersonating()) throw new Error(PREVIEW_READONLY_MESSAGE);
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** Vyhodí chybu, pokud je modul vypnutý. */
export async function requireModule(moduleId: ModuleId): Promise<void> {
  if (!(await isModuleEnabled(moduleId))) {
    throw new Error("Tento modul je vypnutý.");
  }
}

/** Přihlášený uživatel s oprávněním, v zapnutém modulu. */
export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireAuth();
  await requireModule(moduleIdOfPermission(permission) as ModuleId);
  if (!can(user.role, permission)) {
    throw new Error("Unauthorized: Access denied");
  }
  return user;
}

/**
 * Pro stránky: přihlášený uživatel s oprávněním, jinak přesměrování (nepřihlášený na úvod, bez práva na
 * dashboard). Middleware hlídá totéž podle manifestu, tohle je druhá, serverová pojistka přímo ve stránce.
 */
export async function requirePagePermission(permission: Permission): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, permission)) redirect("/dashboard");
  return user;
}
