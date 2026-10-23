import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import { getSchoolOverview } from "@/modules/core/actions/school";
import { SchoolAdminView } from "@/modules/core/components/school/SchoolAdminView";

export default async function SchoolPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "core.school.manage")) redirect("/dashboard");

  const overview = await getSchoolOverview();
  return <SchoolAdminView overview={overview} />;
}
