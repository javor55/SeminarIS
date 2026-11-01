import { prisma } from "@/lib/prisma";
import { classLabel } from "@/lib/school";
import { formatDateTime } from "@/lib/datetime";
import { appUrl, sendEventEmail, type SendSummary } from "@/lib/email";
import { audienceWhere, loadAudienceEntries } from "@/modules/seminars/eligibility";
import { isInOccurrenceAudience, type AudienceStudent } from "@/modules/seminars/audience";
import { sortByName } from "@/lib/names";

// Nezapsaní studenti zápisového okna: aktivní studenti z publika okna, kteří nemají dost zápisů
// v povinných blocích (nepovinné bloky se nepočítají). Blok se studentovi počítá, jen když si
// v něm může vybrat aspoň jeden výskyt (bloky bez předmětu a výskyty omezené na jiné třídy se nepočítají).

export type UnenrolledStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  classGroupId: string | null;
  classLabel: string | null;
  // Povinné bloky, ve kterých má student méně zápisů, než potřebuje (have z need)
  missingBlocks: { id: string; name: string; have: number; need: number }[];
  // Má v tomto zápisu aspoň jeden zápis (rozpracováno), nebo ještě nezačal
  started: boolean;
};

export type UnenrolledOverview = {
  windowName: string;
  endsAt: Date;
  // Počet povinných bloků, do kterých je možné se zapsat
  blockCount: number;
  // Kolik aktivních studentů je v publiku okna (zapsáno = audienceCount − students.length)
  audienceCount: number;
  students: UnenrolledStudent[];
};

export type MissingBlock = UnenrolledStudent["missingBlocks"][number];

/**
 * Povinné bloky, ve kterých má student méně zápisů, než potřebuje. Jediný zdroj pravdy pro seznam nezapsaných
 * i pro stránku Zápisy studenta. `blocks` jsou nesmazané bloky okna s výskyty (u studenta už zúženými na jeho
 * ročník / třídu); `enrolledByBlock` je počet jeho zápisů v blocích.
 */
export function missingBlocksFor(
  blocks: readonly { id: string; name: string; required: boolean; minEnrollments: number; subjectOccurrences: readonly { restrictGrades: readonly number[]; restrictClasses: readonly { id: string }[] }[] }[],
  enrolledByBlock: ReadonlyMap<string, number>,
  student: AudienceStudent | null
): MissingBlock[] {
  const missing: MissingBlock[] = [];
  for (const b of blocks) {
    if (!b.required) continue;
    const available = b.subjectOccurrences.filter((o) => isInOccurrenceAudience(o, student)).length;
    if (available === 0) continue;
    const need = Math.min(b.minEnrollments, available);
    const have = enrolledByBlock.get(b.id) ?? 0;
    if (have < need) missing.push({ id: b.id, name: b.name, have, need });
  }
  return missing;
}

/** „Blok A“, u bloků s víc zápisy „Blok A (1 z 2)“. */
export function missingBlockLabel(b: { name: string; have: number; need: number }): string {
  return b.need > 1 ? `${b.name} (zapsáno ${b.have} z ${b.need})` : b.name;
}

export async function computeUnenrolled(windowId: string): Promise<UnenrolledOverview | null> {
  const ew = await prisma.enrollmentWindow.findUnique({
    where: { id: windowId },
    include: {
      blocks: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: {
          subjectOccurrences: {
            where: { deletedAt: null },
            select: { id: true, restrictGrades: true, restrictClasses: { select: { id: true } } },
          },
        },
      },
    },
  });
  if (!ew) return null;
  const blocks = ew.blocks.filter((b) => b.required && b.subjectOccurrences.length > 0);
  const entries = await loadAudienceEntries(windowId);

  const [students, enrollments] = await Promise.all([
    prisma.user.findMany({
      where: audienceWhere(entries),
      include: { classGroup: true },
    }),
    prisma.studentEnrollment.findMany({
      where: { deletedAt: null, subjectOccurrence: { deletedAt: null, block: { enrollmentWindowId: windowId } } },
      select: { studentId: true, subjectOccurrence: { select: { blockId: true } } },
    }),
  ]);
  // student → blok → počet zápisů
  const enrolled = new Map<string, Map<string, number>>();
  for (const e of enrollments) {
    const perBlock = enrolled.get(e.studentId) ?? new Map<string, number>();
    perBlock.set(e.subjectOccurrence.blockId, (perBlock.get(e.subjectOccurrence.blockId) ?? 0) + 1);
    enrolled.set(e.studentId, perBlock);
  }

  const result: UnenrolledStudent[] = [];
  for (const s of sortByName(students)) {
    const student = { id: s.id, classGroupId: s.classGroupId, grade: s.classGroup?.grade ?? null };
    const missing = missingBlocksFor(blocks, enrolled.get(s.id) ?? new Map(), student);
    if (missing.length === 0) continue;
    result.push({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      classGroupId: s.classGroupId,
      classLabel: s.classGroup ? classLabel(s.classGroup) : null,
      missingBlocks: missing,
      started: (enrolled.get(s.id)?.size ?? 0) > 0,
    });
  }
  return { windowName: ew.name, endsAt: ew.endsAt, blockCount: blocks.length, audienceCount: students.length, students: result };
}

/** Pošle připomínku všem nezapsaným (e-mail s chybějícími bloky). `manual` obchází vypnutí události. */
export async function sendUnenrolledReminder(windowId: string, opts: { manual: boolean }): Promise<(SendSummary & { total: number }) | null> {
  const overview = await computeUnenrolled(windowId);
  if (!overview) return null;
  const summary = await sendEventEmail(
    "seminars.window.reminder",
    overview.students.map((s) => ({
      email: s.email,
      userId: s.id,
      vars: {
        jmeno: s.firstName,
        okno: overview.windowName,
        konec: formatDateTime(overview.endsAt),
        chybejici: s.missingBlocks.map((b) => missingBlockLabel(b)).join(", "),
        odkaz: appUrl(`/zapisy/${windowId}`),
      },
    })),
    { ignoreEventSwitch: opts.manual }
  );
  return { ...summary, total: overview.students.length };
}
