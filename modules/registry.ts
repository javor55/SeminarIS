import type { Role } from "@/lib/types";
import type { NavItem } from "@/modules/types";
import { coreModule } from "@/modules/core/manifest";
import { seminarsModule } from "@/modules/seminars/manifest";
import { makeupModule } from "@/modules/makeup/manifest";

/**
 * Registr modulů. Nový modul = nová složka v `modules/` s `manifest.ts`
 * (a případně `server.ts`) + přidání sem a do `modules/server-registry.ts`.
 * Soubor je bez závislostí na DB, používá ho i middleware a klient.
 */
export const MODULES = [coreModule, seminarsModule, makeupModule] as const;

type AnyModule = (typeof MODULES)[number];
export type ModuleId = AnyModule["id"];
type PermissionsOf<M> = M extends { permissions: infer P } ? keyof P : never;
export type Permission = PermissionsOf<AnyModule> & string;

const permissionRoles: Record<string, readonly Role[]> = Object.assign(
  {},
  ...MODULES.map((m) => m.permissions)
);

export function getModule(id: string): AnyModule | undefined {
  return MODULES.find((m) => m.id === id);
}

export function moduleIdOfPermission(permission: string): string {
  return permission.split(".")[0];
}

/** Má role dané oprávnění? (Nezohledňuje, zda je modul zapnutý.) */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return permissionRoles[permission]?.includes(role) ?? false;
}

/** Položky menu pro roli ze zapnutých modulů, seřazené napříč moduly. */
export function getNavItems(role: Role | null | undefined, enabledModuleIds: readonly string[]): NavItem[] {
  return MODULES.filter((m) => enabledModuleIds.includes(m.id))
    .flatMap((m) => m.nav as readonly NavItem[])
    .filter((item) => can(role, item.permission as Permission))
    .sort((a, b) => a.order - b.order);
}

/** Oprávnění vyžadované pro cestu (pro middleware), nebo null. */
export function getRoutePermission(pathname: string): Permission | null {
  for (const m of MODULES) {
    for (const rule of m.routes) {
      if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
        return rule.permission as Permission;
      }
    }
  }
  return null;
}
