import { PageHeader } from "@/components/page-header";
import { can } from "@/modules/registry";
import { getCurrentUser } from "@/lib/session";
import { getSchoolYearInfo } from "@/modules/core/school";
import { getClassStudents, getClassesOverview } from "@/modules/core/actions/classes";
import { SchoolYearCard } from "@/modules/core/components/admin/SchoolYearCard";
import { ClassesTab } from "@/modules/core/components/admin/ClassesTab";

export default async function SchoolYearPage() {
  const user = (await getCurrentUser())!;
  const [info, classes, students] = await Promise.all([getSchoolYearInfo(), getClassesOverview(), getClassStudents()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Školní rok a třídy" description="Aktuální školní rok, jeho uzavření a správa tříd." />
      <SchoolYearCard info={info} />
      <ClassesTab classes={classes} users={students} canManage={can(user.role, "core.users.manage")} />
    </div>
  );
}
