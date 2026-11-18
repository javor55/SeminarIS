import type { ModuleManifest } from "@/modules/types";

export const eventsModule = {
  id: "events",
  name: "Události",
  description: "Registrace veřejnosti na akce školy (dny otevřených dveří, konzultace, schůzky) přes veřejný odkaz.",
  enabledByDefault: true,
  permissions: {
    // Seznam událostí (učitel vidí svoje a ty, kde je spoluorganizátor)
    "events.view": ["TEACHER", "ADMIN"],
    // Zakládání a správa vlastních událostí (a těch, kde je uživatel spoluorganizátor)
    "events.manage.own": ["TEACHER", "ADMIN"],
    // Správa všech událostí (i cizích) a nastavení modulu
    "events.manage.all": ["ADMIN"],
  },
  nav: [{ label: "Události", href: "/events", permission: "events.view", order: 35 }],
  routes: [
    { prefix: "/events/settings", permission: "events.manage.all" },
    { prefix: "/events", permission: "events.view" },
  ],
  adminSections: [{ label: "Události", href: "/events/settings", permission: "events.manage.all", group: "modules", order: 120 }],
} as const satisfies ModuleManifest;
