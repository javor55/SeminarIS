"use server";

import { prisma } from "@/lib/prisma";
import type { Role, User } from "@/lib/types";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { MODULE_SERVERS } from "@/modules/server-registry";

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
  cohort?: string, 
  role?: string, 
  isActive?: boolean | string | number, 
  password?: string 
}>) {
  try {
    await requirePermission("core.users.manage");
    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const row of data) {
      try {
        const email = row.email?.toLowerCase().trim();
        if (!email) {
          errors++;
          continue;
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
          cohort: row.cohort || null,
          role: parseRole(row.role, "STUDENT"),
          isActive: isActiveValue,
        };

        const passwordHash = row.password ? await bcrypt.hash(row.password, 10) : undefined;

        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { 
              ...payload,
              ...(passwordHash ? { passwordHash } : {})
            }
          });
          updated++;
        } else {
          await prisma.user.create({
            data: {
              ...payload,
              email,
              passwordHash: passwordHash || await bcrypt.hash(Math.random().toString(36), 10),
            }
          });
          created++;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Chyba při importu řádku:", e);
        errors++;
      }
    }

    revalidatePath("/users");
    return { created, updated, errors };
  } catch (err: unknown) {
    const error = err as Error;
    throw new Error(error.message || "Import se nezdařil.");
  }
}

// Rozšířené získání uživatelů vcetne historie zapisů (seminářů – zatím vazba jádra na modul seminars)
export async function getAllUsers() {
  try {
    await requirePermission("core.users.view");
    
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
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
    return JSON.parse(JSON.stringify(users));
  } catch (err) {
    const error = err as Error;
    throw error;
  }
}

export async function updateUserRole(userId: string, role: string) {
  const admin = await requirePermission("core.users.manage");
  // Zpřísnění kontroly: kontrolujeme ID i Email v session vs cílový uživatel
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Uživatel nenalezen.");

  const isSelf = admin.id === userId || admin.email.toLowerCase() === target.email.toLowerCase();

  if (isSelf) {
    throw new Error("Nemůžete změnit roli sami sobě (prevence ztráty přístupu).");
  }
  return await prisma.user.update({
    where: { id: userId },
    data: { role: parseRole(role) },
  });
}


export async function updateUserProfile(
  userId: string,
  data: { firstName: string; lastName: string; email: string; cohort?: string | null }
) {
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
      cohort: data.cohort?.trim() || null,
    },
  });

  revalidatePath("/", "layout");
  return updated;
}

export async function toggleUserActive(userId: string) {
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
}

export async function resetUserPassword(userId: string, newPasswordRaw: string) {
  await requirePermission("core.users.manage");
  const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
  return await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashedPassword },
  });
}

export async function updateUsersCohort(userIds: string[], cohort: string) {
  await requirePermission("core.users.manage");
  return await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { cohort },
  });
}

/**
 * Trvale smaže uživatele. V transakci nejprve každý modul uklidí svá data
 * (odkazy na uživatele, jeho zápisy, audit pole – viz `onUserDelete`),
 * potom se smaže samotný uživatel.
 * Nelze smazat sám sebe. Pouze ADMIN.
 */
export async function deleteUserPermanently(userId: string) {
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
}
