import { prisma } from "@/lib/prisma";
import { classLabel } from "@/lib/school";
import { formatDateTime } from "@/lib/datetime";
import { appUrl, sendEventEmail, type SendSummary } from "@/lib/email";
import { eligibleStudentsWhere } from "@/modules/seminars/eligibility";

// Nezapsaní studenti zápisového okna: aktivní studenti cílových ročníků, kteří nemají zápis
// ve všech blocích. Blok bez nabízeného předmětu se nepočítá (nelze se do něj zapsat).

export type UnenrolledStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  classGroupId: string | null;
  classLabel: string | null;
  // Bloky, ve kterých student nemá zápis
  missingBlocks: { id: string; name: string }[];
};

export type UnenrolledOverview = {
  windowName: string;
  endsAt: Date;
  // Počet bloků, do kterých je možné se zapsat
  blockCount: number;
  students: UnenrolledStudent[];
};

export async function computeUnenrolled(windowId: string): Promise<UnenrolledOverview | null> {
  const ew = await prisma.enrollmentWindow.findUnique({
    where: { id: windowId },
    include: {
      blocks: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { subjectOccurrences: { where: { deletedAt: null }, select: { id: true } } },
      },
    },
  });
  if (!ew) return null;
  const blocks = ew.blocks.filter((b) => b.subjectOccurrences.length > 0);

  const [students, enrollments] = await Promise.all([
    prisma.user.findMany({
      where: eligibleStudentsWhere(ew.targetGrades),
      include: { classGroup: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.studentEnrollment.findMany({
      where: { deletedAt: null, subjectOccurrence: { deletedAt: null, block: { enrollmentWindowId: windowId } } },
      select: { studentId: true, subjectOccurrence: { select: { blockId: true } } },
    }),
  ]);
  const enrolled = new Map<string, Set<string>>();
  for (const e of enrollments) {
    const set = enrolled.get(e.studentId) ?? new Set<string>();
    set.add(e.subjectOccurrence.blockId);
    enrolled.set(e.studentId, set);
  }

  const result: UnenrolledStudent[] = [];
  for (const s of students) {
    const have = enrolled.get(s.id);
    const missing = blocks.filter((b) => !have?.has(b.id));
    if (missing.length === 0) continue;
    result.push({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      classGroupId: s.classGroupId,
      classLabel: s.classGroup ? classLabel(s.classGroup) : null,
      missingBlocks: missing.map((b) => ({ id: b.id, name: b.name })),
    });
  }
  return { windowName: ew.name, endsAt: ew.endsAt, blockCount: blocks.length, students: result };
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
        chybejici: s.missingBlocks.map((b) => b.name).join(", "),
        odkaz: appUrl("/dashboard"),
      },
    })),
    { ignoreEventSwitch: opts.manual }
  );
  return { ...summary, total: overview.students.length };
}
