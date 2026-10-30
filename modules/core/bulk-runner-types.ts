// Typy a konstanty hromadných akcí sdílené serverem a klientem (bez závislosti na DB).
import type { BulkActionParam } from "@/modules/server-types";
import type { UserFilter } from "@/modules/core/users-filter";

/** Nejvíc uživatelů v jedné hromadné akci. Větší výběr se musí zúžit filtrem. */
export const BULK_MAX = 2000;

export type BulkSelection =
  | { mode: "ids"; ids: string[] }
  // „vše odpovídající filtru“ (vyhodnotí server); `excluded` jsou ručně odškrtnutí
  | { mode: "filter"; filter: UserFilter; excluded?: string[] };

export type BulkActionDescriptor = {
  id: string;
  label: string;
  confirm?: string;
  danger: boolean;
  params: BulkActionParam[];
};

export type BulkPreviewResult = {
  // kolik uživatelů výběr obsahuje a kolika se akce skutečně týká
  selected: number;
  eligible: number;
  lines: string[];
  skipped: { reason: string; count: number }[];
  blocked?: string;
  // několik jmen pro kontrolu (první dotčení)
  sample: string[];
};

export type BulkRunOutcome = { affected: number; summary: string; skipped: number };
