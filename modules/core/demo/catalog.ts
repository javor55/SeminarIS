// Katalog předmětů ukázkových dat. `teachers` jsou pořadová čísla ukázkových učitelů (0–14);
// každý učitel učí aspoň jeden předmět. Semináře jsou jen pro 4. ročník.

export type DemoSubjectSpec = {
  code: string;
  name: string;
  description: string;
  grades: number[];
  compulsory: boolean;
  teachers: number[];
};

export const DEMO_TEACHER_COUNT = 15;
export const DEMO_STUDENTS_PER_CLASS = 20;
export const DEMO_GUEST_COUNT = 4;
export const DEMO_GRADES = [1, 2, 3, 4] as const;
export const DEMO_LETTERS = ["A", "B", "C"] as const;

export const DEMO_SUBJECTS: DemoSubjectSpec[] = [
  { code: "ČJL", name: "Český jazyk a literatura", description: "Mluvnice, sloh a dějiny literatury.", grades: [1, 2, 3, 4], compulsory: true, teachers: [0, 1] },
  { code: "AJ", name: "Anglický jazyk", description: "Obecná a odborná angličtina, příprava na maturitu.", grades: [1, 2, 3, 4], compulsory: true, teachers: [2, 3] },
  { code: "NJ", name: "Německý jazyk", description: "Druhý cizí jazyk.", grades: [1, 2, 3, 4], compulsory: true, teachers: [4] },
  { code: "MAT", name: "Matematika", description: "Algebra, geometrie, analýza.", grades: [1, 2, 3, 4], compulsory: true, teachers: [5, 6] },
  { code: "FYZ", name: "Fyzika", description: "Mechanika, elektřina, optika, moderní fyzika.", grades: [1, 2, 3], compulsory: true, teachers: [7] },
  { code: "CHE", name: "Chemie", description: "Obecná, anorganická a organická chemie.", grades: [1, 2, 3], compulsory: true, teachers: [8] },
  { code: "BIO", name: "Biologie", description: "Biologie buňky, organismů a ekologie.", grades: [1, 2, 3], compulsory: true, teachers: [9] },
  { code: "DEJ", name: "Dějepis", description: "Světové a české dějiny.", grades: [1, 2, 3, 4], compulsory: true, teachers: [10] },
  { code: "ZEM", name: "Zeměpis", description: "Fyzická a společenská geografie.", grades: [1, 2], compulsory: true, teachers: [11] },
  { code: "INF", name: "Informatika", description: "Algoritmizace, programování a práce s daty.", grades: [1, 2, 3], compulsory: true, teachers: [12] },
  { code: "TEV", name: "Tělesná výchova", description: "Sportovní hry, atletika, plavání.", grades: [1, 2, 3, 4], compulsory: true, teachers: [13, 14] },
  { code: "ZSV", name: "Základy společenských věd", description: "Politologie, právo, ekonomie a filozofie.", grades: [2, 3, 4], compulsory: true, teachers: [10, 1] },
  { code: "HV", name: "Hudební výchova", description: "Hudební nauka a dějiny hudby.", grades: [1, 2], compulsory: true, teachers: [14] },
  { code: "SMA", name: "Seminář z matematiky", description: "Příprava na maturitu a přijímací zkoušky na vysoké školy.", grades: [4], compulsory: false, teachers: [5] },
  { code: "SFY", name: "Seminář z fyziky", description: "Řešení úloh, laboratorní práce, fyzikální olympiáda.", grades: [4], compulsory: false, teachers: [7] },
  { code: "SBI", name: "Seminář z biologie", description: "Genetika, anatomie a příprava k maturitě.", grades: [4], compulsory: false, teachers: [9] },
  { code: "SCH", name: "Seminář z chemie", description: "Laboratorní cvičení a příprava k maturitě.", grades: [4], compulsory: false, teachers: [8] },
  { code: "SDE", name: "Seminář z dějepisu", description: "Dějiny 20. století a práce s prameny.", grades: [4], compulsory: false, teachers: [10] },
  { code: "KAJ", name: "Konverzace v anglickém jazyce", description: "Mluvení, diskuse a příprava na certifikát.", grades: [4], compulsory: false, teachers: [2, 3] },
  { code: "PSY", name: "Psychologie", description: "Základy obecné a sociální psychologie.", grades: [4], compulsory: false, teachers: [11] },
  { code: "EKO", name: "Základy ekonomie", description: "Mikroekonomie, makroekonomie a osobní finance.", grades: [4], compulsory: false, teachers: [6] },
  { code: "PRG", name: "Programování aplikací", description: "Vývoj webových a mobilních aplikací.", grades: [4], compulsory: false, teachers: [12] },
];
