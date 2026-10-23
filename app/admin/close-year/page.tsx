import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import { getYearClosurePreview } from "@/modules/core/actions/school";
import { YearClosureWizard } from "@/modules/core/components/school/YearClosureWizard";

export default async function CloseYearPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "core.school.manage")) redirect("/dashboard");

  const preview = await getYearClosurePreview();
  return <YearClosureWizard preview={preview} />;
}
