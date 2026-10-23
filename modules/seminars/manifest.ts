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
    // Zápis sebe sama
    "seminars.enroll.self": ["STUDENT", "TEACHER", "ADMIN"],
    // Zápis/odepsání jiných studentů
    "seminars.enroll.others": ["TEACHER", "ADMIN"],
    // Zápis i mimo otevřené zápisové okno
    "seminars.enroll.anytime": ["ADMIN"],
  },
  nav: [
    { label: "Zápisy", href: "/enrollments", permission: "seminars.windows.view", order: 10 },
  ],
  routes: [{ prefix: "/enrollments", permission: "seminars.windows.view" }],
} as const satisfies ModuleManifest;
