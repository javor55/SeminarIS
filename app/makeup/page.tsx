import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import { getMySubjectRegistrations, getUpcomingSessions } from "@/modules/makeup/actions/sessions";
import { getMyRegistrations } from "@/modules/makeup/actions/registrations";
import { StudentMakeupView } from "@/modules/makeup/components/StudentMakeupView";
import { TeacherMakeupView } from "@/modules/makeup/components/TeacherMakeupView";

export default async function MakeupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const sessions = await getUpcomingSessions();

  if (can(user.role, "makeup.register")) {
    const { registrations, mySubjectIds } = await getMyRegistrations();
    return <StudentMakeupView sessions={sessions} registrations={registrations} mySubjectIds={mySubjectIds} />;
  }

  const subjectRegistrations = can(user.role, "makeup.subjectTeacher") ? await getMySubjectRegistrations() : null;
  return <TeacherMakeupView sessions={sessions} currentUserId={user.id} subjectRegistrations={subjectRegistrations} />;
}
