import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { classLabel, compareClasses, sanitizeGrades } from "@/lib/school";
import { formatName, sortByName } from "@/lib/names";
import { activeStudentsWhere } from "@/modules/core/school";
import { entriesFromDraft, hasIncludes, type AudienceDraft, type AudienceEntry } from "@/modules/core/audience";

// Sdílené dotazy nad publikem (zápisová okna i události): podmínka na uživatele, nabídka tříd,
// hledání studentů, náhled a ověření výběru. Oprávnění kontrolují volající akce.

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

/** Třídy pro výběr publika. */
export async function listClassOptions() {
  const classes = await prisma.classGroup.findMany();
  return classes.sort(compareClasses).map((c) => ({ id: c.id, grade: c.grade, label: classLabel(c) }));
}

/** Hledání studentů (jméno nebo e-mail) pro přidání do publika / mezi vynechané. */
export async function searchAudienceStudentsBy(query: string) {
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
    take: 12,
  });
  return sortByName(users).map((u) => ({ id: u.id, name: formatName(u, "list"), email: u.email, classLabel: u.classGroup ? classLabel(u.classGroup) : null }));
}

const AUDIENCE_PREVIEW_LIMIT = 300;

/** Kolik studentů odpovídá publiku (a kdo), ještě před uložením. */
export async function previewAudienceDraft(draft: AudienceDraft) {
  const where = audienceWhere(
    entriesFromDraft({ grades: sanitizeGrades(draft?.grades), classIds: draft?.classIds ?? [], userIds: draft?.userIds ?? [], excludeUserIds: draft?.excludeUserIds ?? [] })
  );
  // Řadí se v JS (česká kolace), proto se načte celé publikum a zkrátí až po seřazení
  const all = sortByName(await prisma.user.findMany({ where, include: { classGroup: true } }));
  const count = all.length;
  const students = all.slice(0, AUDIENCE_PREVIEW_LIMIT);
  return {
    count,
    truncated: count > students.length,
    students: students.map((u) => ({ id: u.id, name: formatName(u, "list"), classLabel: u.classGroup ? classLabel(u.classGroup) : null })),
  };
}

/**
 * Ověří a vyčistí výběr publika: třídy existují, studenti jsou studenti; student uvedený
 * mezi vynechanými se z kladných položek vyřadí (výjimka vyhrává).
 */
export async function cleanAudienceDraft(db: TxClient, draft: AudienceDraft): Promise<AudienceDraft> {
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
  return { grades, classIds, userIds, excludeUserIds };
}
