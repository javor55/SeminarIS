"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma, type TxClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { computeEnrollmentStatus } from "@/lib/utils";
import type { EnrollmentStatus } from "@/lib/types";
import { requireAuth, requireModule, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { syncEnrollmentWindowStatus } from "@/modules/seminars/window-status";
import { eligibleStudentsWhere, getViewerGrade, isWindowForGrade, sanitizeTargetGrades, windowsForGradeWhere } from "@/modules/seminars/eligibility";
import { classLabel, targetGradesLabel } from "@/lib/school";
import { audit, describeChanges } from "@/lib/audit";
import { formatDateTime } from "@/lib/datetime";
import { notifyWindowOpenedIfOpen } from "@/modules/seminars/notifications";

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
  const students = await prisma.user.findMany({
    where: eligibleStudentsWhere(window.targetGrades),
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
    classLabel: s.classGroup ? classLabel(s.classGroup) : null,
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
        where: eligibleStudentsWhere(window.targetGrades),
        include: { classGroup: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    // Třída každého studenta ("3.A") pro exporty
    const classLabels: Record<string, string> = {};
    const students = [
        ...allStudents,
        ...window.blocks.flatMap(b => b.subjectOccurrences.flatMap(o => o.studentEnrollments.map(e => e.student))),
    ];
    for (const s of students) {
        if (s.classGroup) classLabels[s.id] = classLabel(s.classGroup);
    }

    return {
        window,
        allStudents,
        classLabels
    };
}

// === BLOKY, ZÁPISOVÁ OKNA A VÝSKYTY ===

type WindowInput = {
  name: string;
  description?: string;
  status: EnrollmentStatus;
  startsAt: string | Date;
  endsAt: string | Date;
  visibleToStudents: boolean;
  targetGrades?: number[];
  // Automatická připomínka nezapsaným N dní před koncem (prázdné = ne)
  reminderDaysBefore?: number | string | null;
};

const STATUS_LABELS: Record<string, string> = { DRAFT: "koncept", SCHEDULED: "naplánováno", OPEN: "otevřeno", CLOSED: "uzavřeno" };

/** Údaje okna v podobě vhodné pro historii změn (čitelné texty). */
function windowDisplay(w: {
  name: string;
  description: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  visibleToStudents: boolean;
  targetGrades: number[];
  reminderDaysBefore: number | null;
}) {
  return {
    name: w.name,
    description: w.description,
    status: STATUS_LABELS[w.status] ?? w.status,
    startsAt: formatDateTime(w.startsAt),
    endsAt: formatDateTime(w.endsAt),
    visibleToStudents: w.visibleToStudents,
    targetGrades: targetGradesLabel(w.targetGrades),
    reminderDaysBefore: w.reminderDaysBefore == null ? "ne" : `${w.reminderDaysBefore} dní před koncem`,
  };
}

const WINDOW_LABELS = {
  name: "název",
  description: "popis",
  status: "stav",
  startsAt: "začátek",
  endsAt: "konec",
  visibleToStudents: "viditelné pro studenty",
  targetGrades: "ročníky",
  reminderDaysBefore: "připomínka nezapsaným",
} as const;

function cleanReminderDays(value: WindowInput["reminderDaysBefore"]): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new Error("Připomínka nezapsaným: zadejte 1–60 dní před koncem, nebo nechte prázdné.");
  return n;
}

export async function deleteBlock(blockId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const res = await prisma.$transaction(async (tx) => {
      const block = await tx.block.findUnique({ where: { id: blockId }, include: { enrollmentWindow: { select: { name: true } } } });
      if (!block) throw new Error("Blok nenalezen.");
      const deleted = await tx.block.delete({ where: { id: blockId } });
      await audit(tx, admin, {
        action: "seminars.block.delete",
        entityType: "block",
        entityId: blockId,
        summary: `Smazán blok „${block.name}“ v zápisu „${block.enrollmentWindow.name}“`,
        data: { name: block.name, windowId: block.enrollmentWindowId },
      });
      return deleted;
    });
    revalidatePath("/", "layout");
    return res;
  });
}



export async function moveBlock(blockId: string, direction: "UP" | "DOWN") {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const block = await prisma.block.findUnique({ where: { id: blockId }, include: { enrollmentWindow: { select: { name: true } } } });
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

    await prisma.$transaction(async (tx) => {
      // Nastavíme dočasné záporné order k obejití unique constraintu
      await tx.block.update({ where: { id: block.id }, data: { order: -1 } });
      // Posuneme druhý blok na starou pozici toho prvního
      await tx.block.update({ where: { id: targetBlock.id }, data: { order: block.order } });
      // Nyní ten první (dočasně na -1) dosadíme na cílovou pozici
      await tx.block.update({ where: { id: block.id }, data: { order: targetBlock.order } });
      await audit(tx, admin, {
        action: "seminars.block.move",
        entityType: "block",
        entityId: block.id,
        summary: `Blok „${block.name}“ v zápisu „${block.enrollmentWindow.name}“ posunut ${direction === "UP" ? "nahoru" : "dolů"} (vedle bloku „${targetBlock.name}“)`,
        data: { from: block.order, to: targetBlock.order },
      });
    });
    revalidatePath("/", "layout");
    return true;
  });
}


export async function updateBlock(block: { id: string; name: string; description?: string | null }) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const res = await prisma.$transaction(async (tx) => {
      const before = await tx.block.findUnique({ where: { id: block.id }, include: { enrollmentWindow: { select: { name: true } } } });
      if (!before) throw new Error("Blok nenalezen.");
      const updated = await tx.block.update({
        where: { id: block.id },
        data: {
          name: block.name,
          description: block.description || null,
        },
      });
      const changes = describeChanges(
        { name: before.name, description: before.description },
        { name: updated.name, description: updated.description },
        { name: "název", description: "popis" }
      );
      await audit(tx, admin, {
        action: "seminars.block.update",
        entityType: "block",
        entityId: block.id,
        summary: `Upraven blok „${before.name}“ v zápisu „${before.enrollmentWindow.name}“${changes ? `: ${changes}` : ""}`,
        data: { before: { name: before.name, description: before.description }, after: { name: updated.name, description: updated.description } },
      });
      return updated;
    });
    revalidatePath("/", "layout");
    return res;
  });
}



export async function createBlock(enrollmentWindowId: string, name: string, description?: string | null) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
  
    const block = await prisma.$transaction(async (tx) => {
      // Zjistíme nejvyšší order a přidáme + 1
      const existingBlocks = await tx.block.findMany({
        where: { enrollmentWindowId },
        orderBy: { order: "desc" },
        take: 1
      });
      const nextOrder = existingBlocks.length > 0 ? existingBlocks[0].order + 1 : 1;

      const created = await tx.block.create({
        data: {
          name,
          description: description || null,
          order: nextOrder,
          enrollmentWindowId,
          createdById: admin.id,
        }
      });
      const ew = await tx.enrollmentWindow.findUnique({ where: { id: enrollmentWindowId }, select: { name: true } });
      await audit(tx, admin, {
        action: "seminars.block.create",
        entityType: "block",
        entityId: created.id,
        summary: `Přidán blok „${name}“ do zápisu „${ew?.name ?? ""}“`,
        data: { name, windowId: enrollmentWindowId },
      });
      return created;
    });
  
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(block));
  });
}


// === ZÁPISOVÁ OKNA (EnrollmentWindow) ===
export async function createEnrollmentWindow(data: WindowInput) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const reminderDaysBefore = cleanReminderDays(data.reminderDaysBefore);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.enrollmentWindow.create({
        data: {
          name: data.name,
          description: data.description || null,
          status: data.status,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          visibleToStudents: data.visibleToStudents,
          targetGrades: sanitizeTargetGrades(data.targetGrades),
          reminderDaysBefore,
          createdById: admin.id,
        },
      });
      const d = windowDisplay(row);
      await audit(tx, admin, {
        action: "seminars.window.create",
        entityType: "enrollmentWindow",
        entityId: row.id,
        summary: `Vytvořeno zápisové okno „${row.name}“ (${d.status}, ${d.startsAt} – ${d.endsAt}, ${d.targetGrades})`,
        data: { after: d },
      });
      return row;
    });
    // Okno je rovnou otevřené: upozornit studenty (po commitu)
    await notifyWindowOpenedIfOpen(created);
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(created));
  });
}


export async function updateEnrollmentWindow(windowId: string, data: WindowInput) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const reminderDaysBefore = cleanReminderDays(data.reminderDaysBefore);
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.enrollmentWindow.findUnique({ where: { id: windowId } });
      if (!before) throw new Error("Zápisové okno nenalezeno.");
      const endsAt = new Date(data.endsAt);
      const row = await tx.enrollmentWindow.update({
        where: { id: windowId },
        data: {
          name: data.name,
          description: data.description || null,
          status: data.status,
          startsAt: new Date(data.startsAt),
          endsAt,
          visibleToStudents: data.visibleToStudents,
          targetGrades: sanitizeTargetGrades(data.targetGrades),
          reminderDaysBefore,
          // Změna konce nebo nastavení připomínky = připomínka se může poslat znovu
          ...(endsAt.getTime() !== before.endsAt.getTime() || reminderDaysBefore !== before.reminderDaysBefore ? { reminderSentOn: null } : {}),
          updatedById: admin.id,
        },
      });
      const b = windowDisplay(before);
      const a = windowDisplay(row);
      const changes = describeChanges(b, a, WINDOW_LABELS);
      await audit(tx, admin, {
        action: "seminars.window.update",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Upraveno zápisové okno „${before.name}“${changes ? `: ${changes}` : " (beze změny)"}`,
        data: { before: b, after: a },
      });
      return row;
    });
    await notifyWindowOpenedIfOpen(updated);
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(updated));
  });
}


export async function deleteEnrollmentWindow(windowId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    // V schema.prisma je nastaveno onDelete: Cascade, takže Prisma automaticky
    // smaže i všechny bloky a výskyty předmětů spojené s tímto oknem.
    const res = await prisma.$transaction(async (tx) => {
      const before = await tx.enrollmentWindow.findUnique({ where: { id: windowId } });
      if (!before) throw new Error("Zápisové okno nenalezeno.");
      const enrollments = await tx.studentEnrollment.count({ where: { deletedAt: null, subjectOccurrence: { block: { enrollmentWindowId: windowId } } } });
      const deleted = await tx.enrollmentWindow.delete({ where: { id: windowId } });
      await audit(tx, admin, {
        action: "seminars.window.delete",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Smazáno zápisové okno „${before.name}“ (včetně ${enrollments} zápisů studentů)`,
        data: { before: windowDisplay(before), enrollments },
      });
      return deleted;
    });
    revalidatePath("/", "layout");
    return res;
  });
}



// === VÝSKYTY PŘEDMĚTŮ (SubjectOccurrence) ===
type OccurrenceInput = { subjectId: string; teacherId?: string; subCode?: string; capacity?: string | number };

const parseCapacity = (c: OccurrenceInput["capacity"]) => (c ? (typeof c === "string" ? parseInt(c, 10) : c) : null);

async function occurrenceLabel(tx: TxClient, subjectId: string, blockId: string, teacherId?: string | null) {
  const [subject, block, teacher] = await Promise.all([
    tx.subject.findUnique({ where: { id: subjectId }, select: { name: true } }),
    tx.block.findUnique({ where: { id: blockId }, select: { name: true, enrollmentWindow: { select: { name: true } } } }),
    teacherId ? tx.user.findUnique({ where: { id: teacherId }, select: { firstName: true, lastName: true } }) : Promise.resolve(null),
  ]);
  return {
    text: `„${subject?.name ?? "?"}“ v bloku „${block?.name ?? "?"}“ (zápis „${block?.enrollmentWindow.name ?? "?"}“)`,
    teacher: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
  };
}

export async function createSubjectOccurrence(data: OccurrenceInput & { blockId: string }) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const occ = await prisma.$transaction(async (tx) => {
      const row = await tx.subjectOccurrence.create({
        data: {
          subjectId: data.subjectId,
          blockId: data.blockId,
          teacherId: data.teacherId || null,
          subCode: data.subCode || null,
          capacity: parseCapacity(data.capacity),
          createdById: admin.id,
        },
      });
      const l = await occurrenceLabel(tx, row.subjectId, row.blockId, row.teacherId);
      await audit(tx, admin, {
        action: "seminars.occurrence.create",
        entityType: "subjectOccurrence",
        entityId: row.id,
        summary: `Do zápisu přidán předmět ${l.text}${l.teacher ? `, vyučující ${l.teacher}` : ""}, kapacita ${row.capacity ?? "neomezená"}`,
        data: { subjectId: row.subjectId, blockId: row.blockId, teacherId: row.teacherId, subCode: row.subCode, capacity: row.capacity },
      });
      return row;
    });
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(occ));
  });
}


export async function updateSubjectOccurrence(occurrenceId: string, data: OccurrenceInput) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const occ = await prisma.$transaction(async (tx) => {
      const before = await tx.subjectOccurrence.findUnique({ where: { id: occurrenceId } });
      if (!before) throw new Error("Předmět v zápisu nenalezen.");
      const row = await tx.subjectOccurrence.update({
        where: { id: occurrenceId },
        data: {
          subjectId: data.subjectId,
          teacherId: data.teacherId || null,
          subCode: data.subCode || null,
          capacity: parseCapacity(data.capacity),
          updatedById: admin.id,
        },
      });
      const l = await occurrenceLabel(tx, row.subjectId, row.blockId, row.teacherId);
      const lb = await occurrenceLabel(tx, before.subjectId, before.blockId, before.teacherId);
      const changes = describeChanges(
        { subject: lb.text, teacher: lb.teacher, subCode: before.subCode, capacity: before.capacity ?? "neomezená" },
        { subject: l.text, teacher: l.teacher, subCode: row.subCode, capacity: row.capacity ?? "neomezená" },
        { subject: "předmět", teacher: "vyučující", subCode: "kód", capacity: "kapacita" }
      );
      await audit(tx, admin, {
        action: "seminars.occurrence.update",
        entityType: "subjectOccurrence",
        entityId: occurrenceId,
        summary: `Upraven předmět ${lb.text}${changes ? `: ${changes}` : ""}`,
        data: {
          before: { subjectId: before.subjectId, teacherId: before.teacherId, subCode: before.subCode, capacity: before.capacity },
          after: { subjectId: row.subjectId, teacherId: row.teacherId, subCode: row.subCode, capacity: row.capacity },
        },
      });
      return row;
    });
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(occ));
  });
}


export async function deleteSubjectOccurrence(occurrenceId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
  
    // Provádíme kaskádové soft-smazání v rámci transakce
    const occ = await prisma.$transaction(async (tx) => {
      // 1. Soft-smazání samotného výskytu
      const row = await tx.subjectOccurrence.update({
        where: { id: occurrenceId },
        data: { deletedAt: new Date() },
      });

      // 2. Soft-smazání všech aktivních zápisů pro tento výskyt
      const removed = await tx.studentEnrollment.updateMany({
        where: { 
          subjectOccurrenceId: occurrenceId,
          deletedAt: null 
        },
        data: { deletedAt: new Date() },
      });

      const l = await occurrenceLabel(tx, row.subjectId, row.blockId);
      await audit(tx, admin, {
        action: "seminars.occurrence.delete",
        entityType: "subjectOccurrence",
        entityId: occurrenceId,
        summary: `Z zápisu odebrán předmět ${l.text} (zrušeno ${removed.count} zápisů studentů)`,
        data: { subjectId: row.subjectId, blockId: row.blockId, removedEnrollments: removed.count },
      });
      return row;
    });

    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(occ));
  });
}
