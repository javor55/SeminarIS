 
import type { ReactNode } from "react";
import type { TxClient } from "@/lib/prisma";
import type { User } from "@/lib/types";
import type { EmailEventId } from "@/lib/email/events";
import type { AdminTodo, SubjectBadge, SubjectUsageItem } from "@/modules/types";

// === Ukázková data pro prezentaci (F9) ===

/** Osoba z ukázkových dat jádra (učitel, student, host). */
export type DemoPerson = { id: string; firstName: string; lastName: string; email: string };
export type DemoStudent = DemoPerson & { classGroupId: string; grade: number };
export type DemoClass = { id: string; grade: number; letter: string; label: string };
export type DemoSubject = {
  id: string;
  name: string;
  code: string | null;
  // Ročníky, ve kterých se předmět vyučuje
  grades: number[];
  // Povinný předmět (false = seminář pro 4. ročník)
  compulsory: boolean;
  // Učitelé, kteří předmět učí (id)
  teacherIds: string[];
};
export type DemoTeaching = { teacherId: string; subjectId: string; classGroupId: string };

/** Deterministický generátor (stejný seed = stejná data). */
export type DemoRandom = {
  // Desetinné číslo z [0, 1)
  next(): number;
  // Celé číslo z [min, max]
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  // Nová pole v náhodném pořadí
  shuffle<T>(items: readonly T[]): T[];
  // true s danou pravděpodobností
  chance(p: number): boolean;
};

/** Referenční data jádra, která ukázková data jádra vytvořila (nebo našla) a moduly na nich staví. */
export type DemoCoreData = {
  schoolYear: { id: string; startYear: number };
  classes: DemoClass[];
  teachers: DemoPerson[];
  students: DemoStudent[];
  guests: DemoPerson[];
  subjects: DemoSubject[];
  // Úvazky ukázkových učitelů (kdo učí jaký předmět v jaké třídě)
  teaching: DemoTeaching[];
};

/** Společné pro seed i clear. */
export type DemoBaseContext = {
  // Admin, který akci spustil (autor záznamů a náhradník za smazané uživatele)
  actor: User;
  now: Date;
  // Zapíše záznamy do evidence (ve stejné transakci jako samotné záznamy)
  track(model: string, ids: readonly string[]): Promise<void>;
};

export type DemoSeedContext = DemoBaseContext & {
  rng: DemoRandom;
  core: DemoCoreData;
  // Společný hash hesla ukázkových účtů
  passwordHash: string;
};

export type DemoClearContext = DemoBaseContext & {
  // Id ze evidence pro daný model (načtené před mazáním)
  ids(model: string): string[];
};

/**
 * Ukázková data modulu. `seed` vytvoří záznamy a každý zapíše přes `ctx.track`; nesmí volat
 * e-mailové události. `clear` smaže záznamy modulu podle evidence (`ctx.ids`) a uklidí vazby
 * skutečných záznamů na ukázkové uživatele; jádro po něm smaže ukázkové uživatele, třídy a předměty
 * (včetně kaskády). Jádro volá `seed` jen u zapnutých modulů, `clear` u všech.
 */
export type ModuleDemoData = {
  // Popisky modelů evidence pro přehled v administraci, např. { StudentEnrollment: "Zápisy studentů" }
  labels: Record<string, string>;
  seed(tx: TxClient, ctx: DemoSeedContext): Promise<void>;
  clear(tx: TxClient, ctx: DemoClearContext): Promise<void>;
};

/** Záložka (detail předmětu, detail uživatele). Obsah je serverová komponenta modulu. */
export type ModuleTab = {
  // Jedinečné v rámci modulu; jádro ho před použitím prefixuje id modulu
  id: string;
  label: string;
  // Pořadí záložek (nižší = dříve); záložky jádra mají 0–99, moduly 100+
  order: number;
  content: ReactNode;
};

/** Karta na dashboardu (F8). Obsah je serverová komponenta modulu; vlastní práce probíhá na stránkách modulů. */
export type DashboardCard = {
  // Jedinečné v rámci modulu; jádro ho prefixuje id modulu
  id: string;
  title: string;
  // Pořadí karet (nižší = dříve)
  order: number;
  // Šířka v mřížce: sm = třetina, md = polovina (výchozí), lg = celá šířka
  size?: "sm" | "md" | "lg";
  content: ReactNode;
  // Odkaz v záhlaví karty (stránka modulu, kde se pracuje) a jeho popisek
  href?: string;
  linkLabel?: string;
  // Nejbližší věci z této karty pro pás „Nejbližší“ nad kartami (F13): jedna věta o tom, co je nejdřív potřeba
  highlights?: DashboardHighlight[];
};

/** Jedna „nejbližší věc“ v pásu nad kartami dashboardu učitele a admina (F13). Karty zůstávají zdrojem pravdy. */
export type DashboardHighlight = {
  // Jedinečné v rámci modulu; jádro ho prefixuje id modulu
  id: string;
  // Pořadí v pásu (nižší = dříve)
  order: number;
  // attention = něco se blíží / chybí, success = běží to dobře, info = jen k vědomí
  tone: "attention" | "success" | "info";
  icon: "clock" | "chart" | "people";
  title: string;
  text: string;
  href?: string;
};

/**
 * Záložka zjednodušené navigace studenta (F12). Student vidí jen záložky, které mu moduly vrátí
 * (např. „Zápis seminářů“, „Dopisování písemek“); modul ji vrací jen tehdy, když na ní pro studenta něco je.
 */
export type StudentTab = {
  // Jedinečné v rámci modulu; jádro ho prefixuje id modulu
  id: string;
  label: string;
  // Stránka modulu, kam záložka vede (může vést rovnou do detailu, např. jediného otevřeného zápisu)
  href: string;
  // Ikona záložky (klient zná jen tyto)
  icon: "book" | "pencil";
  // Pořadí záložek (nižší = dříve)
  order: number;
  // Student má něco dokončit (tečka na záložce, záložka se otevře jako úvodní)
  attention?: boolean;
  // V modulu už není nic, co by student musel udělat; úvodní je pak jiná záložka, pokud nějaká je
  complete?: boolean;
};

/** Sekce stránky „Moje předměty“ (F4), kterou přispívá modul. Obsah je serverová komponenta modulu. */
export type MySubjectsSection = {
  // Jedinečné v rámci modulu; jádro ho prefixuje id modulu
  id: string;
  title: string;
  description?: string;
  // Pořadí sekcí (nižší = výš); sekce jádra mají 0–99, moduly 100+
  order: number;
  content: ReactNode;
};

/** Uživatel v hromadné akci (jádro ho načte jednou, akce nemusí sahat do DB kvůli základním údajům). */
export type BulkUserInfo = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: User["role"];
  isActive: boolean;
  classGroupId: string | null;
  // „3.A“ nebo null
  classLabel: string | null;
  studyStatus: "ACTIVE" | "GRADUATED" | "LEFT";
};

/** Parametr hromadné akce zadávaný v potvrzovacím dialogu (např. cílová třída, předmět e-mailu). */
export type BulkActionParam = {
  key: string;
  label: string;
  type: "select" | "text" | "textarea";
  // Jen pro `select`
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
};

/** Náhled dopadu akce: koho se týká, koho se přeskočí a co se stane (texty pro potvrzovací dialog). */
export type BulkPreview = {
  // Id uživatelů, kterých se akce skutečně týká (ostatní se přeskočí); `run` dostane jen tyto
  eligibleIds: string[];
  // Řádky „co se stane“, např. „Přesune se do 3.A: 12 studentů (z 2.A: 8, bez třídy: 4)“
  lines: string[];
  // Přeskočení uživatelé s důvodem
  skipped: { reason: string; count: number }[];
  // Chyba, kvůli které akci nejde spustit (např. chybí parametr, vyčerpaný limit)
  blocked?: string;
};

export type BulkRunResult = {
  affected: number;
  // Věta do historie změn a do hlášky po dokončení
  summary: string;
  // Dodatečná strukturovaná data do historie (id dotčených uživatelů doplní jádro)
  data?: Record<string, unknown>;
  // Spustí se po úspěšném commitu (např. e-mail o schválení)
  afterCommit?: () => Promise<void>;
};

/**
 * Hromadná akce nad vybranými uživateli (F3). Spouští ji jádro (`modules/core/bulk-runner.ts`),
 * které samo řeší oprávnění, výběr (id nebo filtr), náhled a potvrzení, jednu transakci,
 * jeden souhrnný záznam v historii a pravidla režimu „zobrazit jako“ (jen čtení).
 */
export type BulkUserAction = {
  // Jedinečné v rámci modulu; jádro ho prefixuje id modulu (`core.class`, `seminars.audience`)
  id: string;
  label: string;
  // Oprávnění potřebné ke spuštění (jádro kontroluje i zapnutí modulu)
  permission: string;
  // Věta v potvrzovacím dialogu nad náhledem dopadu (doplní se počet)
  confirm?: string;
  // Nevratná / nebezpečná akce: dialog vyžaduje opsání potvrzovacího slova (parametr `confirmWord`)
  danger?: boolean;
  // Parametry zadávané v dialogu (např. výběr zápisového okna); funkce kvůli dynamickým možnostem
  params?: (actor: User) => Promise<BulkActionParam[]>;
  // Kdo je dotčen a co se stane. Bez `preview` se akce týká všech vybraných.
  preview?: (users: BulkUserInfo[], actor: User, params: Record<string, string>) => Promise<BulkPreview>;
  // false = akce nejde dělat v databázové transakci (odesílání e-mailů); jádro pak zapíše historii zvlášť
  transactional?: boolean;
  // Provede akci. Neověřuje oprávnění (udělá jádro); dostane jen `eligibleIds` z náhledu.
  run: (tx: TxClient, userIds: string[], actor: User, params: Record<string, string>) => Promise<BulkRunResult>;
};

export type AdminStat = {
  label: string;
  value: number;
  hint: string;
  icon?: "users" | "book" | "calendar";
};

/** Výsledek jednoho kroku denní úlohy (zobrazí se v odpovědi cronu a v logu). */
export type DailyJobStep = { task: string; ok: boolean; detail: string };

/**
 * Serverová část modulu. Všechny části jsou volitelné – jádro je volá
 * jen u zapnutých modulů (kromě onUserDelete, které běží vždy, aby
 * nezůstala viset data vypnutého modulu).
 */
export type ModuleServer = {
  // Statistiky pro administrační centrum
  getAdminStats?: () => Promise<AdminStat[]>;
  // Úklid dat modulu před trvalým smazáním uživatele (v transakci).
  // Povinné odkazy na uživatele se přepíší na `replacementUserId`.
  onUserDelete?: (tx: TxClient, userId: string, replacementUserId: string) => Promise<void>;
  // Denní úloha (cron /api/cron/daily): připomínky, souhrny, úklid. Běží jen u zapnutých modulů.
  // Každý krok si hlídá chyby sám; úloha nesmí vyhodit výjimku kvůli jedné chybě.
  runDailyJob?: (now: Date) => Promise<DailyJobStep[]>;
  // Odhad počtu příjemců hromadných upozornění pro administraci (Upozornění)
  getEmailEstimates?: () => Promise<Partial<Record<EmailEventId, number>>>;

  // === Body rozšíření jádra ===
  // Jádro je volá jen u zapnutých modulů přes pomocné funkce v `modules/core/extensions.ts`
  // (collect*). Chyba jednoho modulu stránku jádra neshodí – položky modulu se jen vynechají.
  // Každý bod si hlídá oprávnění uživatele sám (jádro kontroluje jen zapnutí modulu).

  // Záložky v detailu předmětu (`?tab=<idModulu>.<id>`); respektují oprávnění uživatele
  getSubjectTabs?: (subjectId: string, user: User) => Promise<ModuleTab[]>;
  // Štítky předmětů pro seznam a detail. Vrací jen předměty, které štítek mají.
  getSubjectBadges?: (subjectIds: string[], user: User) => Promise<Map<string, SubjectBadge[]>>;
  // Kde se předmět používá (dialog archivace/mazání, smazání se při použití zakáže). Bez kontroly
  // oprávnění uživatele; počítá všechna data modulu, nejen to, co by uživatel viděl.
  getSubjectUsage?: (subjectId: string) => Promise<SubjectUsageItem[]>;
  // Karty dashboardu (F8) pro daného uživatele; prázdné pole, když modul pro jeho roli nemá co ukázat.
  // Karta respektuje oprávnění uživatele (viditelnost zápisů, vlastní data) a vrací jen to, co smí vidět.
  getDashboardCards?: (user: User) => Promise<DashboardCard[]>;
  // Záložky zjednodušené navigace studenta (F12). Vrací prázdné pole, když modul pro studenta nemá nic otevřeného;
  // rozhoduje se na serveru (viditelnost oken, publikum, termíny), klient jen zobrazí.
  getStudentTabs?: (user: User) => Promise<StudentTab[]>;
  // Sekce stránky „Moje předměty“ (F4): co uživatel v modulu k předmětům učí / navštěvuje. Vrací
  // prázdné pole, když modul pro roli uživatele nemá co ukázat.
  getMySubjectsSections?: (user: User) => Promise<MySubjectsSection[]>;
  // Záložky v detailu uživatele (F3); `viewer` je ten, kdo se dívá
  getUserTabs?: (userId: string, viewer: User) => Promise<ModuleTab[]>;
  // Položky přehledu „co udělat“ v administraci (F2)
  getAdminTodos?: (user: User) => Promise<AdminTodo[]>;
  // Vlastní hromadné akce v seznamu uživatelů (F3)
  bulkUserActions?: readonly BulkUserAction[];
  // Ukázková data pro prezentaci (F9): Administrace → Ukázková data
  demoData?: ModuleDemoData;
};
