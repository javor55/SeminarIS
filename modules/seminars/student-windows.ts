import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { getViewerContext, occurrencesForViewerWhere, windowsForViewerWhere } from "@/modules/seminars/eligibility";
import { missingBlocksFor, type MissingBlock } from "@/modules/seminars/unenrolled";
import { notifyWindowOpenedIfOpen } from "@/modules/seminars/notifications";
import { windowPhase } from "@/modules/seminars/window-phase";

// Pohled studenta (a hosta) na zápisová okna: stránka Zápisy a karty dashboardu. JEDINÉ místo, které vybírá
// okna pro studenta: jen okna zveřejněná studentům, ne koncept a určená právě jemu (publikum), výskyty
// zúžené na jeho ročník / třídu. Učitel a admin tudy okna nevidí (mají `/enrollments`).

export type StudentWindowStatus = "SCHEDULED" | "OPEN" | "CLOSED";

export type StudentWindow = {
  id: string;
  name: string;
  description: string | null;
  status: StudentWindowStatus;
  // Správce zápis uzavřel před koncem
  closedEarly: boolean;
  startsAt: Date;
  endsAt: Date;
  // Povinné bloky, kde studentovi ještě něco chybí (u hosta a absolventa prázdné)
  missingBlocks: MissingBlock[];
  // Počet povinných bloků, do kterých se student může zapsat
  requiredBlockCount: number;
  // Moje zápisy v okně
  enrollments: { id: string; subjectId: string; subjectName: string; blockName: string }[];
};

const STATUS_RANK: Record<StudentWindowStatus, number> = { OPEN: 0, SCHEDULED: 1, CLOSED: 2 };

/**
 * Okna, která smí uživatel vidět na stránce Zápisy, seřazená: otevřená (podle konce), naplánovaná (podle začátku),
 * uzavřená (nejnovější první). Pro učitele a admina vrací prázdný seznam. Tři dotazy bez ohledu na počet oken
 * (okna + bloky + výskyty + moje zápisy jsou jeden `findMany`).
 */
export async function listStudentWindows(user: User): Promise<StudentWindow[]> {
  const ctx = await getViewerContext(user);
  if (!ctx) return [];
  const occWhere = occurrencesForViewerWhere(ctx);
  const windows = await prisma.enrollmentWindow.findMany({
    where: windowsForViewerWhere(ctx),
    include: {
      blocks: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: {
          subjectOccurrences: {
            where: { deletedAt: null, ...occWhere },
            select: {
              id: true,
              restrictGrades: true,
              restrictClasses: { select: { id: true } },
              subject: { select: { id: true, name: true } },
              studentEnrollments: { where: { studentId: user.id, deletedAt: null }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  // Okno se mohlo od posledního čtení otevřít: doběhne upozornění „zápis otevřen“ (jednou za okno)
  await Promise.all(windows.map((w) => notifyWindowOpenedIfOpen(w)));

  const rows = windows.map((w): StudentWindow => {
    const info = windowPhase(w);
    const status: StudentWindowStatus = info.phase === "OPEN" ? "OPEN" : info.phase === "PLANNED" ? "SCHEDULED" : "CLOSED";
    const enrolledByBlock = new Map<string, number>();
    const enrollments: StudentWindow["enrollments"] = [];
    for (const b of w.blocks) {
      for (const o of b.subjectOccurrences) {
        for (const e of o.studentEnrollments) {
          enrolledByBlock.set(b.id, (enrolledByBlock.get(b.id) ?? 0) + 1);
          enrollments.push({ id: e.id, subjectId: o.subject.id, subjectName: o.subject.name, blockName: b.name });
        }
      }
    }
    const required = w.blocks.filter((b) => b.required && b.subjectOccurrences.length > 0);
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      status,
      closedEarly: info.closedEarly,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      // Host a student mimo studium se do zápisu nezapisují, nic jim "nechybí"
      missingBlocks: ctx.student ? missingBlocksFor(w.blocks, enrolledByBlock, ctx.student) : [],
      requiredBlockCount: required.length,
      enrollments,
    };
  });

  return rows.sort((a, b) => {
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (a.status === "OPEN") return a.endsAt.getTime() - b.endsAt.getTime();
    if (a.status === "SCHEDULED") return a.startsAt.getTime() - b.startsAt.getTime();
    return b.endsAt.getTime() - a.endsAt.getTime();
  });
}
