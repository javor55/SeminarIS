import type { TxClient } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { classLabel } from "@/lib/school";
import { setStudentClass } from "@/modules/core/school";

/**
 * Schválí hosta jako studenta v dané transakci: role, zařazení do třídy (s historií), smazání žádosti.
 * Bez záznamu v historii – ten zapisuje volající (jednotlivě, nebo souhrnně u hromadné akce).
 */
export async function approveGuest(tx: TxClient, userId: string, classGroupId: string | null, schoolYear: { id: string }) {
  const target = await tx.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Uživatel nenalezen.");
  if (target.role !== "GUEST") throw new Error(`${target.firstName} ${target.lastName} už není host, schválení není potřeba.`);
  await tx.user.update({
    where: { id: userId },
    data: { role: "STUDENT", isActive: true, requestedClassGroupId: null },
  });
  let label = "";
  if (classGroupId) {
    await setStudentClass(tx, { userId, classGroupId, schoolYear, reason: "ASSIGNED" });
    const cls = await tx.classGroup.findUnique({ where: { id: classGroupId } });
    label = cls ? ` do třídy ${classLabel(cls)}` : "";
  }
  return { target, label };
}

/** Schválení jednoho hosta včetně záznamu v historii. */
export async function approveInTx(tx: TxClient, actor: AuditActor, userId: string, classGroupId: string | null, schoolYear: { id: string }) {
  const { target, label } = await approveGuest(tx, userId, classGroupId, schoolYear);
  await audit(tx, actor, {
    action: "users.approve",
    entityType: "user",
    entityId: userId,
    summary: `Schválen účet ${target.firstName} ${target.lastName} jako student${label}`,
    data: { role: "STUDENT", classGroupId },
  });
}
