import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getSubjects,
  getEnrollmentWindowsWithDetails,
  getUsersForFilters,
} from "@/lib/data";
import { SubjectDetailClientView } from "@/components/subjects/SubjectDetailClientView";
import { computeEnrollmentStatus } from "@/lib/utils";
import { OccurrenceRow } from "@/components/occurrences/occurrence-columns";
import { User, EnrollmentWindowWithBlocks } from "@/lib/types";

export default async function SubjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  if (params.id === "new") {
    redirect("/subjects/new/edit");
  }

  const isPrivileged = currentUser.role === "ADMIN" || currentUser.role === "TEACHER";

  // Načítáme všechna potřebná data na serveru
  const [usersList, allSubjs, ewWithDetails] = await Promise.all([
    getUsersForFilters(),
    getSubjects(),
    getEnrollmentWindowsWithDetails(!isPrivileged)
  ]);

  const subject = allSubjs.find((s) => s.id === params.id);
  
  if (!subject) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-red-600">Předmět nenalezen</h1>
        <p className="mt-2 text-muted-foreground">Předmět s tímto ID neexistuje nebo k němu nemáte přístup.</p>
      </div>
    );
  }

  // Příprava dat pro tabulku výskytů (OccurrenceRow)
  const processedOccurrences: OccurrenceRow[] = ewWithDetails.flatMap((ew: any) =>
    ew.blocks.flatMap((block: any) =>
      block.occurrences
        .filter((occ: any) => occ.subject.id === params.id)
        .map((occ: any) => {
          const enrolledCount = occ.enrollments
            ? occ.enrollments.filter((e: any) => !e.deletedAt).length
            : 0;

          const capacityText =
            occ.capacity == null
              ? `${enrolledCount}/∞`
              : `${enrolledCount}/${occ.capacity}`;

          const enrolledByMe = occ.enrollments?.some(
            (e: any) => e.studentId === currentUser.id && !e.deletedAt
          );

          const isFull = occ.capacity != null && enrolledCount >= occ.capacity;

          const hasStudents = enrolledCount > 0;

          const fullCode = occ.subject?.code
            ? `${occ.subject.code}${occ.subCode ? "/" + occ.subCode : ""}`
            : occ.subCode ?? "—";

          const teacherName = occ.teacher
            ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
            : "—";

          const status = computeEnrollmentStatus(ew.status as any, ew.startsAt, ew.endsAt, new Date());

          const searchText = [
            ew.name,
            block.name,
            fullCode,
            teacherName,
          ]
            .filter(Boolean)
            .join(" ");

          return {
            ...(occ as any),
            blockName: block.name,
            block: block,
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
          } as OccurrenceRow;
        })
    )
  );

  return (
    <SubjectDetailClientView
      subject={subject as any}
      occurrences={processedOccurrences}
      usersList={usersList}
      currentUser={currentUser}
    />
  );
}