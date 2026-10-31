"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma, type TxClient } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, requireModule, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { windowPhase } from "@/modules/seminars/window-phase";
import { audienceWhere, audienceWhereForWindow, getViewerContext, isWindowVisibleTo, loadAudienceEntries, occurrencesForViewerWhere, replaceAudience, windowsForViewerWhere, type ViewerContext } from "@/modules/seminars/eligibility";
import { audienceInclude, buildAudienceView } from "@/modules/seminars/audience-view";
import { audienceSummary, draftFromEntries, EMPTY_AUDIENCE, entriesFromDraft, type AudienceDraft } from "@/modules/seminars/audience";
import { blockRulesLabel, cleanBlockRules, type BlockRules } from "@/modules/seminars/window-rules";
import { classLabel, compareClasses, sanitizeGrades } from "@/lib/school";
import { activeStudentsWhere } from "@/modules/core/school";
import type { Prisma } from "@prisma/client";
import { audit, describeChanges } from "@/lib/audit";
import { formatDateTime } from "@/lib/datetime";
import { notifyWindowOpenedIfOpen } from "@/modules/seminars/notifications";

// === ČTENÍ DAT ===

/**
 * Include okna s bloky, výskyty a zápisy. Studenti dostanou jen výskyty určené jim (omezení na ročníky / třídy)
 * a bloky, které by po tomto omezení zůstaly prázdné, se skryjí. Publikum okna načítá jen učitel a admin.
 */
function windowInclude(ctx: ViewerContext | undefined) {
  const occWhere = ctx ? occurrencesForViewerWhere(ctx) : {};
  return {
    ...(ctx ? {} : audienceInclude),
    blocks: {
      where: {
        deletedAt: null,
        ...(ctx
          ? { OR: [{ subjectOccurrences: { none: { deletedAt: null } } }, { subjectOccurrences: { some: { deletedAt: null, ...occWhere } } }] }
          : {}),
      },
      orderBy: { order: "asc" as const },
      include: {
        subjectOccurrences: {
          where: { deletedAt: null, ...occWhere },
          include: {
            subject: true,
            teacher: true,
            restrictClasses: { select: { id: true, grade: true, letter: true } },
            studentEnrollments: { where: { deletedAt: null } },
          },
        },
      },
    },
  };
}

type WindowRow = Prisma.EnrollmentWindowGetPayload<{ include: ReturnType<typeof windowInclude> }>;

/** Stav okna odvozený z dat (koncept / plánováno / otevřeno / uzavřeno) pro UI; rozhoduje server, klient jen zobrazuje. */
function windowState(ew: Parameters<typeof windowPhase>[0]) {
  const info = windowPhase(ew);
  return { phase: info.phase, phaseLabel: info.label, closedEarly: info.closedEarly, canReopen: info.canReopen, canCloseEarly: info.canCloseEarly };
}

/**
 * Přidá k výskytům `enrollments` a `enrolledCount` a pro privilegované pohled na publikum.
 * Studentovi se v `enrollments` nechají jen jeho vlastní zápisy: cizí zápisy by prozradily, kdo je kde zapsaný
 * (jména ukazuje jen akce `getOccurrenceParticipants`, pokud to okno povoluje).
 */
function shapeWindow(ew: WindowRow, viewerId: string, privileged: boolean) {
  const { audience, blocks, ...rest } = ew as WindowRow & { audience?: Parameters<typeof buildAudienceView>[0] };
  return {
    ...rest,
    ...(privileged && audience ? { audienceView: buildAudienceView(audience) } : {}),
    blocks: blocks.map(({ subjectOccurrences, ...block }) => ({
      ...block,
      occurrences: subjectOccurrences.map(({ studentEnrollments, ...occ }) => ({
        ...occ,
        enrolledCount: studentEnrollments.length,
        enrollments: privileged ? studentEnrollments : studentEnrollments.filter((e) => e.studentId === viewerId),
      })),
    })),
  };
}

export async function getEnrollmentWindowsWithDetails(visibleOnly: boolean = false) {
  const user = await requireAuth();
  await requireModule("seminars");
  // Skrytá okna a koncepty vidí jen učitelé a admini, bez ohledu na parametr
  if (!can(user.role, "seminars.windows.view")) visibleOnly = true;
  const ctx = await getViewerContext(user);

  const whereFilter = {
    ...(visibleOnly ? { published: true } : {}),
    ...(ctx ? windowsForViewerWhere(ctx) : {}),
  };

  const ews = await prisma.enrollmentWindow.findMany({
    where: whereFilter,
    include: windowInclude(ctx),
    orderBy: { startsAt: "desc" },
  });

  // Okno se mohlo od posledního čtení otevřít: doběhne upozornění „zápis otevřen“ (jednou za okno)
  await Promise.all(ews.map((ew) => notifyWindowOpenedIfOpen(ew)));

  const parsed = ews.map((ew) => ({ ...shapeWindow(ew, user.id, !ctx), ...windowState(ew) }));

  return JSON.parse(JSON.stringify(parsed));
}

export async function getEnrollmentWindowByIdWithBlocks(id: string) {
  const user = await requireAuth();
  await requireModule("seminars");
  const ctx = await getViewerContext(user);
  const include = windowInclude(ctx);
  const ew = await prisma.enrollmentWindow.findUnique({ where: { id }, include });

  if (!ew) return undefined;
  if (ctx) {
    if (!ew.published) return undefined;
    if (!(await isWindowVisibleTo(ctx, id))) return undefined;
  }

  await notifyWindowOpenedIfOpen(ew);
  return { ...shapeWindow(ew, user.id, !ctx), ...windowState(ew) };
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
    where: await audienceWhereForWindow(windowId),
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
        where: await audienceWhereForWindow(windowId),
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
  startsAt: string | Date;
  endsAt: string | Date;
  // Zveřejněno studentům (false = koncept). Otevření a zavření řídí data; předčasné uzavření má vlastní akci.
  published: boolean;
  // Publikum: ročníky, třídy, studenti a vynechaní studenti; prázdné = všichni aktivní studenti
  audience?: AudienceDraft;
  // Automatická připomínka nezapsaným N dní před koncem (prázdné = ne)
  reminderDaysBefore?: number | string | null;
  // Může se student sám odepsat / přepsat?
  allowSelfUnenroll?: boolean;
  // Studenti mohou měnit zápis nejpozději do (null = do konce okna)
  changesUntil?: string | Date | null;
  // Co o zapsaných vidí studenti
  resultsVisibility?: "COUNTS" | "NAMES";
};

/** Údaje okna v podobě vhodné pro historii změn (čitelné texty). */
function windowDisplay(
  w: {
    name: string;
    description: string | null;
    published: boolean;
    closedEarlyAt: Date | null;
    startsAt: Date;
    endsAt: Date;
    reminderDaysBefore: number | null;
    allowSelfUnenroll: boolean;
    changesUntil: Date | null;
    resultsVisibility: string;
  },
  audience: string
) {
  return {
    name: w.name,
    description: w.description,
    published: w.published ? "zveřejněno" : "koncept",
    startsAt: formatDateTime(w.startsAt),
    endsAt: formatDateTime(w.endsAt),
    closedEarlyAt: w.closedEarlyAt ? formatDateTime(w.closedEarlyAt) : "ne",
    audience,
    reminderDaysBefore: w.reminderDaysBefore == null ? "ne" : `${w.reminderDaysBefore} dní před koncem`,
    allowSelfUnenroll: w.allowSelfUnenroll ? "ano" : "ne",
    changesUntil: w.changesUntil ? formatDateTime(w.changesUntil) : "konec okna",
    resultsVisibility: w.resultsVisibility === "NAMES" ? "jména i počty" : "jen počty",
  };
}

const WINDOW_LABELS = {
  name: "název",
  description: "popis",
  published: "zveřejnění",
  startsAt: "začátek",
  endsAt: "konec",
  closedEarlyAt: "předčasně uzavřeno",
  audience: "publikum",
  reminderDaysBefore: "připomínka nezapsaným",
  allowSelfUnenroll: "student se může sám odepsat",
  changesUntil: "změny zápisu do",
  resultsVisibility: "viditelnost zapsaných pro studenty",
} as const;

function cleanReminderDays(value: WindowInput["reminderDaysBefore"]): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new Error("Připomínka nezapsaným: zadejte 1–60 dní před koncem, nebo nechte prázdné.");
  return n;
}

/** Ověří časy a pravidla okna z formuláře. */
function cleanWindowRules(data: WindowInput) {
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new Error("Zadejte platný začátek a konec zápisu.");
  let changesUntil: Date | null = null;
  if (data.changesUntil) {
    changesUntil = new Date(data.changesUntil);
    if (Number.isNaN(changesUntil.getTime())) throw new Error("Zadejte platný termín pro změny zápisu.");
    if (changesUntil <= startsAt || changesUntil > endsAt) throw new Error("Termín pro změny zápisu musí být po začátku a nejpozději na konci zápisu.");
  }
  return {
    startsAt,
    endsAt,
    changesUntil,
    allowSelfUnenroll: data.allowSelfUnenroll ?? true,
    resultsVisibility: data.resultsVisibility === "NAMES" ? ("NAMES" as const) : ("COUNTS" as const),
  };
}

/** Čitelný popis publika okna (z uložených položek) pro historii změn. */
async function describeWindowAudience(db: TxClient, windowId: string): Promise<{ summary: string; draft: AudienceDraft }> {
  const entries = await loadAudienceEntries(windowId, db);
  const draft = draftFromEntries(entries);
  const classes = draft.classIds.length ? await db.classGroup.findMany({ where: { id: { in: draft.classIds } } }) : [];
  return { summary: audienceSummary(draft, classes.sort(compareClasses).map(classLabel)), draft };
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


type BlockInput = { id: string; name: string; description?: string | null } & Partial<BlockRules>;

export async function updateBlock(block: BlockInput) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const res = await prisma.$transaction(async (tx) => {
      const before = await tx.block.findUnique({ where: { id: block.id }, include: { enrollmentWindow: { select: { name: true } } } });
      if (!before) throw new Error("Blok nenalezen.");
      const rules = cleanBlockRules({
        required: block.required ?? before.required,
        minEnrollments: block.minEnrollments ?? before.minEnrollments,
        maxEnrollments: block.maxEnrollments ?? before.maxEnrollments,
      });
      // snížení maxima pod počet zápisů, které studenti už mají, by zanechalo nekonzistentní data
      const perStudent = await tx.studentEnrollment.groupBy({
        by: ["studentId"],
        where: { deletedAt: null, subjectOccurrence: { blockId: block.id, deletedAt: null } },
        _count: { _all: true },
      });
      const over = perStudent.filter((g) => g._count._all > rules.maxEnrollments).length;
      if (over > 0) throw new Error(`Nejvyšší počet zápisů nelze snížit na ${rules.maxEnrollments}: ${over} studentů už má v bloku víc zápisů. Nejdřív je odepište.`);

      const updated = await tx.block.update({
        where: { id: block.id },
        data: { name: block.name, description: block.description || null, ...rules },
      });
      const show = (b: { name: string; description: string | null } & BlockRules) => ({ name: b.name, description: b.description, rules: blockRulesLabel(b) });
      const changes = describeChanges(show(before), show(updated), { name: "název", description: "popis", rules: "pravidla" });
      await audit(tx, admin, {
        action: "seminars.block.update",
        entityType: "block",
        entityId: block.id,
        summary: `Upraven blok „${before.name}“ v zápisu „${before.enrollmentWindow.name}“${changes ? `: ${changes}` : ""}`,
        data: { before: show(before), after: show(updated) },
      });
      return updated;
    });
    revalidatePath("/", "layout");
    return res;
  });
}



export async function createBlock(enrollmentWindowId: string, name: string, description?: string | null, ruleInput?: Partial<BlockRules>) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const rules = cleanBlockRules(ruleInput);
  
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
          ...rules,
        }
      });
      const ew = await tx.enrollmentWindow.findUnique({ where: { id: enrollmentWindowId }, select: { name: true } });
      await audit(tx, admin, {
        action: "seminars.block.create",
        entityType: "block",
        entityId: created.id,
        summary: `Přidán blok „${name}“ (${blockRulesLabel(rules)}) do zápisu „${ew?.name ?? ""}“`,
        data: { name, windowId: enrollmentWindowId, ...rules },
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
    const rules = cleanWindowRules(data);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.enrollmentWindow.create({
        data: {
          name: data.name,
          description: data.description || null,
          published: data.published,
          reminderDaysBefore,
          createdById: admin.id,
          ...rules,
        },
      });
      await replaceAudience(tx, row.id, data.audience ?? EMPTY_AUDIENCE);
      const aud = await describeWindowAudience(tx, row.id);
      const d = windowDisplay(row, aud.summary);
      await audit(tx, admin, {
        action: "seminars.window.create",
        entityType: "enrollmentWindow",
        entityId: row.id,
        summary: `Vytvořeno zápisové okno „${row.name}“ (${d.published}, ${d.startsAt} – ${d.endsAt}, ${d.audience})`,
        data: { after: d, audience: aud.draft },
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
    const rules = cleanWindowRules(data);
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.enrollmentWindow.findUnique({ where: { id: windowId } });
      if (!before) throw new Error("Zápisové okno nenalezeno.");
      const beforeAud = await describeWindowAudience(tx, windowId);
      const row = await tx.enrollmentWindow.update({
        where: { id: windowId },
        data: {
          name: data.name,
          description: data.description || null,
          published: data.published,
          reminderDaysBefore,
          ...rules,
          // Změna konce nebo nastavení připomínky = připomínka se může poslat znovu
          ...(rules.endsAt.getTime() !== before.endsAt.getTime() || reminderDaysBefore !== before.reminderDaysBefore ? { reminderSentOn: null } : {}),
          updatedById: admin.id,
        },
      });
      // Publikum se mění jen tehdy, když ho formulář poslal (jiní volající ho nechávají beze změny)
      if (data.audience) await replaceAudience(tx, windowId, data.audience);
      const afterAud = await describeWindowAudience(tx, windowId);
      const b = windowDisplay(before, beforeAud.summary);
      const a = windowDisplay(row, afterAud.summary);
      const changes = describeChanges(b, a, WINDOW_LABELS);
      await audit(tx, admin, {
        action: "seminars.window.update",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Upraveno zápisové okno „${before.name}“${changes ? `: ${changes}` : " (beze změny)"}`,
        data: { before: b, after: a, audienceBefore: beforeAud.draft, audienceAfter: afterAud.draft },
      });
      return row;
    });
    await notifyWindowOpenedIfOpen(updated);
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(updated));
  });
}


/** Zveřejní okno studentům, nebo ho vrátí do konceptu (zápisy studentů zůstávají). */
export async function setEnrollmentWindowPublished(windowId: string, published: boolean) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.enrollmentWindow.findUnique({ where: { id: windowId } });
      if (!before) throw new Error("Zápisové okno nenalezeno.");
      if (before.published === published) return before;
      const row = await tx.enrollmentWindow.update({ where: { id: windowId }, data: { published, updatedById: admin.id } });
      await audit(tx, admin, {
        action: published ? "seminars.window.publish" : "seminars.window.unpublish",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Zápisové okno „${before.name}“ ${published ? "zveřejněno studentům" : "vráceno do konceptu"}`,
        data: { published },
      });
      return row;
    });
    await notifyWindowOpenedIfOpen(row);
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(row));
  });
}

/**
 * Předčasně uzavře otevřené okno (studenti se přestanou moct zapisovat a odepisovat; správci zapisují dál).
 * Jen zveřejněné a právě otevřené okno; okno jde znovu otevřít, dokud neuplyne jeho konec.
 */
export async function closeEnrollmentWindowEarly(windowId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.enrollmentWindow.findUnique({ where: { id: windowId } });
      if (!before) throw new Error("Zápisové okno nenalezeno.");
      if (!windowPhase(before).canCloseEarly) throw new Error("Předčasně uzavřít lze jen právě otevřené okno.");
      const row = await tx.enrollmentWindow.update({ where: { id: windowId }, data: { closedEarlyAt: new Date(), updatedById: admin.id } });
      await audit(tx, admin, {
        action: "seminars.window.close",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Zápisové okno „${before.name}“ předčasně uzavřeno (podle plánu končilo ${formatDateTime(before.endsAt)})`,
        data: { endsAt: formatDateTime(before.endsAt) },
      });
      return row;
    });
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(row));
  });
}

/** Znovu otevře předčasně uzavřené okno, pokud ještě neuplynul jeho konec. */
export async function reopenEnrollmentWindow(windowId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.enrollmentWindow.findUnique({ where: { id: windowId } });
      if (!before) throw new Error("Zápisové okno nenalezeno.");
      if (!windowPhase(before).canReopen) throw new Error("Znovu otevřít lze jen předčasně uzavřené okno, jehož konec ještě neuplynul. Jinak upravte konec zápisu.");
      const row = await tx.enrollmentWindow.update({ where: { id: windowId }, data: { closedEarlyAt: null, updatedById: admin.id } });
      await audit(tx, admin, {
        action: "seminars.window.reopen",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Zápisové okno „${before.name}“ znovu otevřeno (končí ${formatDateTime(before.endsAt)})`,
        data: { endsAt: formatDateTime(before.endsAt) },
      });
      return row;
    });
    await notifyWindowOpenedIfOpen(row);
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(row));
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
      const aud = await describeWindowAudience(tx, windowId);
      const enrollments = await tx.studentEnrollment.count({ where: { deletedAt: null, subjectOccurrence: { block: { enrollmentWindowId: windowId } } } });
      const deleted = await tx.enrollmentWindow.delete({ where: { id: windowId } });
      await audit(tx, admin, {
        action: "seminars.window.delete",
        entityType: "enrollmentWindow",
        entityId: windowId,
        summary: `Smazáno zápisové okno „${before.name}“ (včetně ${enrollments} zápisů studentů)`,
        data: { before: windowDisplay(before, aud.summary), enrollments },
      });
      return deleted;
    });
    revalidatePath("/", "layout");
    return res;
  });
}

/**
 * Duplikuje okno: zkopíruje bloky (s pravidly), výskyty (s omezením na ročníky / třídy), publikum a pravidla okna.
 * Nové okno je KONCEPT, neviditelné studentům, bez zápisů a bez odeslaných upozornění.
 */
export async function duplicateEnrollmentWindow(windowId: string) {
  return safeAction(async () => {
    const admin = await requirePermission("seminars.windows.manage");
    const created = await prisma.$transaction(async (tx) => {
      const src = await tx.enrollmentWindow.findUnique({
        where: { id: windowId },
        include: {
          audience: true,
          blocks: {
            where: { deletedAt: null },
            orderBy: { order: "asc" },
            include: { subjectOccurrences: { where: { deletedAt: null }, include: { restrictClasses: { select: { id: true } } } } },
          },
        },
      });
      if (!src) throw new Error("Zápisové okno nenalezeno.");
      const copy = await tx.enrollmentWindow.create({
        data: {
          name: `${src.name} (kopie)`.slice(0, 200),
          description: src.description,
          published: false,
          startsAt: src.startsAt,
          endsAt: src.endsAt,
          reminderDaysBefore: src.reminderDaysBefore,
          allowSelfUnenroll: src.allowSelfUnenroll,
          changesUntil: src.changesUntil,
          resultsVisibility: src.resultsVisibility,
          createdById: admin.id,
        },
      });
      if (src.audience.length) {
        await tx.enrollmentWindowAudience.createMany({
          data: src.audience.map((a) => ({ windowId: copy.id, type: a.type, grade: a.grade, classGroupId: a.classGroupId, userId: a.userId, key: a.key })),
        });
      }
      let occurrences = 0;
      for (const b of src.blocks) {
        const block = await tx.block.create({
          data: {
            name: b.name,
            order: b.order,
            description: b.description,
            required: b.required,
            minEnrollments: b.minEnrollments,
            maxEnrollments: b.maxEnrollments,
            enrollmentWindowId: copy.id,
            createdById: admin.id,
          },
        });
        for (const o of b.subjectOccurrences) {
          await tx.subjectOccurrence.create({
            data: {
              subjectId: o.subjectId,
              blockId: block.id,
              teacherId: o.teacherId,
              subCode: o.subCode,
              capacity: o.capacity,
              restrictGrades: o.restrictGrades,
              restrictClasses: { connect: o.restrictClasses.map((c) => ({ id: c.id })) },
              createdById: admin.id,
            },
          });
          occurrences++;
        }
      }
      await audit(tx, admin, {
        action: "seminars.window.duplicate",
        entityType: "enrollmentWindow",
        entityId: copy.id,
        summary: `Zápisové okno „${src.name}“ zduplikováno jako „${copy.name}“ (koncept; ${src.blocks.length} bloků, ${occurrences} předmětů, bez zápisů studentů)`,
        data: { sourceId: src.id, blocks: src.blocks.length, occurrences },
      });
      return copy;
    });
    revalidatePath("/", "layout");
    return JSON.parse(JSON.stringify(created));
  });
}

// === PUBLIKUM OKNA: náhled a nabídka pro formulář ===

/** Třídy pro výběr publika a omezení výskytů. */
export async function getAudienceOptions() {
  await requirePermission("seminars.windows.manage");
  const classes = await prisma.classGroup.findMany();
  return classes.sort(compareClasses).map((c) => ({ id: c.id, grade: c.grade, label: classLabel(c) }));
}

/** Hledání studentů (jméno nebo e-mail) pro přidání do publika / mezi vynechané. */
export async function searchAudienceStudents(query: string) {
  await requirePermission("seminars.windows.manage");
  const q = (query ?? "").trim().slice(0, 100);
  if (q.length < 2) return [];
  const users = await prisma.user.findMany({
    where: {
      ...activeStudentsWhere,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { classGroup: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 12,
  });
  return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, classLabel: u.classGroup ? classLabel(u.classGroup) : null }));
}

const AUDIENCE_PREVIEW_LIMIT = 300;

/** Kolik studentů odpovídá publiku (a kdo), ještě před uložením okna. */
export async function previewAudience(draft: AudienceDraft) {
  await requirePermission("seminars.windows.manage");
  const where = audienceWhere(entriesFromDraft({ grades: sanitizeGrades(draft?.grades), classIds: draft?.classIds ?? [], userIds: draft?.userIds ?? [], excludeUserIds: draft?.excludeUserIds ?? [] }));
  const [count, students] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: { classGroup: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: AUDIENCE_PREVIEW_LIMIT }),
  ]);
  return {
    count,
    truncated: count > students.length,
    students: students.map((u) => ({ id: u.id, name: `${u.lastName} ${u.firstName}`.trim(), classLabel: u.classGroup ? classLabel(u.classGroup) : null })),
  };
}


// === VÝSKYTY PŘEDMĚTŮ (SubjectOccurrence) ===
type OccurrenceInput = {
  subjectId: string;
  teacherId?: string;
  subCode?: string;
  capacity?: string | number;
  // Omezení výskytu na ročníky a třídy (sjednocení); obojí prázdné = bez omezení
  restrictGrades?: number[];
  restrictClassIds?: string[];
};

const parseCapacity = (c: OccurrenceInput["capacity"]) => (c ? (typeof c === "string" ? parseInt(c, 10) : c) : null);

/** Ověří omezení výskytu a vrátí ho v podobě pro Prisma. */
async function cleanRestriction(tx: TxClient, data: OccurrenceInput) {
  const grades = sanitizeGrades(data.restrictGrades);
  const classIds = [...new Set((data.restrictClassIds ?? []).filter((x) => typeof x === "string" && x))];
  const classes = classIds.length ? await tx.classGroup.findMany({ where: { id: { in: classIds } } }) : [];
  if (classes.length !== classIds.length) throw new Error("Některá z vybraných tříd neexistuje.");
  const label = [grades.length ? `${grades.map((g) => `${g}.`).join(", ")} ročník` : "", classes.length ? `třídy ${classes.sort(compareClasses).map(classLabel).join(", ")}` : ""].filter(Boolean).join(" + ");
  return { grades, classIds, label: label || "bez omezení" };
}

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
      const restriction = await cleanRestriction(tx, data);
      const row = await tx.subjectOccurrence.create({
        data: {
          subjectId: data.subjectId,
          blockId: data.blockId,
          teacherId: data.teacherId || null,
          subCode: data.subCode || null,
          capacity: parseCapacity(data.capacity),
          restrictGrades: restriction.grades,
          restrictClasses: { connect: restriction.classIds.map((id) => ({ id })) },
          createdById: admin.id,
        },
      });
      const l = await occurrenceLabel(tx, row.subjectId, row.blockId, row.teacherId);
      await audit(tx, admin, {
        action: "seminars.occurrence.create",
        entityType: "subjectOccurrence",
        entityId: row.id,
        summary: `Do zápisu přidán předmět ${l.text}${l.teacher ? `, vyučující ${l.teacher}` : ""}, kapacita ${row.capacity ?? "neomezená"}, pro: ${restriction.label}`,
        data: { subjectId: row.subjectId, blockId: row.blockId, teacherId: row.teacherId, subCode: row.subCode, capacity: row.capacity, restrictGrades: restriction.grades, restrictClassIds: restriction.classIds },
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
      const before = await tx.subjectOccurrence.findUnique({ where: { id: occurrenceId }, include: { restrictClasses: { select: { id: true, grade: true, letter: true } } } });
      if (!before) throw new Error("Předmět v zápisu nenalezen.");
      const restriction = await cleanRestriction(tx, data);
      const beforeRestriction = [
        before.restrictGrades.length ? `${before.restrictGrades.map((g) => `${g}.`).join(", ")} ročník` : "",
        before.restrictClasses.length ? `třídy ${[...before.restrictClasses].sort(compareClasses).map(classLabel).join(", ")}` : "",
      ].filter(Boolean).join(" + ") || "bez omezení";
      const row = await tx.subjectOccurrence.update({
        where: { id: occurrenceId },
        data: {
          subjectId: data.subjectId,
          teacherId: data.teacherId || null,
          subCode: data.subCode || null,
          capacity: parseCapacity(data.capacity),
          restrictGrades: restriction.grades,
          restrictClasses: { set: restriction.classIds.map((id) => ({ id })) },
          updatedById: admin.id,
        },
      });
      const l = await occurrenceLabel(tx, row.subjectId, row.blockId, row.teacherId);
      const lb = await occurrenceLabel(tx, before.subjectId, before.blockId, before.teacherId);
      const changes = describeChanges(
        { subject: lb.text, teacher: lb.teacher, subCode: before.subCode, capacity: before.capacity ?? "neomezená", restriction: beforeRestriction },
        { subject: l.text, teacher: l.teacher, subCode: row.subCode, capacity: row.capacity ?? "neomezená", restriction: restriction.label },
        { subject: "předmět", teacher: "vyučující", subCode: "kód", capacity: "kapacita", restriction: "určeno pro" }
      );
      await audit(tx, admin, {
        action: "seminars.occurrence.update",
        entityType: "subjectOccurrence",
        entityId: occurrenceId,
        summary: `Upraven předmět ${lb.text}${changes ? `: ${changes}` : ""}`,
        data: {
          before: { subjectId: before.subjectId, teacherId: before.teacherId, subCode: before.subCode, capacity: before.capacity, restrictGrades: before.restrictGrades, restrictClassIds: before.restrictClasses.map((c) => c.id) },
          after: { subjectId: row.subjectId, teacherId: row.teacherId, subCode: row.subCode, capacity: row.capacity, restrictGrades: restriction.grades, restrictClassIds: restriction.classIds },
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
