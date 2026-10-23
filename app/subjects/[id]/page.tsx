import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSubjects } from "@/modules/seminars/actions/subjects";
import { getEnrollmentWindowsWithDetails } from "@/modules/seminars/actions/windows";
import { getUsersForFilters } from "@/modules/core/actions/users";
import { SubjectDetailClientView } from "@/modules/seminars/components/subjects/SubjectDetailClientView";
import { computeEnrollmentStatus } from "@/lib/utils";
import { OccurrenceRow } from "@/modules/seminars/components/occurrences/occurrence-columns";
import { User, Subject, EnrollmentWindowWithBlocks, Block, SubjectOccurrence, StudentEnrollment } from "@/lib/types";
import { can } from "@/modules/registry";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  if (id === "new") {
    redirect("/subjects/new/edit");
  }

  const isPrivileged = can(currentUser.role, "seminars.windows.view");

  const [usersList, allSubjs, ewWithDetails] = await Promise.all([
    getUsersForFilters(),
    getSubjects(),
    getEnrollmentWindowsWithDetails(!isPrivileged)
  ]);

  const subject = (allSubjs as Subject[]).find((s) => s.id === id);
  
  if (!subject) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-red-600">Seminář nenalezen</h1>
        <p className="mt-2 text-muted-foreground">Seminář s tímto ID neexistuje nebo k němu nemáte přístup.</p>
      </div>
    );
  }

  const processedOccurrences: OccurrenceRow[] = (ewWithDetails as EnrollmentWindowWithBlocks[]).flatMap((ew) =>
    (ew.blocks as (Block & { occurrences: (SubjectOccurrence & { subject: Subject, teacher: User, enrollments: StudentEnrollment[] })[] })[]).flatMap((block) =>
      block.occurrences
        .filter((occ) => occ.subject.id === id)
        .map((occ) => {
          const activeEnrollments = occ.enrollments?.filter((e) => !e.deletedAt) ?? [];
          const enrolledCount = activeEnrollments.length;

          const capacityText =
            occ.capacity == null
              ? `${enrolledCount}/∞`
              : `${enrolledCount}/${occ.capacity}`;

          const enrolledByMe = activeEnrollments.some(
            (e) => e.studentId === currentUser.id
          );

          const isFull = occ.capacity != null && enrolledCount >= occ.capacity;

          const hasStudents = enrolledCount > 0;

          const fullCode = occ.subject?.code
            ? `${occ.subject.code}${occ.subCode ? "/" + occ.subCode : ""}`
            : occ.subCode ?? "—";

          const teacherName = occ.teacher
            ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
            : "—";

          const status = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);

          const searchText = [
            ew.name,
            block.name,
            fullCode,
            teacherName,
          ]
            .filter(Boolean)
            .join(" ");

          return {
            ...(occ as SubjectOccurrence),
            blockName: block.name,
            block: block as unknown as OccurrenceRow["block"],
            enrollmentWindow: ew,
            enrollmentName: ew.name,
            statusLabel: status.label,
            capacityText,
            hasStudents,
            fullCode,
            teacherName,
            searchText,
            isFull,
            enrolledByMe,
            isWindowOpen: ew.status === "OPEN",
          } as unknown as OccurrenceRow;
        })
    )
  );

  return (
    <SubjectDetailClientView
      subject={subject}
      occurrences={processedOccurrences}
      usersList={usersList}
      currentUser={currentUser}
    />
  );
}