"use server";

import { requirePermission } from "@/lib/session";
import { computeEnrollmentStatus } from "@/lib/utils";
import type { Block, EnrollmentWindowWithBlocks, StudentEnrollment, Subject, SubjectOccurrence, User } from "@/lib/types";
import { getEnrollmentWindowsWithDetails } from "@/modules/seminars/actions/windows";
import type { OccurrenceRow } from "@/modules/seminars/components/occurrences/occurrence-columns";

/**
 * Výskyty předmětu ve všech zápisových oknech (detail předmětu pro učitele a admina):
 * okno, blok, kód výskytu, vyučující a obsazenost.
 */
export async function getSubjectOccurrences(subjectId: string): Promise<OccurrenceRow[]> {
  await requirePermission("seminars.windows.view");
  const windows = (await getEnrollmentWindowsWithDetails(false)) as EnrollmentWindowWithBlocks[];

  return windows.flatMap((ew) =>
    (ew.blocks as (Block & { occurrences: (SubjectOccurrence & { subject: Subject; teacher: User; enrollments: StudentEnrollment[] })[] })[]).flatMap((block) =>
      block.occurrences
        .filter((occ) => occ.subject.id === subjectId)
        .map((occ) => {
          const activeEnrollments = occ.enrollments?.filter((e) => !e.deletedAt) ?? [];
          const enrolledCount = activeEnrollments.length;
          const capacityText = occ.capacity == null ? `${enrolledCount}/∞` : `${enrolledCount}/${occ.capacity}`;
          const fullCode = occ.subject?.code
            ? `${occ.subject.code}${occ.subCode ? "/" + occ.subCode : ""}`
            : occ.subCode ?? "—";
          const teacherName = occ.teacher ? `${occ.teacher.firstName} ${occ.teacher.lastName}` : "—";
          const status = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);

          return {
            ...(occ as SubjectOccurrence),
            blockName: block.name,
            block: block as unknown as OccurrenceRow["block"],
            enrollmentWindow: ew,
            enrollmentName: ew.name,
            statusLabel: status.label,
            capacityText,
            hasStudents: enrolledCount > 0,
            fullCode,
            teacherName,
            searchText: [ew.name, block.name, fullCode, teacherName].filter(Boolean).join(" "),
            isFull: occ.capacity != null && enrolledCount >= occ.capacity,
            enrolledByMe: false,
            isWindowOpen: ew.status === "OPEN",
          } as unknown as OccurrenceRow;
        })
    )
  );
}
