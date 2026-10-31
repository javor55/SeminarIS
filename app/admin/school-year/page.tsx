import { PageHeader } from "@/components/page-header";
import { can } from "@/modules/registry";
import { getCurrentUser } from "@/lib/session";
import { getSchoolYearInfo } from "@/modules/core/school";
import { getClassStudents, getClassesOverview } from "@/modules/core/actions/classes";
import { SchoolYearCard } from "@/modules/core/components/admin/SchoolYearCard";
import { ImportButton } from "@/modules/core/components/import/ImportDialogs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassesTab } from "@/modules/core/components/admin/ClassesTab";

export default async function SchoolYearPage() {
  const user = (await getCurrentUser())!;
  const [info, classes, students] = await Promise.all([getSchoolYearInfo(), getClassesOverview(), getClassStudents()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Školní rok a třídy" description="Aktuální školní rok, jeho uzavření a správa tříd." />
      <SchoolYearCard info={info} />
      <Card className="shadow-sm" data-testid="imports-card">
        <CardHeader>
          <CardTitle>Importy</CardTitle>
          <CardDescription>Hromadné načtení dat z CSV s náhledem před potvrzením (vzorové soubory jsou v dialogu).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ImportButton kind="users" label="Import uživatelů" />
          <ImportButton kind="assignments" label="Import úvazků" />
          <ImportButton kind="subjects" label="Import předmětů" />
        </CardContent>
      </Card>
      <ClassesTab classes={classes} users={students} canManage={can(user.role, "core.users.manage")} />
    </div>
  );
}
