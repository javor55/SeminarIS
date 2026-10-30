import { PageHeader } from "@/components/page-header";
import { getEnabledModuleIds } from "@/lib/modules";
import { MODULES } from "@/modules/registry";
import { ModulesForm } from "@/modules/core/components/admin/ModulesForm";
import type { AdminModuleInfo } from "@/modules/core/actions/admin";

export default async function ModulesPage() {
  const enabled = await getEnabledModuleIds();
  const modules: AdminModuleInfo[] = MODULES.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    core: "core" in m && m.core,
    enabled: enabled.includes(m.id),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Moduly" description="Vypnutý modul zmizí z menu a jeho stránky ani akce nejsou dostupné. Data zůstávají zachována." />
      <ModulesForm modules={modules} />
    </div>
  );
}
