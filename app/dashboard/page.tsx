import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/session";
import { getDashboardCards } from "@/modules/core/dashboard-cards";
import { DashboardGrid } from "@/modules/core/components/dashboard/DashboardGrid";

// Dashboard je přehled s kartami. Karty dodávají zapnuté moduly (ModuleServer.getDashboardCards) a jádro;
// vlastní práce (zápis, dopisování) probíhá na stránkách modulů.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const cards = await getDashboardCards(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Vítejte, ${user.firstName}`}
        description={cards.length === 0 ? "Momentálně tu pro vás není nic aktuálního – žádný otevřený zápis ani termín. Další agendu najdete v menu." : "Co je právě aktuální."}
      />
      {cards.length > 0 && <DashboardGrid cards={cards} />}
    </div>
  );
}
