import type { Role } from "@/lib/types";

// Položka hlavního menu. Zobrazí se jen uživateli s daným oprávněním.
export type NavItem = {
  label: string;
  href: string;
  permission: string;
  // Pořadí v menu napříč moduly (nižší = víc vlevo)
  order: number;
};

// Pravidlo pro middleware: cesty začínající `prefix` vyžadují `permission`.
export type RouteRule = {
  prefix: string;
  permission: string;
};

/**
 * Manifest modulu – čistá data bez importů DB/Reactu, aby šel načíst
 * v middleware (Edge), v klientských komponentách i na serveru.
 * Serverové části modulu (dashboard widget, úklid při mazání uživatele, …)
 * jsou v `modules/<id>/server.ts`.
 */
export type ModuleManifest = {
  id: string;
  name: string;
  description: string;
  // Jádro nelze vypnout
  core?: boolean;
  // Výchozí stav, dokud admin modul výslovně nezapne/nevypne
  enabledByDefault: boolean;
  // Oprávnění modulu a role, které je mají
  permissions: Record<string, readonly Role[]>;
  nav: readonly NavItem[];
  routes: readonly RouteRule[];
};
