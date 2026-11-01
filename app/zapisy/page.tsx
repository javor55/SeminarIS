import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { listStudentWindows } from "@/modules/seminars/student-windows";
import { StudentWindowList } from "@/modules/seminars/components/student/StudentWindowList";

// Zápisy pro studenty (a hosty): jen okna zveřejněná studentům, ne koncept a určená právě jim.
// Učitel a admin sem nemají přístup (middleware i tato stránka), pracují v /enrollments.
// Student s jediným neuzavřeným oknem jde rovnou do něj (F12); seznam všech oken (i uzavřených) je na ?vse=1.
export default async function StudentEnrollmentsPage({ searchParams }: { searchParams: Promise<{ vse?: string }> }) {
  const { vse } = await searchParams;
  const user = await requirePagePermission("seminars.enroll.view");
  const windows = await listStudentWindows(user);
  const live = windows.filter((w) => w.status !== "CLOSED");
  if (user.role === "STUDENT" && live.length === 1 && !vse) redirect(`/zapisy/${live[0].id}`);
  return (
    <div className="space-y-6">
      <PageHeader title="Zápisy" description="Zápisy do seminářů, které jsou pro vás určené, a co v nich ještě máte hotovit." />
      <StudentWindowList windows={windows} canEnroll={can(user.role, "seminars.enroll.self")} />
    </div>
  );
}
