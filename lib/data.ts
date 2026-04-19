"use server";

import { prisma } from "./prisma";
import type { User } from "./types";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { computeEnrollmentStatus } from "./utils";
import { EnrollmentStatus } from "./types";


// === Pomocné funkce pro autorizaci ===
async function requireAuth(): Promise<User> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as User;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin role required");
  }
  return user;
}

async function requirePrivileged() {
  const user = await requireAuth();
  if (user.role !== "ADMIN" && user.role !== "TEACHER") {
    throw new Error("Unauthorized: Access denied");
  }
  return user;
}

// === Synchronizace stavu zápisového okna s časem ===
async function syncEnrollmentWindowStatus(ew: { id: string; status: string; startsAt: string | Date; endsAt: string | Date }) {
  const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
  let newDbStatus: string | null = null;

  if (computed.is === "open" && ew.status !== "OPEN") {
    newDbStatus = "OPEN";
  } else if (computed.is === "closed" && ew.status !== "DRAFT" && ew.status !== "CLOSED") {
    newDbStatus = "CLOSED";
  }

  if (newDbStatus) {
    await prisma.enrollmentWindow.update({
      where: { id: ew.id },
      data: { status: newDbStatus as "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" },
    });
    // console.log(`syncEnrollmentWindowStatus: Okno "${ew.id}" přepnuto z "${ew.status}" na "${newDbStatus}"`);
    return newDbStatus;
  }
  return ew.status;
}


// === ČTENÍ DAT ===

export async function getSubjects() {
  const user = await requireAuth();
  const isPrivileged = user.role === "ADMIN" || user.role === "TEACHER";

  const subjects = await prisma.subject.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      subjectOccurrences: {
        where: { 
          deletedAt: null,
          ...( !isPrivileged ? {
            block: {
              enrollmentWindow: {
                visibleToStudents: true,
                status: { not: "DRAFT" }
              }
            }
          } : {})
        },
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
          block: {
             include: {
                enrollmentWindow: true
             }
          }
        }
      }
    }
  });

  // Pokud je to student/host, vyfiltrujeme předměty, které nemají žádný viditelný výskyt
  // (Učitelé/Admini vidí všechny předměty vždy)
  const filtered = !isPrivileged
    ? subjects.filter(s => s.subjectOccurrences.length > 0)
    : subjects;

  return JSON.parse(JSON.stringify(filtered));
}


// Slouží k naplnění combo box filters v Data table, nezatíží systém na rozdíl od getAllUsers
export async function getUsersForFilters(): Promise<User[]> {
  await requireAuth(); 
  const users = await prisma.user.findMany({
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



export async function getSubjectById(id: string) {
  return await prisma.subject.findUnique({
    where: { id },
  });
}

export async function getEnrollmentWindowsVisible() {
  const windows = await prisma.enrollmentWindow.findMany({
    where: {
      visibleToStudents: true,
      status: { not: "DRAFT" },
    },
    orderBy: { startsAt: "desc" },
  });

  // Paralelní sync – všechna okna najednou místo sekvenčního cyklu
  const syncResults = await Promise.all(
    windows.map(async (ew) => {
      const newStatus = await syncEnrollmentWindowStatus(ew);
      return { ...ew, status: newStatus as typeof ew.status };
    })
  );

  // Vrátíme přímo aktualizovaná data, žádný druhý fetch
  // Filtrujeme okna, která po syncu zůstala ne-DRAFT
  return syncResults.filter(ew => ew.status !== "DRAFT");
}

export async function getEnrollmentWindowsWithDetails(visibleOnly: boolean = false) {
  const whereFilter = visibleOnly
    ? { visibleToStudents: true, status: { not: "DRAFT" as EnrollmentStatus } }
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
    orderBy: { startsAt: "desc" },
  });

  // Paralelní sync – všechna okna najednou
  await Promise.all(
    ews.map(ew => syncEnrollmentWindowStatus(ew))
  );

  // Aplikujeme aktualizované stavy přímo v paměti místo refetche
  const parsed = ews.map(ew => {
    const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
    const currentStatus = computed.is === "open" ? "OPEN"
      : (computed.is === "closed" && ew.status !== "DRAFT") ? "CLOSED"
      : ew.status;

    return {
      ...ew,
      status: currentStatus,
      blocks: ew.blocks.map(b => ({
        ...b,
        occurrences: b.subjectOccurrences.map(o => ({
          ...o,
          enrollments: o.studentEnrollments,
        })),
      })),
    };
  });

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

  // Sync stavu – pouze pokud se stav změní, refetchneme
  const newStatus = await syncEnrollmentWindowStatus(ew);
  const statusChanged = newStatus !== ew.status;

  // Refetch jen pokud se stav opravdu změnil, jinak použijeme stávající data
  const source = statusChanged
    ? await prisma.enrollmentWindow.findUnique({
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
      })
    : ew;

  if (!source) return undefined;

  return {
    ...source,
    blocks: source.blocks.map((b) => ({
      ...b,
      occurrences: b.subjectOccurrences.map((o) => ({
        ...o,
        enrollments: o.studentEnrollments,
      })),
    })),
  };
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
    await requireAdmin();
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
          role: (row.role as User["role"]) || "STUDENT",
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

// Rozšířené získání uživatelů vcetne historie zapisů
export async function getAllUsers() {
  try {
    await requirePrivileged();
    
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



export async function getUserByEmail(email: string) {
  await requireAuth();
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
    if (!prisma.systemSetting) {
      return "";
    }
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "current_cohort" },
    });
    return (setting as { value: string } | null)?.value || "";
  } catch {
    return "";
  }
}


export async function setGlobalCohort(cohort: string) {
  try {
    await requireAdmin();
    if (!prisma.systemSetting) {
      throw new Error("Databázový model SystemSetting není připraven. Prosím restartujte server a spusťte 'npx prisma generate' podle instrukcí.");
    }
    return await prisma.systemSetting.upsert({
      where: { key: "current_cohort" },
      update: { value: cohort },
      create: { key: "current_cohort", value: cohort },
    });
  } catch (e) {
    const error = e as Error;
    throw error;
  }
}

export async function isRegistrationEnabled(): Promise<boolean> {
  try {
    if (!prisma.systemSetting) return true;
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "registration_enabled" },
    });
    // Pokud klíč neexistuje, registrace je povolena (výchozí stav)
    return setting ? setting.value === "true" : true;
  } catch {
    return false;
  }
}

export async function setRegistrationEnabled(enabled: boolean) {
  await requireAdmin();
  if (!prisma.systemSetting) {
    throw new Error("Model SystemSetting není dostupný.");
  }
  return await prisma.systemSetting.upsert({
    where: { key: "registration_enabled" },
    update: { value: enabled ? "true" : "false" },
    create: { key: "registration_enabled", value: enabled ? "true" : "false" },
  });
}


export async function changeOwnPassword(currentPasswordRaw: string, newPasswordRaw: string) {
  const userFromSession = await requireAuth();
  
  // Znovu vytáhneme uživatele z DB, abychom měli hash hesla
  const user = await prisma.user.findUnique({
    where: { id: userFromSession.id },
  });
  
  if (!user) throw new Error("Uživatel nenalezen.");

  // Ošetření uživatelů bez nastaveného hesla (např. importovaní bez hesla)
  if (!user.passwordHash) {
    throw new Error("Pro tento účet není nastaveno heslo. Kontaktujte administrátora.");
  }

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
    const subjectName = en.subjectOccurrence.subject.name;
    const subCode = en.subjectOccurrence.subCode ? ` [${en.subjectOccurrence.subCode}]` : "";
    const choices = enrollmentMap.get(en.studentId)!; // This line was missing in the original code, added for context
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
  try {
    const user = await requireAuth();
    // Zamezit studentům zápis jiných studentů
    if (user.role === "STUDENT" && user.id !== studentId) {
      throw new Error("Unauthorized mapping");
    }
    // Hosté nemohou zapisovat
    if (user.role === "GUEST") {
      throw new Error("Guests cannot enroll");
    }

    // Celá logika zápisu v transakci – zamezení race condition při kontrole kapacity
    const res = await prisma.$transaction(async (tx) => {
      // Načteme cílový výskyt s kontextem
      const targetOcc = await tx.subjectOccurrence.findUnique({
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
      const alreadyInBlock = await tx.studentEnrollment.findFirst({
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
        const sameSubjectInWindow = await tx.studentEnrollment.findFirst({
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
        const ew = targetOcc.block.enrollmentWindow;
        const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);

        // Lazy update: synchronizujeme stav v DB s reálným časem
        await syncEnrollmentWindowStatus(ew);

        if (computed.is === "closed") {
          if (ew.status === "DRAFT") throw new Error("Zápis je momentálně v přípravě (Koncept).");
          const now = new Date();
          if (now > new Date(ew.endsAt)) throw new Error("Zápis již byl ukončen.");
          throw new Error("Zápis není otevřen.");
        }
        if (computed.is === "planned") {
          throw new Error("Zápis ještě nebyl zahájen.");
        }
      }

      return await tx.studentEnrollment.create({
        data: {
          studentId,
          subjectOccurrenceId,
          createdById: user.id as string,
        },
      });
    }, {
      isolationLevel: 'Serializable',
    });

    revalidatePath("/", "layout");
    return { success: true, data: res };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Nepodařilo se provést zápis." };
  }
}


export async function unenrollStudent(enrollmentId: string) {
  try {
    const user = await requireAuth();
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        subjectOccurrence: {
          include: {
            block: {
              include: { enrollmentWindow: true }
            }
          }
        }
      }
    });

    if (!enrollment) return { error: "Zápis nenalezen." };
    // Student může odepsat jen sebe, ADMIN/TEACHER kohokoliv
    if (user.role === "STUDENT" && enrollment.studentId !== user.id) {
      throw new Error("Unauthorized mapping");
    }
    // Hosté nemohou odepisovat
    if (user.role === "GUEST") {
      throw new Error("Guests cannot unenroll");
    }

    // Kontrola, zda je zápisové okno otevřené (pro studenty)
    if (user.role === "STUDENT") {
      const ew = enrollment.subjectOccurrence.block.enrollmentWindow;
      const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);

      // Lazy update: synchronizujeme stav v DB s reálným časem
      await syncEnrollmentWindowStatus(ew);

      if (computed.is === "closed") {
        throw new Error("Zápis je uzavřen – odepsání již není možné.");
      }
      if (computed.is === "planned") {
        throw new Error("Zápis ještě nebyl zahájen.");
      }
    }

    const res = await prisma.studentEnrollment.delete({
      where: { id: enrollmentId },
    });
    revalidatePath("/", "layout");
    return { success: true, data: res };
  } catch (err: unknown) {
    const error = err as Error;
    return { error: error.message || "Nepodařilo se zrušit zápis." };
  }
}



export async function deleteBlock(blockId: string) {
  await requireAdmin();
  const res = await prisma.block.delete({
    where: { id: blockId },
  });
  revalidatePath("/", "layout");
  return res;
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
  revalidatePath("/", "layout");
  return true;
}


export async function updateBlock(block: { id: string; name: string; description?: string | null }) {
  await requireAdmin();
  const res = await prisma.block.update({
    where: { id: block.id },
    data: {
      name: block.name,
      description: block.description || null,
    },
  });
  revalidatePath("/", "layout");
  return res;
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
  
  revalidatePath("/", "layout");
  return JSON.parse(JSON.stringify(block));
}


// === ZÁPISOVÁ OKNA (EnrollmentWindow) ===
export async function createEnrollmentWindow(data: { name: string; description?: string; status: EnrollmentStatus; startsAt: string | Date; endsAt: string | Date; visibleToStudents: boolean }) {
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
  revalidatePath("/", "layout");
  return JSON.parse(JSON.stringify(created));
}


export async function updateEnrollmentWindow(windowId: string, data: { name: string; description?: string; status: EnrollmentStatus; startsAt: string | Date; endsAt: string | Date; visibleToStudents: boolean }) {
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
  revalidatePath("/", "layout");
  return JSON.parse(JSON.stringify(updated));
}


export async function deleteEnrollmentWindow(windowId: string) {
  await requireAdmin();
  // V schema.prisma je nastaveno onDelete: Cascade, takže Prisma automaticky
  // smaže i všechny bloky a výskyty předmětů spojené s tímto oknem.
  const res = await prisma.enrollmentWindow.delete({
    where: { id: windowId },
  });
  revalidatePath("/", "layout");
  return res;
}



// === VÝSKYTY PŘEDMĚTŮ (SubjectOccurrence) ===
export async function createSubjectOccurrence(data: { subjectId: string; blockId: string; teacherId?: string; subCode?: string; capacity?: string | number }) {
  const admin = await requireAdmin();
  const occ = await prisma.subjectOccurrence.create({
    data: {
      subjectId: data.subjectId,
      blockId: data.blockId,
      teacherId: data.teacherId || null,
      subCode: data.subCode || null,
      capacity: data.capacity ? (typeof data.capacity === 'string' ? parseInt(data.capacity, 10) : data.capacity) : null,
      createdById: admin.id,
    },
  });
  revalidatePath("/", "layout");
  return JSON.parse(JSON.stringify(occ));
}


export async function updateSubjectOccurrence(occurrenceId: string, data: { subjectId: string; teacherId?: string; subCode?: string; capacity?: string | number }) {
  const admin = await requireAdmin();
  const occ = await prisma.subjectOccurrence.update({
    where: { id: occurrenceId },
    data: {
      subjectId: data.subjectId,
      teacherId: data.teacherId || null,
      subCode: data.subCode || null,
      capacity: data.capacity ? (typeof data.capacity === 'string' ? parseInt(data.capacity, 10) : data.capacity) : null,
      updatedById: admin.id,
    },
  });
  revalidatePath("/", "layout");
  return JSON.parse(JSON.stringify(occ));
}


export async function deleteSubjectOccurrence(occurrenceId: string) {
  await requireAdmin();
  
  // Provádíme kaskádové soft-smazání v rámci transakce
  return await prisma.$transaction(async (tx) => {
    // 1. Soft-smazání samotného výskytu
    const occ = await tx.subjectOccurrence.update({
      where: { id: occurrenceId },
      data: { deletedAt: new Date() },
    });

    // 2. Soft-smazání všech aktivních zápisů pro tento výskyt
    await tx.studentEnrollment.updateMany({
      where: { 
        subjectOccurrenceId: occurrenceId,
        deletedAt: null 
      },
      data: { deletedAt: new Date() },
    });

    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(occ));
  });
}


export async function createSubject(subject: { name: string; code?: string; description?: string; syllabus: string }) {
  const admin = await requirePrivileged();
  const res = await prisma.subject.create({
    data: {
      name: subject.name,
      code: subject.code,
      description: subject.description,
      syllabus: subject.syllabus,
      createdById: admin.id,
    },
  });
  revalidatePath("/", "layout");
  return res;
}



export async function toggleSubjectActive(subjectId: string) {
  await requireAdmin();
  const targetSubject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!targetSubject) return;

  const res = await prisma.subject.update({
    where: { id: subjectId },
    data: { isActive: !targetSubject.isActive },
  });
  revalidatePath("/", "layout");
  return res;
}



export async function updateSubject(subject: { id: string; name: string; code?: string; description?: string; syllabus: string }) {
  const admin = await requirePrivileged();
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
    data: { role: role as "ADMIN" | "TEACHER" | "STUDENT" | "GUEST" },
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

let isColdStart = true;

export async function runSystemDiagnostics() {
  const admin = await requireAdmin();
  const startTime = Date.now();
  
  // 1. Database Latency
  const dbStart = Date.now();
  await prisma.user.count();
  const dbLatency = Date.now() - dbStart;

  // 2. Session Latency
  const sessionCheckLatency = Date.now() - startTime;

  // 3. Env Health
  const envHealth = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    VERCEL_SPEED_INSIGHTS: !!process.env.VERCEL || !!process.env.VERCEL_SPEED_INSIGHTS_ID || !!process.env.NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS_ID,
  };

  const wasColdStart = isColdStart;
  isColdStart = false;

  return {
    dbLatency,
    sessionCheckLatency,
    envHealth,
    isFirstRequest: wasColdStart,
    serverTime: new Date().toISOString(),
    userRole: admin.role,
  };
}
