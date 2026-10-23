"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { computeEnrollmentStatus } from "@/lib/utils";
import type { EnrollmentStatus } from "@/lib/types";
import { requireAuth, requireModule, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { syncEnrollmentWindowStatus } from "@/modules/seminars/window-status";
import { getViewerGrade, isWindowForGrade, sanitizeTargetGrades, windowsForGradeWhere } from "@/modules/seminars/eligibility";
import { activeStudentsWhere, getCurrentSchoolYear, studentsInGradesWhere } from "@/modules/core/school";
import { classLabel } from "@/lib/school";

/** Aktivní studenti, pro které je okno určeno (všichni, nebo jen cílové ročníky). */
async function eligibleStudentsWhere(targetGrades: number[]) {
  if (targetGrades.length === 0) return activeStudentsWhere;
  const { startYear } = await getCurrentSchoolYear();
  return studentsInGradesWhere(targetGrades, startYear);
}

// === ČTENÍ DAT ===

export async function getEnrollmentWindowsVisible() {
  const user = await requireAuth();
  await requireModule("seminars");
  // Studenti vidí jen okna určená pro jejich ročník
  const grade = await getViewerGrade(user);
  const windows = await prisma.enrollmentWindow.findMany({
    where: {
      visibleToStudents: true,
      status: { not: "DRAFT" },
      ...(grade !== undefined ? windowsForGradeWhere(grade) : {}),
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
  const user = await requireAuth();
  await requireModule("seminars");
  // Skrytá okna a koncepty vidí jen učitelé a admini, bez ohledu na parametr
  if (!can(user.role, "seminars.windows.view")) visibleOnly = true;
  const grade = await getViewerGrade(user);

  const whereFilter = {
    ...(visibleOnly ? { visibleToStudents: true, status: { not: "DRAFT" as EnrollmentStatus } } : {}),
    ...(grade !== undefined ? windowsForGradeWhere(grade) : {}),
  };

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
  const user = await requireAuth();
  await requireModule("seminars");
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
  if (!can(user.role, "seminars.windows.view")) {
    if (!ew.visibleToStudents || ew.status === "DRAFT") return undefined;
    if (!isWindowForGrade(ew.targetGrades, (await getViewerGrade(user)) ?? null)) return undefined;
  }

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

// === EXPORTY A PŘEHLEDY ===

export async function getEnrollmentMatrixData(windowId: string) {
  await requirePermission("seminars.windows.manage");
  
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

  // 2. Získáme aktivní studenty, pro které je okno určeno
  const { startYear } = await getCurrentSchoolYear();
  const students = await prisma.user.findMany({
    where: await eligibleStudentsWhere(window.targetGrades),
    include: { classGroup: true },
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
    classLabel: s.classGroup ? classLabel(s.classGroup, startYear) : null,
    choices: enrollmentMap.get(s.id) || {}
  }));

  return {
    blocks: window.blocks.map(b => ({ id: b.id, name: b.name })),
    students: matrix
  };
}

export async function getEnrollmentDetails(windowId: string) {
    await requirePermission("seminars.windows.manage");

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
                                    student: { include: { classGroup: true } }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!window) throw new Error("Zápisové okno nenalezeno.");

    // Také potřebujeme všechny studenty (cílových ročníků) pro report nezapsaných
    const allStudents = await prisma.user.findMany({
        where: await eligibleStudentsWhere(window.targetGrades),
        include: { classGroup: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    // Třída každého studenta ("3.A") pro exporty
    const { startYear } = await getCurrentSchoolYear();
    const classLabels: Record<string, string> = {};
    const students = [
        ...allStudents,
        ...window.blocks.flatMap(b => b.subjectOccurrences.flatMap(o => o.studentEnrollments.map(e => e.student))),
    ];
    for (const s of students) {
        if (s.classGroup) classLabels[s.id] = classLabel(s.classGroup, startYear);
    }

    return {
        window,
        allStudents,
        classLabels
    };
}

// === BLOKY, ZÁPISOVÁ OKNA A VÝSKYTY ===

export async function deleteBlock(blockId: string) {
  return safeAction(async () => {
    await requirePermission("seminars.windows.manage");
    const res = await prisma.block.delete({
      where: { id: blockId },
    });
    revalidatePath("/", "layout");
    return res;
  });
}



export async function moveBlock(blockId: string, direction: "UP" | "DOWN") {
  return safeAction(async () => {
    await requirePermission("seminars.windows.manage");
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
  });
}


export async function updateBlock(block: { id: string; name: string; description?: string | null }) {
  return safeAction(async () => {
    await requirePermission("seminars.windows.manage");
    const res = await prisma.block.update({
      where: { id: block.id },
      data: {
        name: block.name,
        description: block.description || null,
      },
    });
    revalidatePath("/", "layout");
    return res;
  });
}



export async function createBlock(enrollmentWindowId: string, name: string, description?: string | null) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
  
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
  });
}


// === ZÁPISOVÁ OKNA (EnrollmentWindow) ===
export async function createEnrollmentWindow(data: { name: string; description?: string; status: EnrollmentStatus; startsAt: string | Date; endsAt: string | Date; visibleToStudents: boolean; targetGrades?: number[] }) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const created = await prisma.enrollmentWindow.create({
      data: {
        name: data.name,
        description: data.description || null,
        status: data.status,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        visibleToStudents: data.visibleToStudents,
        targetGrades: sanitizeTargetGrades(data.targetGrades),
        createdById: admin.id,
      },
    });
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(created));
  });
}


export async function updateEnrollmentWindow(windowId: string, data: { name: string; description?: string; status: EnrollmentStatus; startsAt: string | Date; endsAt: string | Date; visibleToStudents: boolean; targetGrades?: number[] }) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const updated = await prisma.enrollmentWindow.update({
      where: { id: windowId },
      data: {
        name: data.name,
        description: data.description || null,
        status: data.status,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        visibleToStudents: data.visibleToStudents,
        targetGrades: sanitizeTargetGrades(data.targetGrades),
        updatedById: admin.id,
      },
    });
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(updated));
  });
}


export async function deleteEnrollmentWindow(windowId: string) {
  return safeAction(async () => {
    await requirePermission("seminars.windows.manage");
    // V schema.prisma je nastaveno onDelete: Cascade, takže Prisma automaticky
    // smaže i všechny bloky a výskyty seminářů spojené s tímto oknem.
    const res = await prisma.enrollmentWindow.delete({
      where: { id: windowId },
    });
    revalidatePath("/", "layout");
    return res;
  });
}



// === VÝSKYTY PŘEDMĚTŮ (SubjectOccurrence) ===
export async function createSubjectOccurrence(data: { subjectId: string; blockId: string; teacherId?: string; subCode?: string; capacity?: string | number }) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
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
  });
}


export async function updateSubjectOccurrence(occurrenceId: string, data: { subjectId: string; teacherId?: string; subCode?: string; capacity?: string | number }) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
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
  });
}


export async function deleteSubjectOccurrence(occurrenceId: string) {
  return safeAction(async () => {
    await requirePermission("seminars.windows.manage");
  
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
  });
}
