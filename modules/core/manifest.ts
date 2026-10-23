import type { ModuleManifest } from "@/modules/types";

export const coreModule = {
  id: "core",
  name: "Jádro systému",
  description: "Uživatelé a třídy, předměty, přihlášení, profil a administrace.",
  core: true,
  enabledByDefault: true,
  permissions: {
    "core.dashboard": ["STUDENT", "TEACHER", "ADMIN"],
    "core.profile": ["STUDENT", "TEACHER", "ADMIN"],
    // Seznam uživatelů (učitelé jen čtou)
    "core.users.view": ["TEACHER", "ADMIN"],
    // Úpravy, import, role, mazání uživatelů
    "core.users.manage": ["ADMIN"],
    // Administrační centrum a globální nastavení
    "core.admin": ["ADMIN"],
    // Školní rok (uzavření roku) a úvazky učitelů
    "core.school.manage": ["ADMIN"],
    // Předměty: katalog, úpravy a archivace/smazání
    "core.subjects.view": ["STUDENT", "TEACHER", "ADMIN"],
    "core.subjects.edit": ["TEACHER", "ADMIN"],
    "core.subjects.archive": ["ADMIN"],
  },
  nav: [
    { label: "Dashboard", href: "/", permission: "core.dashboard", order: 0 },
    { label: "Předměty", href: "/subjects", permission: "core.subjects.view", order: 20 },
    { label: "Uživatelé", href: "/users", permission: "core.users.view", order: 80 },
    { label: "Administrace", href: "/admin", permission: "core.admin", order: 90 },
    { label: "Můj profil", href: "/profile", permission: "core.profile", order: 100 },
  ],
  routes: [
    { prefix: "/users", permission: "core.users.view" },
    { prefix: "/admin", permission: "core.admin" },
    { prefix: "/subjects", permission: "core.subjects.view" },
  ],
} as const satisfies ModuleManifest;
