import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { getDemoStatus } from "@/modules/core/demo";
import { DemoDataPanel } from "@/modules/core/components/admin/DemoDataPanel";

export const dynamic = "force-dynamic";

export default async function DemoDataPage() {
  await requirePagePermission("core.admin");
  const status = await getDemoStatus();
  return (
    <div className="space-y-6">
      <PageHeader title="Ukázková data" description="Naplnění systému realistickými daty pro prezentaci a jejich smazání." />
      <DemoDataPanel status={status} />
    </div>
  );
}
