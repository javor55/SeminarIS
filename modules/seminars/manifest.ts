import type { ModuleManifest } from "@/modules/types";

export const seminarsModule = {
  id: "seminars",
  name: "Zápis seminářů",
  description: "Zápisová okna, bloky a zápis studentů do předmětů (typicky volitelných seminářů).",
  enabledByDefault: true,
  permissions: {
    // Přehled zápisových oken
    "seminars.windows.view": ["TEACHER", "ADMIN"],
    // Správa oken, bloků, výskytů a exporty
    "seminars.windows.manage": ["ADMIN"],
    // Stránka Zápisy pro studenty a hosty (/zapisy): jen okna, která smí vidět (zveřejněná, ne koncept, určená jim)
    "seminars.enroll.view": ["STUDENT", "GUEST"],
    // Zápis sebe sama
    "seminars.enroll.self": ["STUDENT", "TEACHER", "ADMIN"],
    // Zápis/odepsání jiných studentů
    "seminars.enroll.others": ["TEACHER", "ADMIN"],
    // Zápis i mimo otevřené zápisové okno
    "seminars.enroll.anytime": ["ADMIN"],
  },
  nav: [
    // Učitel a admin: přehled a správa oken; student a host: vlastní stránka Zápisy
    { label: "Zápisy", href: "/enrollments", permission: "seminars.windows.view", order: 10 },
    { label: "Zápisy", href: "/zapisy", permission: "seminars.enroll.view", order: 10 },
  ],
  routes: [
    { prefix: "/zapisy", permission: "seminars.enroll.view" },
    { prefix: "/enrollments/settings", permission: "seminars.windows.manage" },
    { prefix: "/enrollments", permission: "seminars.windows.view" },
  ],
  adminSections: [{ label: "Semináře", href: "/enrollments/settings", permission: "seminars.windows.manage", order: 100 }],
  settings: [
    {
      key: "seminars.defaultVisibleToStudents",
      type: "boolean",
      default: false,
      label: "Nový zápis je hned viditelný studentům",
      description: "Výchozí hodnota při zakládání zápisového okna; v každém okně ji lze změnit.",
      permission: "seminars.windows.manage",
    },
    {
      key: "seminars.defaultReminderDaysBefore",
      type: "number",
      default: 0,
      min: 0,
      max: 60,
      label: "Připomínka nezapsaným (dní před koncem)",
      description: "Výchozí hodnota při zakládání zápisového okna. 0 = bez automatické připomínky.",
      permission: "seminars.windows.manage",
    },
  ],
} as const satisfies ModuleManifest;
