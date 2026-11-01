import Link from "next/link";
import { BookOpen, Calendar, CheckCircle2, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAdminSubtitle, getSystemTiles } from "@/modules/core/admin-tiles";
import { requirePagePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { TodoHideButton, TodoShowHiddenButton } from "@/modules/core/components/admin/TodoHideButton";
import { collectAdminStats, collectAdminTodos } from "@/modules/core/extensions";
import type { AdminTodo } from "@/modules/types";

const STAT_ICONS = {
  users: <Users className="h-4 w-4 text-muted-foreground" />,
  book: <BookOpen className="h-4 w-4 text-muted-foreground" />,
  calendar: <Calendar className="h-4 w-4 text-success" />,
};

const SEVERITY: Record<AdminTodo["severity"], { label: string; dot: string; variant: "destructive" | "warning" | "secondary" }> = {
  critical: { label: "Naléhavé", dot: "bg-danger", variant: "destructive" },
  warning: { label: "Ke zpracování", dot: "bg-warning", variant: "warning" },
  info: { label: "Informace", dot: "bg-muted-foreground/50", variant: "secondary" },
};

export default async function AdminOverviewPage() {
  const user = await requirePagePermission("core.admin.view");
  const [allTodos, stats] = await Promise.all([collectAdminTodos(user, { includeHidden: true }), collectAdminStats()]);
  const todos = allTodos.filter((t) => !t.hidden);
  const hiddenCount = allTodos.length - todos.length;
  // Počty v podtitulku sedí s viditelnými řádky: ke zpracování (naléhavé + ke zpracování) a informace zvlášť
  const actionable = todos.filter((t) => t.severity !== "info").length;
  const infoCount = todos.length - actionable;
  const canHide = can(user.role, "core.admin");

  const isAdmin = can(user.role, "core.admin");
  const [tiles, subtitle] = await Promise.all([isAdmin ? getSystemTiles() : [], isAdmin ? getAdminSubtitle() : null]);

  return (
    <div className="space-y-6">
      <PageHeader title="Administrace" description={subtitle ?? "Co je potřeba udělat a základní přehled systému."} />

      <section className="space-y-3" data-testid="admin-todos">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">K vyřízení</h2>
          <p className="text-sm text-muted-foreground">
            <span data-testid="todos-summary">
              K vyřízení: {actionable} · Informace: {infoCount}
            </span>
            . Položky s počtem 0 se nezobrazují.
          </p>
        </div>
        {todos.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
            <CheckCircle2 className="h-4 w-4 text-success" /> Vše je v pořádku, není co řešit.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            {todos.map((t) => {
              const sev = SEVERITY[t.severity];
              return (
                <li key={t.id} data-testid="admin-todo" data-todo={t.id} data-severity={t.severity} className="flex flex-wrap items-center gap-1 pr-2">
                  <Link href={t.href} className="flex min-w-0 flex-1 basis-64 items-center gap-3 px-4 py-3.5 hover:bg-accent/50">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", sev.dot)} title={sev.label} aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium">{t.label}</span>
                    <Badge variant={sev.variant} title={sev.label} data-testid="todo-count">{t.count}</Badge>
                    <span className="hidden text-sm font-medium underline underline-offset-4 sm:inline">Vyřešit</span>
                  </Link>
                  {t.severity === "info" && canHide && <TodoHideButton todoId={t.id} />}
                </li>
              );
            })}
          </ul>
        )}
        {hiddenCount > 0 && canHide && <TodoShowHiddenButton count={hiddenCount} />}
      </section>

      {tiles.length > 0 && (
        <section className="space-y-3" data-testid="admin-tiles">
          <h2 className="text-lg font-semibold">Stav systému</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.id} href={t.href} data-testid="admin-tile" data-tile={t.id} data-tone={t.tone} className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent/40">
                <span className="font-semibold">{t.title}</span>
                <span className={cn("text-sm font-semibold", t.tone === "ok" ? "text-success" : t.tone === "warn" ? "text-warning" : "text-muted-foreground")}>{t.status}</span>
                <span className="text-sm text-muted-foreground">{t.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* STATISTIKY (dodávají je zapnuté moduly) */}
      <div className="grid gap-4 md:grid-cols-3" data-testid="admin-stats">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              {stat.icon && STAT_ICONS[stat.icon]}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
