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

export async function getEnrollmentWindowsWithDetails(visibleOnly: boolean = false) {
  const whereFilter = visibleOnly
    ? { visibleToStudents: true, status: { not: "DRAFT" } as any }
    : {};

  const ews = await prisma.enrollmentWindow.findMany({
    where: whereFilter,
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
    orderBy: { startsAt: "asc" },
  });

  const parsed = ews.map(ew => ({
    ...ew,
    blocks: ew.blocks.map(b => ({
      ...b,
      occurrences: b.subjectOccurrences.map(o => ({
        ...o,
        enrollments: o.studentEnrollments,
      })),
    })),
  }));

  return JSON.parse(JSON.stringify(parsed));
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

// === SYSTEM SETTINGS & STATS ===
export async function getSystemStats() {
  await requireAdmin();
  const [userCount, subjectCount, activeEnrollmentCount] = await Promise.all([
    prisma.user.count(),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.enrollmentWindow.count({ where: { status: "OPEN" } }),
  ]);
  
  return {
    userCount,
    subjectCount,
    activeEnrollmentCount,
  };
}

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

export async function changeOwnPassword(currentPasswordRaw: string, newPasswordRaw: string) {
  const userFromSession = await requireAuth();
  
  // Znovu vytáhneme uživatele z DB, abychom měli hash hesla
  const user = await prisma.user.findUnique({
    where: { id: userFromSession.id },
  });
  
  if (!user) throw new Error("Uživatel nenalezen.");

  // Ověření starého hesla
  const isValid = await bcrypt.compare(currentPasswordRaw, user.passwordHash);
  if (!isValid) throw new Error("Současné heslo je nesprávné.");

  // Hashování a uložení nového hesla
  const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
  return await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashedPassword },
  });
}

export async function getEnrollmentMatrixData(windowId: string) {
  await requireAdmin();
  
  // 1. Získáme bloky okna (pro určení sloupců)
  const window = await prisma.enrollmentWindow.findUnique({
    where: { id: windowId },
    include: {
      blocks: {
        where: { deletedAt: null },
        orderBy: { order: "asc" }
      }
    }
  });

  if (!window) throw new Error("Zápisové okno nenalezeno.");

  // 2. Získáme všechny aktivní studenty
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      isActive: true,
    },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" }
    ]
  });

  // 3. Získáme všechny aktivní zápisy pro toto okno
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      deletedAt: null,
      subjectOccurrence: {
        block: {
          enrollmentWindowId: windowId
        }
      }
    },
    include: {
      subjectOccurrence: {
        include: {
          subject: true,
        }
      }
    }
  });

  // 4. Namapujeme zápisy k ID studentů
  const enrollmentMap = new Map<string, Record<string, { label: string, at: Date }>>();
  enrollments.forEach(en => {
    if (!enrollmentMap.has(en.studentId)) {
      enrollmentMap.set(en.studentId, {});
    }
    const choices = enrollmentMap.get(en.studentId)!;
    const subjectName = en.subjectOccurrence.subject.name;
    const subCode = en.subjectOccurrence.subCode ? ` [${en.subjectOccurrence.subCode}]` : "";
    choices[en.subjectOccurrence.blockId] = {
        label: `${subjectName}${subCode}`,
        at: en.createdAt
    };
  });

  // 5. Sestavíme výsledný seznam pro všechny studenty
  const matrix = students.map(s => ({
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.email,
    cohort: s.cohort,
    choices: enrollmentMap.get(s.id) || {}
  }));

  return {
    blocks: window.blocks.map(b => ({ id: b.id, name: b.name })),
    students: matrix
  };
}

export async function getEnrollmentDetails(windowId: string) {
    await requireAdmin();

    const window = await prisma.enrollmentWindow.findUnique({
        where: { id: windowId },
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
                                include: {
                                    student: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!window) throw new Error("Zápisové okno nenalezeno.");

    // Také potřebujeme všechny studenty pro report nezapsaných
    const allStudents = await prisma.user.findMany({
        where: { role: "STUDENT", isActive: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    return {
        window,
        allStudents
    };
}


// === MUTACE (zapis) ===
export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  const user = await requireAuth();
  // Zamezit komukoliv jinému než sobě, Ledaže je to ADMIN
  if (user.id !== studentId && user.role !== "ADMIN") {
    throw new Error("Unauthorized mapping");
  }

  // Načteme cílový výskyt s kontextem
  const targetOcc = await prisma.subjectOccurrence.findUnique({
    where: { id: subjectOccurrenceId },
    include: {
      subject: true,
      block: {
        include: { enrollmentWindow: true }
      },
      studentEnrollments: {
        where: { deletedAt: null }
      }
    }
  });

  if (!targetOcc || targetOcc.deletedAt) throw new Error("Seminář nenalezen.");

  // 1. Kontrola kapacity
  if (targetOcc.capacity !== null && targetOcc.studentEnrollments.length >= targetOcc.capacity) {
    throw new Error("Kapacita semináře je již naplněna.");
  }

  // 2. Kontrola, zda už není zapsán v tomto bloku
  const alreadyInBlock = await prisma.studentEnrollment.findFirst({
    where: {
      studentId,
      deletedAt: null,
      subjectOccurrence: {
        blockId: targetOcc.blockId
      }
    }
  });
  if (alreadyInBlock) {
    throw new Error("V tomto bloku již máte zapsaný jiný seminář. Nejdříve se odepište.");
  }

  // 3. Kontrola duplicity předmětu v rámci stejného okna (podle subject.code)
  if (targetOcc.subject.code) {
    const subjectCode = targetOcc.subject.code;
    const sameSubjectInWindow = await prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        deletedAt: null,
        subjectOccurrence: {
          block: {
            enrollmentWindowId: targetOcc.block.enrollmentWindowId
          },
          subject: {
            code: subjectCode
          }
        }
      }
    });

    if (sameSubjectInWindow) {
      throw new Error("Tento předmět již máte zapsaný v jiném bloku tohoto zápisu.");
    }
  }

  // 4. Kontrola, zda je zápisové okno otevřené (pokud uživatel není ADMIN)
  if (user.role !== "ADMIN") {
    const window = targetOcc.block.enrollmentWindow;
    const now = new Date();
    if (window.status !== "OPEN") {
       if (window.status === "DRAFT") throw new Error("Zápis je momentálně v přípravě (Koncept).");
       if (now < new Date(window.startsAt)) throw new Error("Zápis ještě nebyl zahájen.");
       if (now > new Date(window.endsAt)) throw new Error("Zápis již byl ukončen.");
       throw new Error("Zápis není otevřen.");
    }
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
    // Nastavíme dočasné záporné order k obejití unique constraintu
    prisma.block.update({ where: { id: block.id }, data: { order: -1 } }),
    // Posuneme druhý blok na starou pozici toho prvního
    prisma.block.update({ where: { id: targetBlock.id }, data: { order: block.order } }),
    // Nyní ten první (dočasně na -1) dosadíme na cílovou pozici
    prisma.block.update({ where: { id: block.id }, data: { order: targetBlock.order } }),
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

export async function createBlock(enrollmentWindowId: string, name: string, description?: string | null) {
  const admin = await requireAdmin();
  
  // Zjistíme nejvyšší order a přidáme + 1
  const existingBlocks = await prisma.block.findMany({
    where: { enrollmentWindowId },
    orderBy: { order: "desc" },
    take: 1
  });
  
  const nextOrder = existingBlocks.length > 0 ? existingBlocks[0].order + 1 : 1;
  
  const block = await prisma.block.create({
    data: {
      name,
      description: description || null,
      order: nextOrder,
      enrollmentWindowId,
      createdById: admin.id,
    }
  });
  
  return JSON.parse(JSON.stringify(block));
}

// === ZÁPISOVÁ OKNA (EnrollmentWindow) ===
export async function createEnrollmentWindow(data: any) {
  const admin = await requireAdmin();
  const created = await prisma.enrollmentWindow.create({
    data: {
      name: data.name,
      description: data.description || null,
      status: data.status,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      visibleToStudents: data.visibleToStudents,
      createdById: admin.id,
    },
  });
  return JSON.parse(JSON.stringify(created));
}

export async function updateEnrollmentWindow(windowId: string, data: any) {
  const admin = await requireAdmin();
  const updated = await prisma.enrollmentWindow.update({
    where: { id: windowId },
    data: {
      name: data.name,
      description: data.description || null,
      status: data.status,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      visibleToStudents: data.visibleToStudents,
      updatedById: admin.id,
    },
  });
  return JSON.parse(JSON.stringify(updated));
}

export async function deleteEnrollmentWindow(windowId: string) {
  await requireAdmin();
  // Kaskádovite smazání není nastaveno explicitně v Prismě on cascade delete,
  // takže bezpečně smažeme jen okno. Modely by ideálně měly mít onDelete: Cascade
  // v schema.prisma, pro tuto chvíli necháváme jen Prisma smazání.
  return await prisma.enrollmentWindow.delete({
    where: { id: windowId },
  });
}

// === VÝSKYTY PŘEDMĚTŮ (SubjectOccurrence) ===
export async function createSubjectOccurrence(data: any) {
  const admin = await requireAdmin();
  const occ = await prisma.subjectOccurrence.create({
    data: {
      subjectId: data.subjectId,
      blockId: data.blockId,
      teacherId: data.teacherId || null,
      subCode: data.subCode || null,
      capacity: data.capacity ? parseInt(data.capacity, 10) : null,
      createdById: admin.id,
    },
  });
  return JSON.parse(JSON.stringify(occ));
}

export async function updateSubjectOccurrence(occurrenceId: string, data: any) {
  const admin = await requireAdmin();
  const occ = await prisma.subjectOccurrence.update({
    where: { id: occurrenceId },
    data: {
      subjectId: data.subjectId,
      teacherId: data.teacherId || null,
      subCode: data.subCode || null,
      capacity: data.capacity ? parseInt(data.capacity, 10) : null,
      updatedById: admin.id,
    },
  });
  return JSON.parse(JSON.stringify(occ));
}

export async function deleteSubjectOccurrence(occurrenceId: string) {
  await requireAdmin();
  const occ = await prisma.subjectOccurrence.update({
    where: { id: occurrenceId },
    data: { deletedAt: new Date() },
  });
  return JSON.parse(JSON.stringify(occ));
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

