"use server";

import { prisma } from "./prisma";
import { EnrollmentWindowWithBlocks, User, Subject, EnrollmentWindow } from "./types";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import bcrypt from "bcryptjs";

// === Pomocné funkce pro autorizaci ===
async function requireAuth(): Promise<any> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin role required");
  }
  return user;
}

// === ČTENÍ DAT ===

export async function getSubjects() {
  const subjects = await prisma.subject.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      subjectOccurrences: {
        where: { deletedAt: null },
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      }
    }
  });

  return JSON.parse(JSON.stringify(subjects));
}

// Slouží k naplnění combo box filters v Data table, nezatíží systém na rozdíl od getAllUsers
export async function getUsersForFilters() {
  const users = await prisma.user.findMany({
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { lastName: 'asc' }
  });
  return users;
}

export async function getSubjectById(id: string) {
  return await prisma.subject.findUnique({
    where: { id },
  });
}

export async function getEnrollmentWindowsVisible() {
  return await prisma.enrollmentWindow.findMany({
    where: {
      visibleToStudents: true,
      status: { not: "DRAFT" },
    },
  });
}

export async function getEnrollmentWindowByIdWithBlocks(id: string) {
  const ew = await prisma.enrollmentWindow.findUnique({
    where: { id },
    include: {
      blocks: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: {
          subjectOccurrences: {
            where: { deletedAt: null },
            include: {
              subject: true,
              teacher: true,
              studentEnrollments: {
                where: { deletedAt: null },
              },
            },
          },
        },
      },
    },
  });

  if (!ew) return undefined;

  const blocksObj = ew.blocks.map((b) => ({
    ...b,
    occurrences: b.subjectOccurrences.map((o) => ({
      ...o,
      enrollments: o.studentEnrollments,
    })),
  }));

  return {
    ...ew,
    blocks: blocksObj,
  };
}

// Rozšířené získání uživatelů vcetne historie zapisů
export async function getAllUsers() {
  try {
    const adminUser = await requireAdmin();
    console.log(`ServerAction: getAllUsers voláno uživatelem ${adminUser.email}`);
    
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
    
    console.log(`ServerAction: Nalezeno ${users.length} uživatelů.`);
    // Převod na prostý objekt pro bezpečnou serializaci přes Next.js Server Actions
    return JSON.parse(JSON.stringify(users));
  } catch (err: any) {
    console.error("ServerAction Error (getAllUsers):", err.message);
    throw err;
  }
}

// Veřejná funkce pro přihlašovací stránku (demo/testování)
export async function getPublicTestUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
      },
      take: 20,
    });
    return JSON.parse(JSON.stringify(users));
  } catch (err) {
    console.error("Error fetching public test users:", err);
    return [];
  }
}

export async function getUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
  });
}

// === SYSTEM SETTINGS ===
export async function getGlobalCohort() {
  try {
    // @ts-ignore
    if (!prisma.systemSetting) {
      console.warn("Prisma: model SystemSetting není v klientovi dostupný (nutný restart serveru)");
      return "";
    }
    // @ts-ignore
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "current_cohort" },
    });
    return setting?.value || "";
  } catch (e) {
    console.error("Error fetching global cohort:", e);
    return "";
  }
}


export async function setGlobalCohort(cohort: string) {
  try {
    await requireAdmin();
    // @ts-ignore
    if (!prisma.systemSetting) {
      throw new Error("Databázový model SystemSetting není připraven. Prosím restartujte server a spusťte 'npx prisma generate' podle instrukcí.");
    }
    // @ts-ignore
    return await prisma.systemSetting.upsert({
      where: { key: "current_cohort" },
      update: { value: cohort },
      create: { key: "current_cohort", value: cohort },
    });
  } catch (e: any) {
    console.error("Error setting global cohort:", e);
    throw e;
  }
}


// === MUTACE (zapis) ===
export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  const user = await requireAuth();
  // Zamezit komukoliv jinému než sobě, Ledaže je to ADMIN
  if (user.id !== studentId && user.role !== "ADMIN") {
    throw new Error("Unauthorized mapping");
  }

  return await prisma.studentEnrollment.create({
    data: {
      studentId,
      subjectOccurrenceId,
      createdById: user.id as string,
    },
  });
}

export async function unenrollStudent(enrollmentId: string) {
  const user = await requireAuth();
  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { id: enrollmentId },
  });

  if (!enrollment) return;
  if (enrollment.studentId !== user.id && user.role !== "ADMIN") {
    throw new Error("Unauthorized mapping");
  }

  return await prisma.studentEnrollment.delete({
    where: { id: enrollmentId },
  });
}

export async function deleteBlock(blockId: string) {
  await requireAdmin();
  return await prisma.block.delete({
    where: { id: blockId },
  });
}

export async function moveBlock(blockId: string, direction: "UP" | "DOWN") {
  await requireAdmin();
  const block = await prisma.block.findUnique({ where: { id: blockId } });
  if (!block) return;
  const blocks = await prisma.block.findMany({
    where: { enrollmentWindowId: block.enrollmentWindowId },
    orderBy: { order: "asc" },
  });
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index === -1) return;
  const newIndex = direction === "UP" ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= blocks.length) return;

  const targetBlock = blocks[newIndex];

  await prisma.$transaction([
    prisma.block.update({ where: { id: block.id }, data: { order: targetBlock.order } }),
    prisma.block.update({ where: { id: targetBlock.id }, data: { order: block.order } }),
  ]);
  return true;
}

export async function updateBlock(block: any) {
  await requireAdmin();
  return await prisma.block.update({
    where: { id: block.id },
    data: {
      name: block.name,
      description: block.description,
    },
  });
}

export async function createSubject(subject: any) {
  const admin = await requireAdmin();
  return await prisma.subject.create({
    data: {
      name: subject.name,
      code: subject.code,
      description: subject.description,
      syllabus: subject.syllabus,
      createdById: admin.id,
    },
  });
}

export async function toggleSubjectActive(subjectId: string) {
  await requireAdmin();
  const targetSubject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!targetSubject) return;

  return await prisma.subject.update({
    where: { id: subjectId },
    data: { isActive: !targetSubject.isActive },
  });
}

export async function updateSubject(subject: any) {
  const admin = await requireAdmin();
  return await prisma.subject.update({
    where: { id: subject.id },
    data: {
      name: subject.name,
      code: subject.code,
      description: subject.description,
      syllabus: subject.syllabus,
      updatedById: admin.id,
      updatedAt: new Date(),
    },
  });
}

export async function updateUserRole(userId: string, role: string) {
  const admin = await requireAdmin();
  // Zpřísnění kontroly: kontrolujeme ID i Email v session vs cílový uživatel
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Uživatel nenalezen.");

  const isSelf = admin.id === userId || admin.email.toLowerCase() === target.email.toLowerCase();

  if (isSelf) {
    throw new Error("Nemůžete změnit roli sami sobě (prevence ztráty přístupu).");
  }
  return await prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
  });
}

export async function toggleUserActive(userId: string) {
  const admin = await requireAdmin();
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
  await requireAdmin();
  const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
  return await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashedPassword },
  });
}

export async function updateUsersCohort(userIds: string[], cohort: string) {
  await requireAdmin();
  return await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { cohort },
  });
}

export async function importUsers(usersToImport: any[]) {
  await requireAdmin();
  
  const results = {
    created: 0,
    updated: 0,
    errors: 0,
  };

  for (const u of usersToImport) {
    try {
      const email = u.email?.trim().toLowerCase();
      if (!email) {
        results.errors++;
        continue;
      }

      const updateData: any = {
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        cohort: u.cohort || null,
      };

      if (u.role) updateData.role = u.role as any;
      if (u.isActive !== undefined) updateData.isActive = Boolean(u.isActive);
      if (u.password) updateData.passwordHash = await bcrypt.hash(u.password, 10);

      const createData: any = {
        ...updateData,
        email: email,
        role: (u.role as any) || "STUDENT",
        isActive: u.isActive !== undefined ? Boolean(u.isActive) : true,
        passwordHash: updateData.passwordHash || await bcrypt.hash(Math.random().toString(36).slice(-8), 10),
      };

      await prisma.user.upsert({
        where: { email },
        update: updateData,
        create: createData,
      });

      results.created++; 
    } catch (error) {
      console.error("Error importing user:", error);
      results.errors++;
    }
  }

  return results;
}

