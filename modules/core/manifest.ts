import type { ModuleManifest } from "@/modules/types";

export const coreModule = {
  id: "core",
  name: "Jádro systému",
  description: "Uživatelé, přihlášení, profil, škola (třídy, předměty, úvazky) a administrace.",
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
    // Školní roky, třídy, předměty a úvazky
    "core.school.manage": ["ADMIN"],
  },
  nav: [
    { label: "Dashboard", href: "/", permission: "core.dashboard", order: 0 },
    { label: "Uživatelé", href: "/users", permission: "core.users.view", order: 80 },
    { label: "Škola", href: "/school", permission: "core.school.manage", order: 85 },
    { label: "Administrace", href: "/admin", permission: "core.admin", order: 90 },
    { label: "Můj profil", href: "/profile", permission: "core.profile", order: 100 },
  ],
  routes: [
    { prefix: "/users", permission: "core.users.view" },
    { prefix: "/admin", permission: "core.admin" },
    { prefix: "/school", permission: "core.school.manage" },
  ],
} as const satisfies ModuleManifest;
