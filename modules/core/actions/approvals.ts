"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/session";
import { ensureCurrentSchoolYear } from "@/modules/core/school";
import { approveInTx } from "@/modules/core/approve";
import { getRegistrationClassMode } from "@/modules/core/settings";
import { audit } from "@/lib/audit";
import { notifyAccountsApproved } from "@/modules/core/notifications";

// Schvalování nově registrovaných uživatelů (hostů) a jejich žádost o třídu.

function revalidateApprovals() {
  revalidatePath("/users");
  revalidatePath("/", "layout");
}

/** Schválí hosta jako studenta: role STUDENT, zařazení do vybrané třídy, smaže žádost. */
export async function approveUser(userId: string, classGroupId: string | null) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const schoolYear = await ensureCurrentSchoolYear();
    await prisma.$transaction((tx) => approveInTx(tx, admin, userId, classGroupId || null, schoolYear));
    await notifyAccountsApproved([userId]);
    revalidateApprovals();
  });
}

/** Hromadné schválení; každý student do své vybrané třídy. Vše nebo nic. */
export async function approveUsers(items: { userId: string; classGroupId: string | null }[]) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    if (items.length === 0) throw new Error("Nikdo není vybrán.");
    const schoolYear = await ensureCurrentSchoolYear();
    await prisma.$transaction(async (tx) => {
      for (const item of items) await approveInTx(tx, admin, item.userId, item.classGroupId || null, schoolYear);
    });
    await notifyAccountsApproved(items.map((i) => i.userId));
    revalidateApprovals();
    return items.length;
  });
}

/** Schválí hosta jako učitele (bez třídy). */
export async function approveAsTeacher(userId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Uživatel nenalezen.");
    if (target.role !== "GUEST") throw new Error("Schvalovat lze jen hosty.");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { role: "TEACHER", isActive: true, requestedClassGroupId: null },
      });
      await audit(tx, admin, {
        action: "users.approve",
        entityType: "user",
        entityId: userId,
        summary: `Schválen účet ${target.firstName} ${target.lastName} jako učitel`,
        data: { role: "TEACHER" },
      });
    });
    await notifyAccountsApproved([userId]);
    revalidateApprovals();
  });
}

/** Zamítne žádost: účet se deaktivuje a žádost o třídu smaže (trvalé smazání je ve správě uživatelů). */
export async function rejectUser(userId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Uživatel nenalezen.");
    if (target.role !== "GUEST") throw new Error("Zamítnout lze jen hosty.");
    if (target.id === admin.id) throw new Error("Nemůžete deaktivovat svůj vlastní účet.");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: false, requestedClassGroupId: null } });
      await audit(tx, admin, {
        action: "users.reject",
        entityType: "user",
        entityId: userId,
        summary: `Zamítnuta žádost o účet ${target.firstName} ${target.lastName} (účet deaktivován)`,
      });
    });
    revalidateApprovals();
  });
}

/**
 * Host (nebo nově založený účet přes Microsoft 365) si vybere / změní požadovanou třídu,
 * dokud není schválen. Role se tím nemění.
 */
export async function setMyRequestedClass(classGroupId: string | null) {
  return safeAction(async () => {
    const user = await requireAuth();
    const mode = await getRegistrationClassMode();
    if (mode === "off") throw new Error("Výběr třídy není zapnutý.");
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
    if (me?.role !== "GUEST") throw new Error("Třídu si může vybrat jen uživatel čekající na schválení.");
    if (!classGroupId) {
      if (mode === "required") throw new Error("Vyberte svou třídu.");
    } else if (!(await prisma.classGroup.findUnique({ where: { id: classGroupId }, select: { id: true } }))) {
      throw new Error("Třída nenalezena.");
    }
    await prisma.user.update({ where: { id: user.id }, data: { requestedClassGroupId: classGroupId || null } });
    revalidatePath("/dashboard");
  });
}
