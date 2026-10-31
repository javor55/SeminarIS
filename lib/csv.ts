// Čtení CSV pro importy: oddělovač `;`, `,` nebo tabulátor (zjistí se z hlavičky), uvozovky,
// BOM na začátku (Excel), české i anglické názvy sloupců. Čistá logika bez DB – běží na serveru.

export type CsvRecord = { line: number; values: string[] };
export type ParsedCsv = { delimiter: string; headers: string[]; records: CsvRecord[] };

export const CSV_MAX_ROWS = 2000;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let inQuotes = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  // při shodě (nebo bez oddělovače) `;`, jako v českém Excelu
  return [";", ",", "\t"].reduce((best, d) => (counts[d] > counts[best] ? d : best), ";");
}

/** Rozdělí CSV na hlavičku a záznamy (prázdné řádky se přeskočí, `line` je fyzický řádek v souboru). */
export function parseCsv(input: string): ParsedCsv {
  const text = stripBom(input);
  const delimiter = detectDelimiter(text);
  const rows: CsvRecord[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((v) => v.trim() !== "")) rows.push({ line: rowLine, values: row.map((v) => v.trim()) });
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  const [head, ...records] = rows;
  return { delimiter, headers: head?.values ?? [], records };
}

/** "Jméno" / "e-mail učitele" / "kod_predmetu" → "jmeno" / "emailucitele" / "kodpredmetu" */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type CsvTable<F extends string> = {
  rows: { line: number; v: Record<F, string> }[];
  /** Chyba celého souboru (chybí sloupec, prázdný soubor, příliš mnoho řádků) */
  fileError?: string;
};

/**
 * Převede CSV na řádky s pojmenovanými poli. `aliases` mapuje pole na přijatelné názvy sloupců
 * (po `normalizeHeader`); `required` jsou pole, jejichž sloupec musí v hlavičce být.
 */
export function readTable<F extends string>(
  content: string,
  aliases: Record<F, string[]>,
  required: NoInfer<F>[],
  labels: Record<NoInfer<F>, string>
): CsvTable<F> {
  const parsed = parseCsv(content);
  if (parsed.headers.length === 0) return { rows: [], fileError: "Soubor je prázdný." };
  const fields = Object.keys(aliases) as F[];
  const index = {} as Record<F, number>;
  const normalized = parsed.headers.map(normalizeHeader);
  for (const f of fields) index[f] = normalized.findIndex((h) => aliases[f].includes(h));
  const missing = required.filter((f) => index[f] < 0);
  if (missing.length > 0) {
    return { rows: [], fileError: `V hlavičce chybí sloupec: ${missing.map((f) => labels[f]).join(", ")}.` };
  }
  if (parsed.records.length === 0) return { rows: [], fileError: "Soubor neobsahuje žádné řádky s daty." };
  if (parsed.records.length > CSV_MAX_ROWS) {
    return { rows: [], fileError: `Soubor má příliš mnoho řádků (nejvýš ${CSV_MAX_ROWS}).` };
  }
  return {
    rows: parsed.records.map((r) => {
      const v = {} as Record<F, string>;
      for (const f of fields) v[f] = index[f] >= 0 ? (r.values[index[f]] ?? "") : "";
      return { line: r.line, v };
    }),
  };
}

/** Příklady souborů ke stažení (hlavička + řádky, oddělovač `;`, s BOM pro Excel). */
export function buildCsv(rows: string[][]): string {
  const quote = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(quote).join(";")).join("\r\n") + "\r\n";
}
