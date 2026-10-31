import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardCard } from "@/modules/server-types";

// Šířky karet v mřížce (12 sloupců na velkém displeji, 6 na středním; na mobilu pod sebou)
const SPAN = {
  sm: "md:col-span-3 lg:col-span-4",
  md: "md:col-span-3 lg:col-span-6",
  lg: "md:col-span-6 lg:col-span-12",
} as const;

/** Mřížka karet dashboardu. Karta = nadpis, volitelný odkaz na stránku modulu, kde se pracuje, a obsah. */
export function DashboardGrid({ cards }: { cards: DashboardCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12" data-testid="dashboard-cards">
      {cards.map((c) => (
        <Card key={c.id} className={SPAN[c.size ?? "md"]} data-testid="dashboard-card" data-card={c.id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">{c.title}</CardTitle>
            {c.href && (
              <Button asChild variant="outline" size="sm">
                <Link href={c.href}>{c.linkLabel ?? "Otevřít"}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>{c.content}</CardContent>
        </Card>
      ))}
    </div>
  );
}
