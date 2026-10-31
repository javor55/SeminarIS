"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import type { Role, User } from "@/lib/types";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { MODULE_SERVERS } from "@/modules/server-registry";
import { ensureCurrentSchoolYear, setStudentClass } from "@/modules/core/school";
import { audit } from "@/lib/audit";
import {
  classLabel as formatClassLabel,
  schoolYearLabel,
  studyStatusLabel,
  ROLE_LABELS,
  STUDY_END_REASON_LABELS,
  type StudyEndReasonValue,
} from "@/lib/school";

/** "Jan Novák" pro popisy v historii změn */
const userName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const ROLES: readonly Role[] = ["GUEST", "STUDENT", "TEACHER", "ADMIN"];

function parseRole(value: string | undefined, fallback?: Role): Role {
  if (value && (ROLES as readonly string[]).includes(value)) return value as Role;
  if (fallback) return fallback;
  throw new Error(`Neplatná role: ${value}`);
}

// Slouží k naplnění combo box filters v Data table, nezatíží systém na rozdíl od getAllUsers.
// Studenti a hosté dostanou jen učitele a adminy (autory a vyučující), ne seznam všech uživatelů.
export async function getUsersForFilters(): Promise<User[]> {
  const user = await requireAuth();
  const users = await prisma.user.findMany({
    where: can(user.role, "core.users.view") ? {} : { role: { in: ["TEACHER", "ADMIN"] } },
    select: { 
      id: true, 
      firstName: true, 
      lastName: true, 
      email: true, 
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { lastName: 'asc' }
  });
  return users;
}

// Rozšířené získání uživatelů vcetne historie tříd a zapisů (seminářů – zatím vazba jádra na modul seminars)
export async function getAllUsers() {
  try {
    await requirePermission("core.users.view");

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        classGroup: true,
        requestedClassGroup: true,
        _count: { select: { teachingAssignments: { where: { schoolYear: { isCurrent: true } } } } },
        classMemberships: {
          include: { classGroup: true, schoolYear: true },
          orderBy: { schoolYear: { startYear: "asc" } },
        },
        studentEnrollments: {
          where: { deletedAt: null },
          include: {
            subjectOccurrence: {
              include: {
                subject: true,
                block: {
                  include: {
                    enrollmentWindow: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    
    // Převod na prostý objekt pro bezpečnou serializaci přes Next.js Server Actions
    const withClass = users.map(({ classMemberships, _count, ...u }) => ({
      ...u,
      // U absolventů a ukončených poslední třída
      classLabel: u.classGroup ? formatClassLabel(u.classGroup) : null,
      requestedClassLabel: u.requestedClassGroup ? formatClassLabel(u.requestedClassGroup) : null,
      // Úvazky učitele v aktuálním školním roce
      assignmentCount: _count.teachingAssignments,
      studyLabel: u.role === "STUDENT" ? studyStatusLabel(u.studyStatus, u.studyEndReason) : null,
      classHistory: classMemberships.map((m) => ({
        yearLabel: schoolYearLabel(m.schoolYear.startYear),
        classLabel: `${m.grade}.${m.classGroup.letter}`,
        reason: m.reason,
      })),
    }));
    return JSON.parse(JSON.stringify(withClass));
  } catch (err) {
    const error = err as Error;
    throw error;
  }
}

export async function updateUserRole(userId: string, role: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    // Zpřísnění kontroly: kontrolujeme ID i Email v session vs cílový uživatel
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Uživatel nenalezen.");

    const isSelf = admin.id === userId || admin.email.toLowerCase() === target.email.toLowerCase();

    if (isSelf) {
      throw new Error("Nemůžete změnit roli sami sobě (prevence ztráty přístupu).");
    }
    const newRole = parseRole(role);
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        // žádost o třídu má smysl jen u hosta čekajícího na schválení
        data: { role: newRole, ...(newRole !== "GUEST" ? { requestedClassGroupId: null } : {}) },
      });
      await audit(tx, admin, {
        action: "users.role",
        entityType: "user",
        entityId: userId,
        summary: `Změněna role uživatele ${userName(target)}: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[newRole]}`,
        data: { before: target.role, after: newRole },
      });
      return updated;
    });
  });
}


export async function updateUserProfile(
  userId: string,
  // classGroupId: undefined = beze změny, null = bez třídy
  data: { firstName: string; lastName: string; email: string; classGroupId?: string | null }
) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");

    const target = await prisma.user.findUnique({ where: { id: userId }, include: { classGroup: true } });
    if (!target) throw new Error("Uzivatel nenalezen.");

    const emailChanged = data.email.toLowerCase() !== target.email.toLowerCase();
    if (emailChanged) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== userId) {
        throw new Error(`E-mail "${data.email}" je jiz pouzivan jinym uzivatelem.`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: data.email.trim().toLowerCase(),
        },
      });
      const changes: string[] = [];
      if (row.firstName !== target.firstName || row.lastName !== target.lastName) {
        changes.push(`jméno ${userName(target)} → ${userName(row)}`);
      }
      if (row.email !== target.email) changes.push(`e-mail ${target.email} → ${row.email}`);
      if (data.classGroupId !== undefined && data.classGroupId !== target.classGroupId) {
        await setStudentClass(tx, { userId, classGroupId: data.classGroupId, schoolYear: await ensureCurrentSchoolYear() });
        const newClass = data.classGroupId ? await tx.classGroup.findUnique({ where: { id: data.classGroupId } }) : null;
        changes.push(`třída ${target.classGroup ? formatClassLabel(target.classGroup) : "bez třídy"} → ${newClass ? formatClassLabel(newClass) : "bez třídy"}`);
      }
      await audit(tx, admin, {
        action: "users.update",
        entityType: "user",
        entityId: userId,
        summary: `Upraven uživatel ${userName(target)}${changes.length ? `: ${changes.join("; ")}` : " (beze změny)"}`,
        data: {
          before: { firstName: target.firstName, lastName: target.lastName, email: target.email, classGroupId: target.classGroupId },
          after: { firstName: row.firstName, lastName: row.lastName, email: row.email, classGroupId: data.classGroupId === undefined ? target.classGroupId : data.classGroupId },
        },
      });
      return row;
    });

    revalidatePath("/", "layout");
    return updated;
  });
}

export async function toggleUserActive(userId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return;

    const isSelf = admin.id === userId || admin.email.toLowerCase() === targetUser.email.toLowerCase();

    if (isSelf) {
      throw new Error("Nemůžete deaktivovat svůj vlastní účet.");
    }
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isActive: !targetUser.isActive },
      });
      await audit(tx, admin, {
        action: updated.isActive ? "users.activate" : "users.deactivate",
        entityType: "user",
        entityId: userId,
        summary: `${updated.isActive ? "Aktivován" : "Deaktivován"} účet uživatele ${userName(targetUser)}`,
        data: { before: targetUser.isActive, after: updated.isActive },
      });
      return updated;
    });
  });
}

export async function resetUserPassword(userId: string, newPasswordRaw: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword },
      });
      await audit(tx, admin, {
        action: "users.password.reset",
        entityType: "user",
        entityId: userId,
        summary: `Správce nastavil nové heslo uživateli ${userName(updated)}`,
      });
      return updated;
    });
  });
}

/** Hromadné přeřazení do třídy v aktuálním školním roce (null = vyřadit ze třídy). */
export async function setUsersClass(userIds: string[], classGroupId: string | null) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const schoolYear = await ensureCurrentSchoolYear();
    await prisma.$transaction(async (tx) => {
      const newClass = classGroupId ? await tx.classGroup.findUnique({ where: { id: classGroupId } }) : null;
      const newLabel = newClass ? formatClassLabel(newClass) : "bez třídy";
      for (const userId of userIds) {
        const before = await tx.user.findUnique({ where: { id: userId }, include: { classGroup: true } });
        if (!before) continue;
        await setStudentClass(tx, { userId, classGroupId, schoolYear });
        await audit(tx, admin, {
          action: "users.class",
          entityType: "user",
          entityId: userId,
          summary: `Přesun uživatele ${userName(before)} do třídy: ${before.classGroup ? formatClassLabel(before.classGroup) : "bez třídy"} → ${newLabel}`,
          data: { before: before.classGroupId, after: classGroupId },
        });
      }
    });
    revalidatePath("/users");
  });
}

// === STAV STUDIA ===

/**
 * Ukončí studium během roku (přestup, zanechání, vyloučení …). Účet se deaktivuje,
 * třída a historie zůstávají; data v modulech (zápisy) se nemažou.
 */
export async function endStudy(userId: string, data: { reason: StudyEndReasonValue; note?: string; endedAt?: string }) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Uživatel nenalezen.");
    if (target.role !== "STUDENT") throw new Error("Studium lze ukončit jen studentovi.");
    const reasons: StudyEndReasonValue[] = ["GRADUATED", "TRANSFER", "WITHDRAWAL", "EXPULSION", "OTHER"];
    if (!reasons.includes(data.reason)) throw new Error("Neplatný důvod.");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          studyStatus: data.reason === "GRADUATED" ? "GRADUATED" : "LEFT",
          studyEndReason: data.reason,
          studyEndedAt: data.endedAt ? new Date(data.endedAt) : new Date(),
          studyEndNote: data.note?.trim() || null,
          isActive: false,
        },
      });
      await audit(tx, admin, {
        action: "users.study.end",
        entityType: "user",
        entityId: userId,
        summary: `Ukončeno studium studenta ${userName(target)}: ${STUDY_END_REASON_LABELS[data.reason]}${data.note?.trim() ? ` (${data.note.trim()})` : ""}`,
        data: { reason: data.reason, note: data.note?.trim() || null },
      });
    });
    revalidatePath("/", "layout");
  });
}

/** Vrátí ukončení studia (omyl, návrat ke studiu). Účet se znovu aktivuje. */
export async function restoreStudy(userId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { studyStatus: "ACTIVE", studyEndReason: null, studyEndedAt: null, studyEndNote: null, isActive: true },
      });
      await audit(tx, admin, {
        action: "users.study.restore",
        entityType: "user",
        entityId: userId,
        summary: `Obnoveno studium studenta ${userName(updated)}`,
      });
    });
    revalidatePath("/", "layout");
  });
}

/**
 * Trvale smaže uživatele. V transakci nejprve každý modul uklidí svá data
 * (odkazy na uživatele, jeho zápisy, audit pole – viz `onUserDelete`),
 * potom se smaže samotný uživatel.
 * Nelze smazat sám sebe. Pouze ADMIN.
 */
export async function deleteUserPermanently(userId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("core.users.manage");

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw new Error("Uživatel nenalezen.");

    const isSelf = admin.id === userId || admin.email.toLowerCase() === targetUser.email.toLowerCase();
    if (isSelf) throw new Error("Nemůžete smazat svůj vlastní účet.");

    await prisma.$transaction(async (tx) => {
      // Úklid běží i pro vypnuté moduly, jinak by jejich data blokovala smazání
      for (const { server } of MODULE_SERVERS) {
        await server.onUserDelete?.(tx, userId, admin.id);
      }
      await tx.user.delete({ where: { id: userId } });
      await audit(tx, admin, {
        action: "users.delete",
        entityType: "user",
        entityId: userId,
        summary: `Trvale smazán uživatel ${userName(targetUser)} (${targetUser.email}, ${ROLE_LABELS[targetUser.role]})`,
        data: { email: targetUser.email, role: targetUser.role },
      });
    });

    revalidatePath("/", "layout");
  });
}
