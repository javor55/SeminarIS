import { prisma } from "@/lib/prisma";
import type { ModuleServer } from "@/modules/server-types";
import { getPublicClassOptions } from "@/modules/core/school";
import { getRegistrationClassMode } from "@/modules/core/settings";
import { ClassRequestCard } from "@/modules/core/components/users/ClassRequestCard";
import { getCoreEmailEstimates, runCoreDailyJob } from "@/modules/core/notifications";
import { getCoreAdminTodos } from "@/modules/core/admin-todos";
import { CORE_BULK_ACTIONS } from "@/modules/core/bulk-actions";

export const coreServer: ModuleServer = {
  runDailyJob: runCoreDailyJob,
  getEmailEstimates: getCoreEmailEstimates,
  getAdminTodos: getCoreAdminTodos,
  // Hromadné akce v seznamu uživatelů (moduly přidávají další stejným bodem rozšíření)
  bulkUserActions: CORE_BULK_ACTIONS,

  // Host čekající na schválení: výzva k výběru třídy (když je zapnutý výběr třídy). Ostatní karty jádra
  // (co udělat, statistiky) skládá `modules/core/dashboard-cards.tsx` z bodů rozšíření všech modulů.
  async getDashboardCards(user) {
    if (user.role !== "GUEST") return [];
    const mode = await getRegistrationClassMode();
    if (mode === "off") return [];
    const [classes, me] = await Promise.all([
      getPublicClassOptions(),
      prisma.user.findUnique({ where: { id: user.id }, select: { requestedClassGroupId: true } }),
    ]);
    if (classes.length === 0) return [];
    return [
      {
        id: "class-request",
        title: "Vyberte svou třídu",
        order: 0,
        size: "md",
        content: <ClassRequestCard classes={classes} current={me?.requestedClassGroupId ?? null} required={mode === "required"} />,
      },
    ];
  },

  async getAdminStats() {
    const userCount = await prisma.user.count();
    return [{ label: "Uživatelé celkem", value: userCount, hint: "Včetně studentů a učitelů", icon: "users" }];
  },
};
