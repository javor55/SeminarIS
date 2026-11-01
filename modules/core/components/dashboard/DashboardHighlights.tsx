import Link from "next/link";
import { CalendarClock, LineChart, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardHighlight } from "@/modules/server-types";

const ICONS = { clock: CalendarClock, chart: LineChart, people: Users } as const;
const TONES = {
  attention: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
} as const;

/** Pás „nejbližších věcí“ nad kartami (učitel, admin): jedna věta o tom, co je nejdřív potřeba. Zdrojem jsou karty modulů. */
export function DashboardHighlights({ items }: { items: DashboardHighlight[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="dashboard-highlights" aria-label="Nejbližší věci">
      {items.map((h) => {
        const Icon = ICONS[h.icon];
        const body = (
          <>
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONES[h.tone])} aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{h.title}</span>
              <span className="block text-sm text-muted-foreground">{h.text}</span>
            </span>
          </>
        );
        return (
          <li key={h.id} data-testid="dashboard-highlight" data-highlight={h.id} data-tone={h.tone}>
            {h.href ? (
              <Link href={h.href} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent/40">
                {body}
              </Link>
            ) : (
              <div className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
