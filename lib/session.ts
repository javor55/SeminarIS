import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { User } from "@/lib/types";
import { can, moduleIdOfPermission, type ModuleId, type Permission } from "@/modules/registry";
import { isModuleEnabled } from "@/lib/modules";

// Serverové pomocné funkce pro autorizaci. Záměrně NEJSOU v "use server" souboru,
// aby se nedaly zavolat z klienta jako server action.

export async function getCurrentUser(): Promise<User | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as User | undefined;
  if (!user || user.isActive === false) return null;
  return user;
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
