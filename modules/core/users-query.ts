import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classLabel, parseClassLabel, studyStatusLabel } from "@/lib/school";
import type { UserFilter, UserListQuery } from "@/modules/core/users-filter";

// Dotazy nad seznamem uživatelů (server). Filtr z URL se převádí na `where` jedním místem,
// aby seznam, export i hromadné akce („vybrat vše odpovídající filtru“) vždy vybraly totéž.

export const USERS_PAGE_SIZE = 50;

export function userFilterWhere(filter: UserFilter): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (filter.q) {
    // každé slovo musí sedět v jménu, příjmení nebo e-mailu („Jan Novák“, „novak jan“)
    for (const word of filter.q.split(/\s+/).filter(Boolean)) {
      and.push({
        OR: [
          { firstName: { contains: word, mode: "insensitive" } },
          { lastName: { contains: word, mode: "insensitive" } },
          { email: { contains: word, mode: "insensitive" } },
        ],
      });
    }
  }
  if (filter.role) and.push({ role: filter.role });
  if (filter.class) {
    const parsed = parseClassLabel(filter.class);
    // neexistující třída nesmí vrátit „všechny“
    and.push(parsed ? { classGroup: { grade: parsed.grade, letter: parsed.letter } } : { id: "__none__" });
  }
  if (filter.grade) and.push({ classGroup: { grade: filter.grade } });
  if (filter.study) and.push({ role: "STUDENT", studyStatus: filter.study });
  if (filter.active !== undefined) and.push({ isActive: filter.active });
  if (filter.pending) and.push({ role: "GUEST", isActive: true });
  if (filter.noClass) and.push({ role: "STUDENT", isActive: true, studyStatus: "ACTIVE", classGroupId: null });
  return and.length ? { AND: and } : {};
}

function orderBy(q: UserListQuery): Prisma.UserOrderByWithRelationInput[] {
  const dir = q.dir ?? (q.sort === "created" || q.sort === "login" ? "desc" : "asc");
  switch (q.sort) {
    case "email":
      return [{ email: dir }];
    case "created":
      return [{ createdAt: dir }, { id: "asc" }];
    case "login":
      return [{ lastLoginAt: { sort: dir, nulls: "last" } }, { id: "asc" }];
    default:
      return [{ lastName: dir }, { firstName: dir }, { id: "asc" }];
  }
}

export type UserListRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "GUEST" | "STUDENT" | "TEACHER" | "ADMIN";
  isActive: boolean;
  classGroupId: string | null;
  classLabel: string | null;
  // třída, kterou si host přál při registraci
  requestedClassGroupId: string | null;
  // „absolvent“, „ukončil (přestup)“; u studujících a nestudentů null
  studyLabel: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  // úvazky učitele v aktuálním školním roce
  assignmentCount: number;
};

/** Jedna stránka seznamu uživatelů a celkový počet odpovídající filtru. */
export async function queryUsers(query: UserListQuery): Promise<{ rows: UserListRow[]; total: number; page: number; pages: number }> {
  const where = userFilterWhere(query);
  const total = await prisma.user.count({ where });
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  // stránka za koncem (např. po zúžení filtru) se přesune na poslední
  const page = Math.min(Math.max(0, (query.page ?? 1) - 1), pages - 1);
  const users = await prisma.user.findMany({
    where,
    orderBy: orderBy(query),
    skip: page * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
    include: rowInclude,
  });
  return { total, pages, page: page + 1, rows: users.map(toRow) };
}

const rowInclude = {
  classGroup: true,
  _count: { select: { teachingAssignments: { where: { schoolYear: { isCurrent: true } } } } },
} satisfies Prisma.UserInclude;

type RowUser = Prisma.UserGetPayload<{ include: typeof rowInclude }>;

function toRow(u: RowUser): UserListRow {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    classGroupId: u.classGroupId,
    classLabel: u.classGroup ? classLabel(u.classGroup) : null,
    requestedClassGroupId: u.requestedClassGroupId,
    studyLabel: u.role === "STUDENT" ? studyStatusLabel(u.studyStatus, u.studyEndReason) : null,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    assignmentCount: u._count.teachingAssignments,
  };
}

/** Hosté čekající na schválení (záložka Ke schválení), nejstarší první. */
export async function getPendingApprovals(): Promise<UserListRow[]> {
  const users = await prisma.user.findMany({ where: userFilterWhere({ pending: true }), orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500, include: rowInclude });
  return users.map(toRow);
}

/** Počty pro přehledové dlaždice nad seznamem. */
export async function getUserCounts() {
  const [studying, noClass, pending, total] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT", isActive: true, studyStatus: "ACTIVE" } }),
    prisma.user.count({ where: userFilterWhere({ noClass: true }) }),
    prisma.user.count({ where: userFilterWhere({ pending: true }) }),
    prisma.user.count(),
  ]);
  return { studying, noClass, pending, total };
}
