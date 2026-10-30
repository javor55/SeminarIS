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

/** Hromadná akce nad vybranými uživateli (F3). Spouští ji jádro v jedné transakci. */
export type BulkUserAction = {
  // Jedinečné v rámci modulu
  id: string;
  label: string;
  // Oprávnění potřebné ke spuštění (jádro kontroluje i zapnutí modulu)
  permission: string;
  // Text potvrzovacího dialogu; `{count}` se nahradí počtem vybraných
  confirm?: string;
  // Provede akci a vrátí souhrn pro audit a toast. Neověřuje oprávnění (udělá jádro).
  run: (tx: TxClient, userIds: string[], actor: User) => Promise<{ affected: number; summary: string }>;
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
