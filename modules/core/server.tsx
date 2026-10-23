import { prisma } from "@/lib/prisma";
import type { ModuleServer } from "@/modules/server-types";

export const coreServer: ModuleServer = {
  async getAdminStats() {
    const userCount = await prisma.user.count();
    return [{ label: "Uživatelé celkem", value: userCount, hint: "Včetně studentů a učitelů", icon: "users" }];
  },
};
