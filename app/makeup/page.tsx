import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import {
  getMakeupPersonalInfo,
  getMySubjectRegistrations,
  getSessionFilterOptions,
  getSessions,
  getUpcomingSessions,
} from "@/modules/makeup/actions/sessions";
import { getMyRegistrations } from "@/modules/makeup/actions/registrations";
import { parseSessionFilter } from "@/modules/makeup/session-filter";
import { StudentMakeupView } from "@/modules/makeup/components/StudentMakeupView";
import { TeacherMakeupView } from "@/modules/makeup/components/TeacherMakeupView";

export default async function MakeupPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const upcoming = await getUpcomingSessions();

  if (can(user.role, "makeup.register")) {
    const { registrations, mySubjectIds } = await getMyRegistrations();
    return <StudentMakeupView sessions={upcoming} registrations={registrations} mySubjectIds={mySubjectIds} />;
  }

  // Učitel a admin: osobní sekce jen tomu, kdo dozoruje nebo má úvazky; seznam termínů s filtry z adresy
  const filter = parseSessionFilter(searchParams);
  const [{ sessions: listed, truncated }, filterOptions, personal] = await Promise.all([
    getSessions(filter),
    getSessionFilterOptions(),
    getMakeupPersonalInfo(),
  ]);
  const subjectRegistrations = can(user.role, "makeup.subjectTeacher") && personal.hasAssignments ? await getMySubjectRegistrations() : null;
  return (
    <TeacherMakeupView
      upcoming={upcoming}
      listed={listed}
      truncated={truncated}
      currentUserId={user.id}
      isAdmin={can(user.role, "makeup.sessions.manageAll")}
      supervises={personal.supervises}
      subjectRegistrations={subjectRegistrations}
      filterOptions={filterOptions}
    />
  );
}
