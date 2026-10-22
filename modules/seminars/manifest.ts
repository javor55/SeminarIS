import type { ModuleManifest } from "@/modules/types";

export const seminarsModule = {
  id: "seminars",
  name: "Zápis seminářů",
  description: "Zápisová okna, bloky a zápis studentů do volitelných seminářů.",
  enabledByDefault: true,
  permissions: {
    // Katalog seminářů
    "seminars.subjects.view": ["STUDENT", "TEACHER", "ADMIN"],
    "seminars.subjects.edit": ["TEACHER", "ADMIN"],
    // Archivace a trvalé smazání předmětu
    "seminars.subjects.archive": ["ADMIN"],
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
    { label: "Semináře", href: "/subjects", permission: "seminars.subjects.view", order: 20 },
  ],
  routes: [{ prefix: "/enrollments", permission: "seminars.windows.view" }],
} as const satisfies ModuleManifest;
