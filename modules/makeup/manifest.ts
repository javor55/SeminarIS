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
    { prefix: "/makeup/settings", permission: "makeup.sessions.manageAll" },
    { prefix: "/makeup/sessions", permission: "makeup.sessions.manage" },
    { prefix: "/makeup", permission: "makeup.view" },
  ],
  adminSections: [{ label: "Dopisování", href: "/makeup/settings", permission: "makeup.sessions.manageAll", order: 110 }],
  settings: [
    {
      key: "makeup.defaultCapacity",
      type: "number",
      default: 10,
      min: 1,
      max: 500,
      label: "Výchozí kapacita termínu",
      description: "Předvyplní se při vypisování nového termínu dopisování.",
      permission: "makeup.sessions.manageAll",
    },
    {
      key: "makeup.defaultChangeDeadlineMinutes",
      type: "enum",
      default: "60",
      options: [
        { value: "0", label: "Bez uzávěrky (do začátku termínu)" },
        { value: "30", label: "30 minut před začátkem" },
        { value: "60", label: "1 hodina před začátkem" },
        { value: "120", label: "2 hodiny před začátkem" },
        { value: "1440", label: "1 den před začátkem" },
        { value: "2880", label: "2 dny před začátkem" },
      ],
      label: "Výchozí uzávěrka zápisu a změn",
      description: "Předvyplní se při vypisování nového termínu; zápis, odhlášení i přepis jsou možné nejpozději tolik před začátkem.",
      permission: "makeup.sessions.manageAll",
    },
  ],
} as const satisfies ModuleManifest;
