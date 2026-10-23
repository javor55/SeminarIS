"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import type { Role, User } from "@/lib/types";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { MODULE_SERVERS } from "@/modules/server-registry";
import { ensureCurrentSchoolYear, findOrCreateClass, setStudentClass } from "@/modules/core/school";
import {
  classLabel as formatClassLabel,
  parseClassLabel,
  schoolYearLabel,
  studyStatusLabel,
  DEFAULT_STUDY_YEARS,
  type StudyEndReasonValue,
} from "@/lib/school";

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

// Hromadný import uživatelů
export async function importUsers(data: Array<{ 
  firstName?: string, 
  lastName?: string, 
  email: string, 
  // Třída v aktuálním školním roce, např. "3.A" (prázdné = beze změny)
  class?: string,
  role?: string, 
  isActive?: boolean | string | number, 
  password?: string 
}>) {
  return safeAction(async () => {
    try {
      await requirePermission("core.users.manage");
      let created = 0;
      let updated = 0;
      let errors = 0;
      // Popis chyb pro admina (první desítky řádků)
      const messages: string[] = [];
      const schoolYear = await ensureCurrentSchoolYear();

      for (const [index, row] of data.entries()) {
        // +2: číslování od 1 a řádek s hlavičkou
        const line = index + 2;
        try {
          const email = row.email?.toLowerCase().trim();
          if (!email) {
            errors++;
            messages.push(`Řádek ${line}: chybí e-mail.`);
            continue;
          }

          // Třída "3.A" → záznam ClassGroup (založí se, pokud ještě neexistuje)
          let classGroupId: string | undefined;
          const classText = row.class?.trim();
          if (classText) {
            const parsed = parseClassLabel(classText);
            if (!parsed || parsed.grade > DEFAULT_STUDY_YEARS) {
              errors++;
              messages.push(`Řádek ${line} (${email}): neplatná třída „${classText}“, očekává se např. 3.A.`);
              continue;
            }
            classGroupId = (await findOrCreateClass(parsed.grade, parsed.letter)).id;
          }

          const existing = await prisma.user.findUnique({ where: { email } });
        
          let isActiveValue = true;
          if (typeof row.isActive === "boolean") {
            isActiveValue = row.isActive;
          } else if (typeof row.isActive === "string") {
            isActiveValue = row.isActive.toUpperCase() === "TRUE" || row.isActive === "1";
          } else if (typeof row.isActive === "number") {
            isActiveValue = row.isActive === 1;
          }

          const payload = {
            firstName: row.firstName || "",
            lastName: row.lastName || "",
            role: parseRole(row.role, "STUDENT"),
            isActive: isActiveValue,
          };

          const passwordHash = row.password ? await bcrypt.hash(row.password, 10) : undefined;

          let userId: string;
          if (existing) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { 
                ...payload,
                ...(passwordHash ? { passwordHash } : {})
              }
            });
            userId = existing.id;
            updated++;
          } else {
            const createdUser = await prisma.user.create({
              data: {
                ...payload,
                email,
                passwordHash: passwordHash || await bcrypt.hash(Math.random().toString(36), 10),
              }
            });
            userId = createdUser.id;
            created++;
          }
          if (classGroupId) {
            await setStudentClass(prisma, { userId, classGroupId, schoolYear });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("Chyba při importu řádku:", e);
          errors++;
          messages.push(`Řádek ${line}: ${(e as Error).message || "neznámá chyba"}`);
        }
      }

      revalidatePath("/users");
      return { created, updated, errors, messages: messages.slice(0, 20) };
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(error.message || "Import se nezdařil.");
    }
  });
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
    return await prisma.user.update({
      where: { id: userId },
      // žádost o třídu má smysl jen u hosta čekajícího na schválení
      data: { role: newRole, ...(newRole !== "GUEST" ? { requestedClassGroupId: null } : {}) },
    });
  });
}


export async function updateUserProfile(
  userId: string,
  // classGroupId: undefined = beze změny, null = bez třídy
  data: { firstName: string; lastName: string; email: string; classGroupId?: string | null }
) {
  return safeAction(async () => {
    await requirePermission("core.users.manage");

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Uzivatel nenalezen.");

    const emailChanged = data.email.toLowerCase() !== target.email.toLowerCase();
    if (emailChanged) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== userId) {
        throw new Error(`E-mail "${data.email}" je jiz pouzivan jinym uzivatelem.`);
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
      },
    });
    if (data.classGroupId !== undefined && data.classGroupId !== target.classGroupId) {
      await setStudentClass(prisma, { userId, classGroupId: data.classGroupId, schoolYear: await ensureCurrentSchoolYear() });
    }

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
    return await prisma.user.update({
      where: { id: userId },
      data: { isActive: !targetUser.isActive },
    });
  });
}

export async function resetUserPassword(userId: string, newPasswordRaw: string) {
  return safeAction(async () => {
    await requirePermission("core.users.manage");
    const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
    return await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });
  });
}

/** Hromadné přeřazení do třídy v aktuálním školním roce (null = vyřadit ze třídy). */
export async function setUsersClass(userIds: string[], classGroupId: string | null) {
  return safeAction(async () => {
    await requirePermission("core.users.manage");
    const schoolYear = await ensureCurrentSchoolYear();
    await prisma.$transaction(async (tx) => {
      for (const userId of userIds) {
        await setStudentClass(tx, { userId, classGroupId, schoolYear });
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
    await requirePermission("core.users.manage");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Uživatel nenalezen.");
    if (target.role !== "STUDENT") throw new Error("Studium lze ukončit jen studentovi.");
    const reasons: StudyEndReasonValue[] = ["GRADUATED", "TRANSFER", "WITHDRAWAL", "EXPULSION", "OTHER"];
    if (!reasons.includes(data.reason)) throw new Error("Neplatný důvod.");
    await prisma.user.update({
      where: { id: userId },
      data: {
        studyStatus: data.reason === "GRADUATED" ? "GRADUATED" : "LEFT",
        studyEndReason: data.reason,
        studyEndedAt: data.endedAt ? new Date(data.endedAt) : new Date(),
        studyEndNote: data.note?.trim() || null,
        isActive: false,
      },
    });
    revalidatePath("/", "layout");
  });
}

/** Vrátí ukončení studia (omyl, návrat ke studiu). Účet se znovu aktivuje. */
export async function restoreStudy(userId: string) {
  return safeAction(async () => {
    await requirePermission("core.users.manage");
    await prisma.user.update({
      where: { id: userId },
      data: { studyStatus: "ACTIVE", studyEndReason: null, studyEndedAt: null, studyEndNote: null, isActive: true },
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
    });

    revalidatePath("/", "layout");
  });
}
