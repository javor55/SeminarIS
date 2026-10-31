// Pravidla zápisového okna a bloků, která se vyhodnocují stejně na serveru i v UI (čistá data, bez DB).

export type WindowChangeRules = { allowSelfUnenroll: boolean; changesUntil: Date | string | null; endsAt: Date | string };

/** Do kdy smí student měnit svůj zápis: vlastní termín, nebo konec okna (nikdy po konci okna). */
export function changesDeadline(w: Pick<WindowChangeRules, "changesUntil" | "endsAt">): Date {
  const end = new Date(w.endsAt);
  if (!w.changesUntil) return end;
  const custom = new Date(w.changesUntil);
  return custom < end ? custom : end;
}

/** Smí student teď sám odepsat nebo přepsat svůj zápis? (Otevřenost okna se kontroluje zvlášť.) */
export function checkStudentCanChange(w: WindowChangeRules, now = new Date()): { ok: boolean; reason?: string } {
  if (!w.allowSelfUnenroll) return { ok: false, reason: "V tomto zápisu se nemůžete odepsat ani přepsat sami. Požádejte vyučujícího nebo administrátora." };
  if (now > changesDeadline(w)) return { ok: false, reason: "Termín pro změny zápisu už uplynul." };
  return { ok: true };
}

export type BlockRules = { required: boolean; minEnrollments: number; maxEnrollments: number };

/** Ověří a očistí pravidla bloku z formuláře; chybu vrací jako výjimku s českým textem. */
export function cleanBlockRules(input: Partial<BlockRules> | undefined): BlockRules {
  const required = input?.required ?? true;
  const min = Number(input?.minEnrollments ?? 1);
  const max = Number(input?.maxEnrollments ?? 1);
  if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error("Počet zápisů v bloku musí být celé číslo.");
  if (max < 1 || max > 20) throw new Error("Nejvyšší počet zápisů v bloku musí být 1 až 20.");
  if (min < 0 || min > max) throw new Error("Nejnižší počet zápisů v bloku nesmí být větší než nejvyšší.");
  if (required && min < 1) throw new Error("Povinný blok musí mít nejnižší počet zápisů alespoň 1.");
  return { required, minEnrollments: min, maxEnrollments: max };
}

/** Krátký popis pravidel bloku, např. „povinný, 1 zápis“ / „nepovinný, 1–2 zápisy“. */
export function blockRulesLabel(b: BlockRules): string {
  const count =
    b.minEnrollments === b.maxEnrollments
      ? `${b.maxEnrollments} ${b.maxEnrollments === 1 ? "zápis" : b.maxEnrollments < 5 ? "zápisy" : "zápisů"}`
      : `${b.minEnrollments}–${b.maxEnrollments} zápisy`;
  return `${b.required ? "povinný" : "nepovinný"}, ${count}`;
}
