import Link from "next/link";
import { AlertTriangle, BookOpen, Calendar, CheckCircle2, Info, OctagonAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";
import { collectAdminStats, collectAdminTodos } from "@/modules/core/extensions";
import type { AdminTodo } from "@/modules/types";

const STAT_ICONS = {
  users: <Users className="h-4 w-4 text-slate-500" />,
  book: <BookOpen className="h-4 w-4 text-slate-500" />,
  calendar: <Calendar className="h-4 w-4 text-emerald-500" />,
};

const SEVERITY: Record<AdminTodo["severity"], { label: string; icon: React.ReactNode; variant: "destructive" | "warning" | "secondary" }> = {
  critical: { label: "Naléhavé", icon: <OctagonAlert className="h-4 w-4 text-destructive" />, variant: "destructive" },
  warning: { label: "Ke zpracování", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, variant: "warning" },
  info: { label: "Informace", icon: <Info className="h-4 w-4 text-slate-400" />, variant: "secondary" },
};

export default async function AdminOverviewPage() {
  const user = (await getCurrentUser())!;
  const [todos, stats] = await Promise.all([collectAdminTodos(user), collectAdminStats()]);
  const actionable = todos.filter((t) => t.severity !== "info").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Administrace" description="Co je potřeba udělat a základní přehled systému." />

      <Card className="shadow-sm" data-testid="admin-todos">
        <CardHeader>
          <CardTitle>Co udělat</CardTitle>
          <CardDescription>
            {actionable === 0 ? "Nic nehoří." : `K vyřízení: ${actionable} ${actionable === 1 ? "položka" : actionable < 5 ? "položky" : "položek"}.`} Položky se
            počtem 0 se nezobrazují.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Vše je v pořádku, není co řešit.
            </p>
          ) : (
            <ul className="divide-y">
              {todos.map((t) => {
                const sev = SEVERITY[t.severity];
                return (
                  <li key={t.id} data-testid="admin-todo" data-todo={t.id} data-severity={t.severity}>
                    <Link href={t.href} className="flex items-center gap-3 py-3 hover:bg-accent/50 -mx-2 px-2 rounded-md">
                      {sev.icon}
                      <span className="flex-1 text-sm">{t.label}</span>
                      <Badge variant={sev.variant} title={sev.label} data-testid="todo-count">{t.count}</Badge>
                      <span className="text-sm font-medium underline underline-offset-4 hidden sm:inline">Vyřešit</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
