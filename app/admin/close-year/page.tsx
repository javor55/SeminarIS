import { requirePagePermission } from "@/lib/session";
import { getYearClosurePreview } from "@/modules/core/actions/school";
import { YearClosureWizard } from "@/modules/core/components/admin/YearClosureWizard";

export default async function CloseYearPage() {
  await requirePagePermission("core.school.manage");

  const preview = await getYearClosurePreview();
  return <YearClosureWizard preview={preview} />;
}
