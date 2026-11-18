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
  settings: [
    {
      key: "events.purgeAfterDays",
      type: "number",
      default: 90,
      min: 1,
      max: 3650,
      label: "Smazání osobních údajů po akci (dny)",
      description:
        "Tolik dní po konci události (konec posledního termínu, jinak konec registrace) se u registrací smaže e-mail, jméno a odpovědi. Počty, stavy a termíny zůstanou. Změna platí i pro události, kterým lhůta ještě neuplynula.",
      permission: "events.manage.all",
    },
    {
      key: "events.defaultConsentText",
      type: "string",
      default: "",
      multiline: true,
      maxLength: 5000,
      label: "Výchozí text souhlasu",
      description: "Použije se u událostí, které mají vlastní text souhlasu prázdný. Prázdné = vestavěný text. Odkaz na stránku Zpracování osobních údajů se přidá vždy.",
      permission: "events.manage.all",
    },
    {
      key: "events.defaultConfirmationText",
      type: "string",
      default: "",
      multiline: true,
      maxLength: 5000,
      label: "Výchozí text potvrzení",
      description: "Použije se u událostí, které mají vlastní text potvrzení prázdný (potvrzovací stránka a e-mail). Prázdné = žádný text.",
      permission: "events.manage.all",
    },
  ],
} as const satisfies ModuleManifest;
