// Společné typy importů s náhledem (uživatelé, úvazky, předměty).

export type ImportRowStatus = "new" | "change" | "unchanged" | "error";

export type ImportPreviewRow = {
  /** řádek v souboru (hlavička = 1) */
  line: number;
  status: ImportRowStatus;
  /** co řádek popisuje, např. „Jan Novák <jan@skola.cz>“ */
  title: string;
  /** u „nový“ a „změna“: co přesně se stane / změní; u „beze změny“ případná poznámka */
  changes: string[];
  /** u „chyba“: proč */
  error?: string;
};

export type ImportCounts = { new: number; change: number; unchanged: number; error: number };

export type ImportPreview = {
  rows: ImportPreviewRow[];
  counts: ImportCounts;
  /** chyba celého souboru; řádky jsou pak prázdné */
  fileError?: string;
};

export type ImportResult = { counts: ImportCounts; summary: string };

/** Plán importu: náhled a (volitelně) provedení. Vzniká čtením z DB, nic nezapisuje. */
export type ImportPlan = {
  rows: ImportPreviewRow[];
  fileError?: string;
  /** Provede zápis ve stejné transakci; vrací data navíc do auditu. */
  apply: (_tx: import("@/lib/prisma").TxClient) => Promise<Record<string, unknown>>;
};

export function countRows(rows: ImportPreviewRow[]): ImportCounts {
  const counts: ImportCounts = { new: 0, change: 0, unchanged: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}
