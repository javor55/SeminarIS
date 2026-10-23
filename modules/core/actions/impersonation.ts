"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { clearImpersonationCookie, setImpersonationCookie } from "@/lib/impersonation";
import { classLabel, ROLE_LABELS } from "@/lib/school";
import { getCurrentUser, requirePermission } from "@/lib/session";

// „Zobrazit jako uživatel“ (admin). Náhled je jen pro čtení – viz lib/impersonation.ts.

const describe = (u: { firstName: string; lastName: string; role: string; classGroup?: { grade: number; letter: string } | null }) =>
  `${u.firstName} ${u.lastName} (${ROLE_LABELS[u.role] ?? u.role}${u.role === "STUDENT" && u.classGroup ? ` ${classLabel(u.classGroup)}` : ""})`;

/** Spustí náhled jako jiný uživatel. Nejde na admina, na sebe ani na neaktivní účet. */
export async function startImpersonation(userId: string) {
  return safeAction(async () => {
    // safeAction už odmítl vše v náhledu, takže tu je vždy skutečný admin
    const admin = await requirePermission("core.impersonate");
    const target = await prisma.user.findUnique({ where: { id: userId }, include: { classGroup: true } });
    if (!target) throw new Error("Uživatel nenalezen.");
    if (target.id === admin.id) throw new Error("Sami sebe zobrazit nemůžete.");
    if (target.role === "ADMIN") throw new Error("Jiného administrátora zobrazit nelze.");
    if (!target.isActive) throw new Error("Neaktivní účet zobrazit nelze.");

    await prisma.$transaction((tx) =>
      audit(tx, admin, {
        action: "impersonation.start",
        entityType: "user",
        entityId: target.id,
        summary: `Spuštěn náhled jako ${describe(target)}`,
        data: { targetId: target.id, role: target.role },
      })
    );
    await setImpersonationCookie(admin.id, { id: target.id, role: target.role });
  });
}

/**
 * Ukončí náhled. Záměrně nepoužívá safeAction (v náhledu by se odmítla), ale nic jiného než
 * smazání cookie a záznam do historie neumí.
 */
export async function stopImpersonation(): Promise<{ ok: true }> {
  const user = await getCurrentUser();
  if (user?.impersonatedBy) {
    const admin = await prisma.user.findUnique({ where: { id: user.impersonatedBy.id }, select: { id: true, firstName: true, lastName: true } });
    if (admin) {
      await prisma.$transaction((tx) =>
        audit(tx, admin, {
          action: "impersonation.stop",
          entityType: "user",
          entityId: user.id,
          summary: `Ukončen náhled jako ${user.firstName} ${user.lastName}`,
          data: { targetId: user.id },
        })
      );
    }
  }
  clearImpersonationCookie();
  return { ok: true };
}
