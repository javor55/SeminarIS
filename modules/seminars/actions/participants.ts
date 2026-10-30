"use server";

import { prisma } from "@/lib/prisma";
import { classLabel } from "@/lib/school";
import { requireAuth, requireModule } from "@/lib/session";
import { can } from "@/modules/registry";
import { getStudentAudienceInfo, getViewerContext, isWindowVisibleTo } from "@/modules/seminars/eligibility";
import { isInOccurrenceAudience } from "@/modules/seminars/audience";

export type OccurrenceParticipant = { name: string; classLabel: string | null };

/**
 * Jména zapsaných na výskytu. Učitel a admin je vidí vždy; student jen tehdy, když okno má
 * „Viditelnost výsledků: jména“ a je určeno jemu (včetně výskytu). Bez e-mailů.
 */
export async function getOccurrenceParticipants(occurrenceId: string): Promise<OccurrenceParticipant[]> {
  const user = await requireAuth();
  await requireModule("seminars");
  const occ = await prisma.subjectOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      restrictClasses: { select: { id: true } },
      block: { include: { enrollmentWindow: true } },
      studentEnrollments: { where: { deletedAt: null }, include: { student: { include: { classGroup: true } } } },
    },
  });
  if (!occ || occ.deletedAt || occ.block.deletedAt) throw new Error("Předmět nenalezen.");
  const ew = occ.block.enrollmentWindow;

  if (!can(user.role, "seminars.windows.view")) {
    const ctx = await getViewerContext(user);
    const allowed =
      ew.resultsVisibility === "NAMES" &&
      ew.visibleToStudents &&
      ew.status !== "DRAFT" &&
      (await isWindowVisibleTo(ctx, ew.id)) &&
      isInOccurrenceAudience(occ, await getStudentAudienceInfo(user.id));
    if (!allowed) throw new Error("Seznam zapsaných není pro vás k dispozici.");
  }

  return occ.studentEnrollments
    .map((e) => ({ name: `${e.student.lastName} ${e.student.firstName}`.trim(), classLabel: e.student.classGroup ? classLabel(e.student.classGroup) : null }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}
