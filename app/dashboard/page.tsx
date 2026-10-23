import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Fragment } from "react";
import { getCurrentUser } from "@/lib/session";
import { getEnabledModuleIds } from "@/lib/modules";
import { MODULE_SERVERS } from "@/modules/server-registry";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  // Každý zapnutý modul může přispět vlastním obsahem (viz ModuleServer.getDashboardWidget)
  const enabled = await getEnabledModuleIds();
  const widgets = (
    await Promise.all(
      MODULE_SERVERS.filter(({ id }) => enabled.includes(id)).map(async ({ id, server }) => ({
        id,
        node: server.getDashboardWidget ? await server.getDashboardWidget(user) : null,
      }))
    )
  ).filter((w) => w.node != null);

  if (widgets.length === 0) {
    return (
      <PageHeader
        title={`Vítejte, ${user.firstName}`}
        description="Momentálně tu pro vás není nic aktuálního – žádný otevřený zápis ani termín. Další agendu najdete v menu."
      />
    );
  }

  return (
    <div className="space-y-10">
      {widgets.map((w) => (
        <Fragment key={w.id}>{w.node}</Fragment>
      ))}
    </div>
  );
}
