/* eslint-disable no-unused-vars -- názvy parametrů v typech funkcí */
import type { ReactNode } from "react";
import type { TxClient } from "@/lib/prisma";
import type { User } from "@/lib/types";
import type { EmailEventId } from "@/lib/email/events";
import type { AdminTodo, SubjectBadge, SubjectUsageItem } from "@/modules/types";

/** Záložka (detail předmětu, detail uživatele). Obsah je serverová komponenta modulu. */
export type ModuleTab = {
  // Jedinečné v rámci modulu; jádro ho před použitím prefixuje id modulu
  id: string;
  label: string;
  // Pořadí záložek (nižší = dříve); záložky jádra mají 0–99, moduly 100+
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
  // Obsah na dashboardu pro daného uživatele, nebo null, když není co ukázat
  getDashboardWidget?: (user: User) => Promise<ReactNode | null>;
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

  // Záložky v detailu předmětu (v F1 se zobrazí pod sebou, od F4 jako záložky)
  getSubjectTabs?: (subjectId: string, user: User) => Promise<ModuleTab[]>;
  // Štítky předmětů pro seznam a detail. Vrací jen předměty, které štítek mají.
  getSubjectBadges?: (subjectIds: string[], user: User) => Promise<Map<string, SubjectBadge[]>>;
  // Kde se předmět používá (varování před archivací/smazáním). Bez kontroly oprávnění uživatele.
  getSubjectUsage?: (subjectId: string) => Promise<SubjectUsageItem[]>;
  // Záložky v detailu uživatele (F3); `viewer` je ten, kdo se dívá
  getUserTabs?: (userId: string, viewer: User) => Promise<ModuleTab[]>;
  // Položky přehledu „co udělat“ v administraci (F2)
  getAdminTodos?: (user: User) => Promise<AdminTodo[]>;
  // Vlastní hromadné akce v seznamu uživatelů (F3)
  bulkUserActions?: readonly BulkUserAction[];
};
