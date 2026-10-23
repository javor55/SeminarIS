import type { ModuleManifest } from "@/modules/types";

export const makeupModule = {
  id: "makeup",
  name: "Dopisování písemek",
  description: "Učitelé vypisují termíny pro dopsání zameškaných písemek, studenti se na ně zapisují.",
  enabledByDefault: true,
  permissions: {
    // Seznam vypsaných termínů
    "makeup.view": ["STUDENT", "TEACHER", "ADMIN"],
    // Zápis sebe sama na termín
    "makeup.register": ["STUDENT"],
    // Vypisování a správa vlastních termínů (dozor), odepsání/přesun studentů, docházka
    "makeup.sessions.manage": ["TEACHER", "ADMIN"],
    // Správa všech termínů (i cizích)
    "makeup.sessions.manageAll": ["ADMIN"],
    // Přehled „kdo dopisuje moje písemky“ (podle úvazků)
    "makeup.subjectTeacher": ["TEACHER", "ADMIN"],
  },
  nav: [{ label: "Dopisování", href: "/makeup", permission: "makeup.view", order: 30 }],
  routes: [
    { prefix: "/makeup/sessions", permission: "makeup.sessions.manage" },
    { prefix: "/makeup", permission: "makeup.view" },
  ],
} as const satisfies ModuleManifest;
