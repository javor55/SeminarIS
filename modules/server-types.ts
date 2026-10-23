/* eslint-disable no-unused-vars -- názvy parametrů v typech funkcí */
import type { ReactNode } from "react";
import type { TxClient } from "@/lib/prisma";
import type { User } from "@/lib/types";
import type { EmailEventId } from "@/lib/email/events";

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
};
