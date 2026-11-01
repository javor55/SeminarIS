import { plural } from "@/lib/plural";
import { formatName } from "@/lib/names";
import { formatDateTime } from "@/lib/datetime";
import type { WindowPhase } from "@/modules/seminars/window-phase";
import type { EnrollmentWindowWithBlocks } from "@/lib/types";

// Model zápisu pro studenta (F12): čistá logika bez React a DB. Z dat okna (jen výskyty určené studentovi a jeho vlastní
// zápisy, viz getEnrollmentWindowByIdWithBlocks) skládá bloky a jejich stav pro krokové rozhraní. Pravidla, která
// rozhodují (kapacita, publikum, max zápisů v bloku), vynucuje server; tady se jen zobrazují.

export type OptionModel = {
  id: string;
  subjectId: string;
  name: string;
  subCode: string | null;
  teacher: string;
  capacity: number | null;
  enrolled: number;
  /** Volná místa; null = kapacita není omezená */
  free: number | null;
  /** Plno a nejsem tu zapsaný */
  full: boolean;
  mine: boolean;
  enrollmentId: string | null;
};

export type BlockModel = {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  min: number;
  max: number;
  options: OptionModel[];
  mine: OptionModel[];
  count: number;
  /** Tady už nic nechybí (povinný blok má alespoň minimum zápisů) */
  satisfied: boolean;
  /** Zelená fajfka: něco je zapsáno a minimum splněno */
  done: boolean;
  /** Povinný blok, kde ještě něco chybí (blok bez nabídky pro studenta se nepočítá) */
  missing: boolean;
};

export function buildBlocks(ew: EnrollmentWindowWithBlocks, studentId: string): BlockModel[] {
  return ew.blocks.map((b) => {
    const required = b.required ?? true;
    const min = b.minEnrollments ?? 1;
    const max = b.maxEnrollments ?? 1;
    const options: OptionModel[] = b.occurrences.map((o) => {
      const own = o.enrollments?.find((e) => e.studentId === studentId && !e.deletedAt);
      const enrolled = o.enrolledCount ?? o.enrollments?.filter((e) => !e.deletedAt).length ?? 0;
      const free = o.capacity == null ? null : Math.max(o.capacity - enrolled, 0);
      return {
        id: o.id,
        subjectId: o.subject.id,
        name: o.subject.name,
        subCode: o.subCode || null,
        teacher: o.teacher ? formatName(o.teacher, "text") : "",
        capacity: o.capacity,
        enrolled,
        free,
        full: !own && free === 0,
        mine: !!own,
        enrollmentId: own?.id ?? null,
      };
    });
    // Plné semináře na konec (stabilní řazení, jinak zůstává pořadí z okna)
    const sorted = [...options].sort((a, c) => Number(a.full) - Number(c.full));
    const mine = sorted.filter((o) => o.mine);
    const count = mine.length;
    const missing = required && options.length > 0 && count < min;
    return {
      id: b.id,
      name: b.name,
      description: b.description || null,
      required,
      min,
      max,
      options: sorted,
      mine,
      count,
      satisfied: !missing,
      done: count > 0 && count >= min,
      missing,
    };
  });
}

/** „3 volná místa“, „plno“, „bez omezení kapacity“. */
export function freeText(o: Pick<OptionModel, "free" | "full" | "mine">): string {
  if (o.free === null) return "bez omezení kapacity";
  if (o.free === 0) return o.mine ? "bez volných míst" : "plno";
  return `${o.free} ${plural(o.free, "volné místo", "volná místa", "volných míst")}`;
}

const seminars = (n: number) => `${n} ${plural(n, "seminář", "semináře", "seminářů")}`;

/** Druhý řádek hlavičky bloku: co je vybráno, nebo co ještě student udělat má. */
export function blockStateText(b: BlockModel): string {
  if (b.count > 0 && b.count >= b.min) return b.mine.map((o) => o.name).join(", ");
  if (b.count > 0) return `Zapsáno ${b.count} z ${b.min} – vyberte ještě ${b.min - b.count}`;
  if (b.required) return `Vyberte ${b.min === b.max ? seminars(b.max) : `${b.min}–${seminars(b.max)}`}`;
  return b.max === 1 ? "Nepovinné – můžete vybrat 1 seminář" : `Nepovinné – můžete vybrat až ${seminars(b.max)}`;
}

/** Blok, který je na řadě: první povinný, kde ještě něco chybí. */
export function nextBlockToOpen(blocks: readonly BlockModel[], exceptId?: string): string | null {
  return blocks.find((b) => b.missing && b.id !== exceptId)?.id ?? null;
}

/** „Zápis běží do …“, „Zápis se otevře …“, „Zápis skončil …“ (stejné věty jako na přehledu zápisů). */
export function deadlineLine(w: { phase: WindowPhase; startsAt: Date | string; endsAt: Date | string; closedEarly: boolean }): string {
  if (w.phase === "OPEN") return `Zápis běží do ${formatDateTime(w.endsAt)}`;
  if (w.phase === "PLANNED") return `Zápis se otevře ${formatDateTime(w.startsAt)} (do ${formatDateTime(w.endsAt)})`;
  if (w.closedEarly) return "Zápis byl uzavřen před plánovaným koncem";
  return `Zápis skončil ${formatDateTime(w.endsAt)}`;
}
