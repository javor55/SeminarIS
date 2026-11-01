import Link from "next/link";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import type { DashboardCard } from "@/modules/server-types";
import { Badge } from "@/components/ui/badge";
import { collectAdminStats, collectAdminTodos, collectDashboardCards } from "@/modules/core/extensions";

// Dashboard (F8) = přehled s kartami. Karty modulů dodává bod rozšíření `getDashboardCards`; tady jsou jen
// karty, které skládá jádro z bodů rozšíření VŠECH zapnutých modulů (co udělat, statistiky), takže zmizí
// spolu s modulem, který je dodával.

const TODO_LIMIT = 6;
const SEVERITY_ICON = {
  critical: <OctagonAlert className="h-4 w-4 shrink-0 text-danger" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />,
  info: <Info className="h-4 w-4 shrink-0 text-muted-foreground" />,
} as const;

/** Zkrácený přehled „co udělat“ (jen položky, které se týkají uživatele; učitel vidí jen své). */
async function todosCard(user: User): Promise<DashboardCard | null> {
  if (!can(user.role, "core.admin.view")) return null;
  const todos = await collectAdminTodos(user);
  if (todos.length === 0) return null;
  const shown = todos.slice(0, TODO_LIMIT);
  return {
    id: "core.todos",
    title: "Co udělat",
    // Admin má „Co udělat“ jako první, učitel až za svými termíny a semináři (F13)
    order: can(user.role, "core.admin") ? 5 : 30,
    size: "md",
    href: "/admin",
    linkLabel: todos.length > shown.length ? `Všech ${todos.length} položek` : "Přehled administrace",
    content: (
      <ul className="divide-y" data-testid="dashboard-todos">
        {shown.map((t) => (
          <li key={t.id} data-testid="dashboard-todo" data-todo={t.id} data-severity={t.severity}>
            <Link href={t.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/50">
              {SEVERITY_ICON[t.severity]}
              <span className="flex-1">{t.label}</span>
              <Badge variant={t.severity === "critical" ? "destructive" : t.severity === "warning" ? "warning" : "secondary"}>{t.count}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    ),
  };
}

/** Statistiky zapnutých modulů (jen admin). */
async function statsCard(user: User): Promise<DashboardCard | null> {
  if (!can(user.role, "core.admin")) return null;
  const stats = await collectAdminStats();
  if (stats.length === 0) return null;
  return {
    id: "core.stats",
    title: "Statistiky",
    order: 100,
    size: "lg",
    content: (
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="dashboard-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-bold">{s.value}</dd>
            <dd className="text-xs text-muted-foreground">{s.hint}</dd>
          </div>
        ))}
      </dl>
    ),
  };
}

/** Všechny karty dashboardu pro uživatele (moduly + jádro), seřazené. */
export async function getDashboardCards(user: User): Promise<DashboardCard[]> {
  const [fromModules, todos, stats] = await Promise.all([collectDashboardCards(user), todosCard(user), statsCard(user)]);
  return [...fromModules, ...[todos, stats].filter((c): c is DashboardCard => c !== null)].sort((a, b) => a.order - b.order);
}
