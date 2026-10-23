import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { getViewerGrade, windowsForGradeWhere } from "@/modules/seminars/eligibility";

// Kde je předmět nabízen: odvozený štítek „v zápisu: <název okna>“ podle výskytů
// (SubjectOccurrence) v nesmazaných blocích. Studenti vidí jen okna, která vidí i na dashboardu.

export type SubjectWindowRef = { id: string; name: string };

/** Zápisová okna, ve kterých je předmět nabízen (podle viditelnosti pro daného uživatele). */
export async function getSubjectWindows(user: User, subjectIds?: string[]): Promise<Map<string, SubjectWindowRef[]>> {
  const grade = await getViewerGrade(user);
  const occurrences = await prisma.subjectOccurrence.findMany({
    where: {
      deletedAt: null,
      ...(subjectIds ? { subjectId: { in: subjectIds } } : {}),
      block: {
        deletedAt: null,
        enrollmentWindow:
          grade === undefined
            ? {}
            : { visibleToStudents: true, status: { not: "DRAFT" }, ...windowsForGradeWhere(grade) },
      },
    },
    select: { subjectId: true, block: { select: { enrollmentWindow: { select: { id: true, name: true, startsAt: true } } } } },
  });

  const result = new Map<string, (SubjectWindowRef & { startsAt: Date })[]>();
  for (const o of occurrences) {
    const w = o.block.enrollmentWindow;
    const list = result.get(o.subjectId) ?? [];
    if (!list.some((x) => x.id === w.id)) list.push(w);
    result.set(o.subjectId, list);
  }
  return new Map(
    [...result.entries()].map(([id, list]) => [
      id,
      list.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).map(({ id, name }) => ({ id, name })),
    ])
  );
}
