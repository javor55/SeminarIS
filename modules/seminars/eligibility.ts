import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { sanitizeGrades } from "@/lib/school";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import { activeStudentsWhere } from "@/modules/core/school";
import {
  audienceKey,
  hasIncludes,
  isInAudience,
  type AudienceDraft,
  type AudienceEntry,
  type AudienceStudent,
} from "@/modules/seminars/audience";

// JEDINÉ místo, které rozhoduje, komu je zápisové okno určeno a které výskyty komu patří.
// Používá se pro viditelnost oken (dashboard, seznam, detail, štítky předmětů), kontrolu při zápisu,
// seznam nezapsaných, exporty, e-mailové odhady / připomínky / „zápis otevřen“ a hromadnou akci
// „Přidat do publika zápisu“. Čistá logika (bez DB) je v `audience.ts`.
//
// Publikum okna = (ročníky ∪ třídy ∪ konkrétní studenti) \ vynechaní studenti.
// Bez kladných položek = všichni aktivní studenti.

export { isInAudience } from "@/modules/seminars/audience";


type Db = TxClient;

// === Publikum okna ===

export async function loadAudienceEntries(windowId: string, db: Db = prisma): Promise<AudienceEntry[]> {
  const rows = await db.enrollmentWindowAudience.findMany({
    where: { windowId },
    select: { type: true, grade: true, classGroupId: true, userId: true },
  });
  return rows;
}

/** Prisma podmínka na User: aktivní studenti, kteří jsou v publiku s danými položkami. Odpovídá `isInAudience`. */
export function audienceWhere(entries: readonly AudienceEntry[]): Prisma.UserWhereInput {
  const excluded = entries.filter((e) => e.type === "EXCLUDE_USER" && e.userId).map((e) => e.userId as string);
  const grades = entries.filter((e) => e.type === "GRADE" && e.grade != null).map((e) => e.grade as number);
  const classIds = entries.filter((e) => e.type === "CLASS" && e.classGroupId).map((e) => e.classGroupId as string);
  const userIds = entries.filter((e) => e.type === "USER" && e.userId).map((e) => e.userId as string);

  const includes: Prisma.UserWhereInput[] = [];
  if (grades.length) includes.push({ classGroup: { grade: { in: grades } } });
  if (classIds.length) includes.push({ classGroupId: { in: classIds } });
  if (userIds.length) includes.push({ id: { in: userIds } });

  return {
    ...activeStudentsWhere,
    ...(excluded.length ? { id: { notIn: excluded } } : {}),
    // (kladné položky uživatelů a vynechaní se kombinují přes AND, aby `id` nepřepsalo jedno druhé)
    ...(hasIncludes(entries) ? { AND: [{ OR: includes }] } : {}),
  };
}

/** Aktivní studenti, pro které je okno určeno. */
export async function audienceWhereForWindow(windowId: string, db: Db = prisma): Promise<Prisma.UserWhereInput> {
  return audienceWhere(await loadAudienceEntries(windowId, db));
}

/** Student z pohledu publika; `null`, pokud to není aktivní student (host, učitel, absolvent, neaktivní). */
export async function getStudentAudienceInfo(userId: string, db: Db = prisma): Promise<AudienceStudent | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, studyStatus: true, classGroupId: true, classGroup: { select: { grade: true } } },
  });
  if (!u || u.role !== "STUDENT" || !u.isActive || u.studyStatus !== "ACTIVE") return null;
  return { id: u.id, classGroupId: u.classGroupId, grade: u.classGroup?.grade ?? null };
}

/** Je student (aktivní) v publiku okna? */
export async function isStudentInWindowAudience(windowId: string, studentId: string, db: Db = prisma): Promise<boolean> {
  const [entries, student] = await Promise.all([loadAudienceEntries(windowId, db), getStudentAudienceInfo(studentId, db)]);
  return !!student && isInAudience(entries, student);
}

// === Pohled uživatele na okna a výskyty ===

export type ViewerContext = { id: string; student: AudienceStudent | null };

/**
 * Kontext pro filtrování oken a výskytů podle toho, kdo se dívá.
 * `undefined` = nefiltrovat (učitelé a admini vidí vše). Host nebo student mimo studium má `student: null`
 * a vidí jen okna bez omezení publika.
 */
export async function getViewerContext(user: User): Promise<ViewerContext | undefined> {
  if (can(user.role, "seminars.windows.view")) return undefined;
  return { id: user.id, student: await getStudentAudienceInfo(user.id) };
}

const INCLUDE_TYPES = ["GRADE", "CLASS", "USER"] as const;

/**
 * Prisma podmínka na EnrollmentWindow: zveřejněná okna (ne koncepty), jejichž publikum zahrnuje daného diváka.
 * Každé čtení oken pro studenta a hosta prochází tudy.
 */
export function windowsForViewerWhere(ctx: ViewerContext): Prisma.EnrollmentWindowWhereInput {
  return { published: true, ...audienceForViewerWhere(ctx) };
}

function audienceForViewerWhere(ctx: ViewerContext): Prisma.EnrollmentWindowWhereInput {
  const open: Prisma.EnrollmentWindowWhereInput = { audience: { none: { type: { in: [...INCLUDE_TYPES] } } } };
  if (!ctx.student) return open;
  const matches: Prisma.EnrollmentWindowAudienceWhereInput[] = [{ type: "USER", userId: ctx.student.id }];
  if (ctx.student.grade != null) matches.push({ type: "GRADE", grade: ctx.student.grade });
  if (ctx.student.classGroupId) matches.push({ type: "CLASS", classGroupId: ctx.student.classGroupId });
  return {
    AND: [{ audience: { none: { type: "EXCLUDE_USER", userId: ctx.student.id } } }, { OR: [open, { audience: { some: { OR: matches } } }] }],
  };
}

/** Prisma podmínka na SubjectOccurrence: výskyty, které smí daný divák vidět a zapsat (omezení na ročníky / třídy). */
export function occurrencesForViewerWhere(ctx: ViewerContext): Prisma.SubjectOccurrenceWhereInput {
  const unrestricted: Prisma.SubjectOccurrenceWhereInput = { restrictGrades: { isEmpty: true }, restrictClasses: { none: {} } };
  const matches: Prisma.SubjectOccurrenceWhereInput[] = [unrestricted];
  if (ctx.student?.grade != null) matches.push({ restrictGrades: { has: ctx.student.grade } });
  if (ctx.student?.classGroupId) matches.push({ restrictClasses: { some: { id: ctx.student.classGroupId } } });
  return { OR: matches };
}

// === Zápis publika (pro okno a hromadné akce) ===

/**
 * Nahradí publikum okna. Ověří, že třídy existují a studenti jsou studenti; student uvedený
 * mezi vynechanými se z kladných položek vyřadí (výjimka vyhrává).
 */
export async function replaceAudience(db: Db, windowId: string, draft: AudienceDraft): Promise<AudienceDraft> {
  const grades = sanitizeGrades(draft.grades);
  const unique = (xs: unknown): string[] => [...new Set(Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string" && x.length > 0) : [])];
  const classIds = unique(draft.classIds);
  const excludeUserIds = unique(draft.excludeUserIds);
  const userIds = unique(draft.userIds).filter((id) => !excludeUserIds.includes(id));

  if (classIds.length && (await db.classGroup.count({ where: { id: { in: classIds } } })) !== classIds.length) throw new Error("Některá z vybraných tříd neexistuje.");
  const allUsers = [...userIds, ...excludeUserIds];
  if (allUsers.length && (await db.user.count({ where: { id: { in: allUsers }, role: "STUDENT" } })) !== allUsers.length) {
    throw new Error("Publikum může obsahovat jen studenty.");
  }

  const clean: AudienceDraft = { grades, classIds, userIds, excludeUserIds };
  const entries: AudienceEntry[] = [
    ...grades.map((grade) => ({ type: "GRADE" as const, grade })),
    ...classIds.map((classGroupId) => ({ type: "CLASS" as const, classGroupId })),
    ...userIds.map((userId) => ({ type: "USER" as const, userId })),
    ...excludeUserIds.map((userId) => ({ type: "EXCLUDE_USER" as const, userId })),
  ];
  await db.enrollmentWindowAudience.deleteMany({ where: { windowId } });
  if (entries.length) {
    await db.enrollmentWindowAudience.createMany({
      data: entries.map((e) => ({ windowId, type: e.type, grade: e.grade ?? null, classGroupId: e.classGroupId ?? null, userId: e.userId ?? null, key: audienceKey(e) })),
    });
  }
  return clean;
}

/** Je okno určeno (publikem) danému divákovi? Pro učitele a adminy (`ctx` undefined) vždy. */
export async function isWindowVisibleTo(ctx: ViewerContext | undefined, windowId: string, db: Db = prisma): Promise<boolean> {
  if (!ctx) return true;
  return (await db.enrollmentWindow.count({ where: { id: windowId, ...windowsForViewerWhere(ctx) } })) > 0;
}
