import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can } from "@/modules/registry";
import type { ModuleServer } from "@/modules/server-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPublicClassOptions } from "@/modules/core/school";
import { getRegistrationClassMode } from "@/modules/core/settings";
import { ClassRequestCard } from "@/modules/core/components/users/ClassRequestCard";
import { getCoreEmailEstimates, runCoreDailyJob } from "@/modules/core/notifications";

export const coreServer: ModuleServer = {
  runDailyJob: runCoreDailyJob,
  getEmailEstimates: getCoreEmailEstimates,

  async getDashboardWidget(user) {
    // Host čekající na schválení: výzva k výběru třídy (když je zapnutý výběr třídy)
    if (user.role === "GUEST") {
      const mode = await getRegistrationClassMode();
      if (mode === "off") return null;
      const [classes, me] = await Promise.all([
        getPublicClassOptions(),
        prisma.user.findUnique({ where: { id: user.id }, select: { requestedClassGroupId: true } }),
      ]);
      if (classes.length === 0) return null;
      return <ClassRequestCard classes={classes} current={me?.requestedClassGroupId ?? null} required={mode === "required"} />;
    }

    // Admin: kolik účtů čeká na schválení
    if (can(user.role, "core.users.manage")) {
      const pending = await prisma.user.count({ where: { role: "GUEST", isActive: true } });
      if (pending === 0) return null;
      return (
        <Card data-testid="approvals-widget">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">
              {pending} {pending === 1 ? "účet čeká" : pending < 5 ? "účty čekají" : "účtů čeká"} na schválení
            </CardTitle>
            <Button asChild variant="outline" size="sm"><Link href="/users?tab=approvals">Schválit</Link></Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Noví uživatelé jsou hosté, dokud je nepotvrdíte jako studenty nebo učitele.
          </CardContent>
        </Card>
      );
    }
    return null;
  },

  async getAdminStats() {
    const userCount = await prisma.user.count();
    return [{ label: "Uživatelé celkem", value: userCount, hint: "Včetně studentů a učitelů", icon: "users" }];
  },
};
