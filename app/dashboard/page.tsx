import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StudentEmptyState } from "@/components/student-empty-state";
import { getCurrentUser } from "@/lib/session";
import { getDashboardCards } from "@/modules/core/dashboard-cards";
import { getStudentNav } from "@/modules/core/student-nav";
import { DashboardGrid } from "@/modules/core/components/dashboard/DashboardGrid";
import { DashboardHighlights } from "@/modules/core/components/dashboard/DashboardHighlights";
import { formatDate } from "@/lib/datetime";

// Dashboard je přehled s kartami. Karty dodávají zapnuté moduly (ModuleServer.getDashboardCards) a jádro;
// vlastní práce (zápis, dopisování) probíhá na stránkách modulů. Student (F12) tu nic nehledá: nemá ho v menu
// a po přihlášení ho `/` pošle na zápis nebo dopisování; sem se dostane, jen když na něj nic nečeká (prázdný stav).
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const [cards, studentNav] = await Promise.all([getDashboardCards(user), user.role === "STUDENT" ? getStudentNav(user) : null]);
  const nothingWaits = !!studentNav && studentNav.tabs.length === 0;
  // Pás „Nejbližší“ (F13) skládají karty modulů; kde žádná karta nic nenabízí, se nevykreslí
  const highlights = cards.flatMap((c) => c.highlights ?? []).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {nothingWaits ? (
        <StudentEmptyState />
      ) : (
        <PageHeader
          title="Přehled"
          description={cards.length === 0 ? "Momentálně tu pro vás není nic aktuálního – žádný otevřený zápis ani termín. Další agendu najdete v menu." : `${formatDate(new Date())} · co je právě aktuální.`}
        />
      )}
      {!nothingWaits && <DashboardHighlights items={highlights} />}
      {cards.length > 0 && <DashboardGrid cards={cards} />}
    </div>
  );
}
