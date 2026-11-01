import { prisma } from "@/lib/prisma";
import { computeUnenrolled, missingBlockLabel } from "@/modules/seminars/unenrolled";

// Průběh zápisového okna pro admina a učitele (F13): kolik studentů je hotovo / rozpracováno / nezačalo, plné semináře
// a kdo má co dokončit. Staví na `computeUnenrolled` (jediný zdroj pravdy o tom, kdo je „nezapsaný“); nic nového se neukládá.

export type WindowProgress = {
  // Aktivní studenti v publiku okna
  audience: number;
  done: number;
  inProgress: number;
  notStarted: number;
  // Nezačali podle tříd, např. „4.A: 4“ (řazeno podle třídy)
  notStartedByClass: { label: string; count: number }[];
  // Výskyty s omezenou kapacitou: kolik jich je plných z kolika a kolik míst ještě zbývá
  fullOccurrences: number;
  limitedOccurrences: number;
  freeSeats: number;
  // Studenti, kterým něco chybí (celý seznam je v záložce Nezapsaní)
  missing: { id: string; name: string; classLabel: string | null; what: string; started: boolean }[];
};

export async function getWindowProgress(windowId: string): Promise<WindowProgress | null> {
  const [overview, occurrences] = await Promise.all([
    computeUnenrolled(windowId),
    prisma.subjectOccurrence.findMany({
      where: { deletedAt: null, capacity: { not: null }, block: { deletedAt: null, enrollmentWindowId: windowId } },
      select: { capacity: true, _count: { select: { studentEnrollments: { where: { deletedAt: null } } } } },
    }),
  ]);
  if (!overview) return null;

  let fullOccurrences = 0;
  let freeSeats = 0;
  for (const o of occurrences) {
    const left = (o.capacity ?? 0) - o._count.studentEnrollments;
    if (left <= 0) fullOccurrences++;
    else freeSeats += left;
  }

  const notStartedStudents = overview.students.filter((s) => !s.started);
  const byClass = new Map<string, { label: string; count: number }>();
  for (const s of notStartedStudents) {
    const label = s.classLabel ?? "bez třídy";
    const entry = byClass.get(label) ?? { label, count: 0 };
    entry.count++;
    byClass.set(label, entry);
  }
  const notStartedByClass = [...byClass.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "cs", { numeric: true }))
    .map(({ label, count }) => ({ label, count }));

  return {
    audience: overview.audienceCount,
    done: overview.audienceCount - overview.students.length,
    inProgress: overview.students.length - notStartedStudents.length,
    notStarted: notStartedStudents.length,
    notStartedByClass,
    fullOccurrences,
    limitedOccurrences: occurrences.length,
    freeSeats,
    missing: overview.students.map((s) => ({
      id: s.id,
      name: `${s.lastName} ${s.firstName}`,
      classLabel: s.classLabel,
      what: s.started ? `chybí ${s.missingBlocks.map((b) => missingBlockLabel(b)).join(", ")}` : "nezačal(a)",
      started: s.started,
    })),
  };
}
