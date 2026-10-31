import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { classLabel } from "@/lib/school";
import { getEnabledModuleIds } from "@/lib/modules";
import type { User } from "@/lib/types";
import { MODULE_SERVERS } from "@/modules/server-registry";
import type { DemoClearContext, DemoSeedContext } from "@/modules/server-types";
import { DEMO_PASSWORD, DEMO_SHOWCASE_TEACHER_ID } from "@/modules/core/demo/constants";
import { createDemoRandom } from "@/modules/core/demo/random";
import { seedCoreDemo } from "@/modules/core/demo/seed-core";

// Ukázková data pro prezentaci (F9). Jediné místo, které je vytváří a maže. Všechno, co vytvoří,
// se ve stejné transakci zapíše do evidence `DemoRecord`; mazání jde jen podle evidence.
// Moduly přispívají přes `ModuleServer.demoData` (jádro je volá, o konkrétních modulech neví).

/** Transakce s ukázkovými daty smí trvat déle než výchozích 5 s (Vercel dovolí funkci 60 s). */
export const DEMO_TX_OPTIONS = { timeout: 50_000, maxWait: 10_000 } as const;

// Popisky modelů jádra v přehledu administrace (uživatele rozdělujeme podle role)
const CORE_LABELS: Record<string, string> = {
  SchoolYear: "Školní roky",
  ClassGroup: "Nové třídy",
  Subject: "Předměty",
  TeachingAssignment: "Úvazky učitelů",
  ClassMembership: "Zařazení studentů do tříd",
};
const ROLE_COUNT_LABELS: Record<string, string> = { STUDENT: "Studenti", TEACHER: "Učitelé", GUEST: "Hosté čekající na schválení" };

// Zámek proti souběžnému naplnění / smazání
const DEMO_LOCK_ID = 90_210_931;
async function lock(tx: TxClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEMO_LOCK_ID})`;
}

function trackerFor(tx: TxClient) {
  return async (model: string, ids: readonly string[]) => {
    for (let i = 0; i < ids.length; i += 2000) {
      await tx.demoRecord.createMany({ data: ids.slice(i, i + 2000).map((recordId) => ({ model, recordId })), skipDuplicates: true });
    }
  };
}

export type DemoCount = { key: string; label: string; count: number };
export type DemoAccount = { id: string; name: string; email: string; role: "STUDENT" | "TEACHER" | "GUEST"; description: string };
export type DemoStatus = {
  exists: boolean;
  counts: DemoCount[];
  accounts: DemoAccount[];
};

/** Stav ukázkových dat: jsou / nejsou, počty podle druhu, pár účtů pro „Zobrazit jako“. */
export async function getDemoStatus(): Promise<DemoStatus> {
  const rows = await prisma.demoRecord.groupBy({ by: ["model"], _count: { _all: true } });
  if (rows.length === 0) return { exists: false, counts: [], accounts: [] };
  const byModel = new Map(rows.map((r) => [r.model, r._count._all]));

  const labels: Record<string, string> = { ...CORE_LABELS };
  for (const { server } of MODULE_SERVERS) Object.assign(labels, server.demoData?.labels);

  const demoUsers = (await prisma.demoRecord.findMany({ where: { model: "User" }, select: { recordId: true } })).map((r) => r.recordId);
  const roles = await prisma.user.groupBy({ by: ["role"], where: { id: { in: demoUsers } }, _count: { _all: true } });
  const counts: DemoCount[] = [];
  for (const role of ["STUDENT", "TEACHER", "GUEST"]) {
    const n = roles.find((r) => r.role === role)?._count._all ?? 0;
    if (n > 0) counts.push({ key: `User.${role}`, label: ROLE_COUNT_LABELS[role], count: n });
  }
  for (const [model, label] of Object.entries(labels)) {
    const n = byModel.get(model) ?? 0;
    if (n > 0) counts.push({ key: model, label, count: n });
  }

  const demoWhere = { id: { in: demoUsers }, isActive: true };
  const [students, preferredTeacher, anyTeacher, guest] = await Promise.all([
    prisma.user.findMany({ where: { ...demoWhere, role: "STUDENT", classGroup: { grade: 4 } }, include: { classGroup: true }, orderBy: { id: "asc" }, take: 2 }),
    prisma.user.findFirst({ where: { ...demoWhere, id: DEMO_SHOWCASE_TEACHER_ID, role: "TEACHER" } }),
    prisma.user.findFirst({ where: { ...demoWhere, role: "TEACHER" }, orderBy: { id: "asc" } }),
    prisma.user.findFirst({ where: { ...demoWhere, role: "GUEST" }, orderBy: { id: "asc" } }),
  ]);
  const teacher = preferredTeacher ?? anyTeacher;
  const accounts: DemoAccount[] = [];
  for (const student of students) {
    accounts.push({ id: student.id, name: `${student.firstName} ${student.lastName}`, email: student.email, role: "STUDENT", description: `Student ${student.classGroup ? classLabel(student.classGroup) : "4. ročníku"}` });
  }
  if (teacher) accounts.push({ id: teacher.id, name: `${teacher.firstName} ${teacher.lastName}`, email: teacher.email, role: "TEACHER", description: "Učitel" });
  if (guest) accounts.push({ id: guest.id, name: `${guest.firstName} ${guest.lastName}`, email: guest.email, role: "GUEST", description: "Host čekající na schválení" });
  return { exists: true, counts, accounts };
}

/** Naplní ukázková data (v dané transakci). Zapíše do evidence a do historie změn. */
export async function seedDemoData(tx: TxClient, actor: User): Promise<{ summary: string; counts: Record<string, number> }> {
  await lock(tx);
  if ((await tx.demoRecord.count()) > 0) throw new Error("Ukázková data už existují. Nejdřív je smažte.");

  const now = new Date();
  const rng = createDemoRandom();
  const track = trackerFor(tx);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const core = await seedCoreDemo(tx, { actor, now, rng, track, passwordHash });
  const ctx: DemoSeedContext = { actor, now, rng, track, core, passwordHash };
  const enabled = await getEnabledModuleIds();
  for (const { id, server } of MODULE_SERVERS) {
    // Vypnutý modul se přeskočí (jeho tabulky zůstanou beze změny)
    if (id === "core" || !enabled.includes(id)) continue;
    await server.demoData?.seed(tx, ctx);
  }

  const grouped = await tx.demoRecord.groupBy({ by: ["model"], _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((g) => [g.model, g._count._all]));
  const summary = `Naplněna ukázková data: ${core.students.length} studentů, ${core.teachers.length} učitelů, ${core.guests.length} hostů, ${core.classes.length} tříd, ${core.subjects.length} předmětů`;
  await audit(tx, actor, { action: "system.demo.seed", entityType: "demo", summary, data: { counts } });
  return { summary, counts };
}

export type DemoClearResult = { summary: string; deleted: number; keptClasses: string[] };

/** Smaže ukázková data podle evidence (v dané transakci): moduly nejdřív, jádro nakonec. */
export async function clearDemoData(tx: TxClient, actor: User): Promise<DemoClearResult> {
  await lock(tx);
  const records = await tx.demoRecord.findMany({ select: { model: true, recordId: true } });
  if (records.length === 0) throw new Error("Žádná ukázková data k odstranění nejsou.");
  const byModel = new Map<string, string[]>();
  for (const r of records) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r.recordId]);
  const ids = (model: string) => byModel.get(model) ?? [];

  // 1) Moduly (i vypnuté: jejich data by jinak blokovala smazání uživatelů)
  const ctx: DemoClearContext = { actor, now: new Date(), track: trackerFor(tx), ids };
  for (const { id, server } of [...MODULE_SERVERS].reverse()) {
    if (id !== "core") await server.demoData?.clear(tx, ctx);
  }

  // 2) Jádro: uživatelé, předměty (kaskádou jejich úvazky), třídy, školní rok
  const users = ids("User");
  await tx.user.deleteMany({ where: { id: { in: users } } });
  await tx.subject.deleteMany({ where: { id: { in: ids("Subject") } } });
  await tx.teachingAssignment.deleteMany({ where: { id: { in: ids("TeachingAssignment") } } });
  await tx.classMembership.deleteMany({ where: { id: { in: ids("ClassMembership") } } });

  // Třída, ve které zůstali skuteční studenti (nebo jejich historie zařazení), se nemaže
  const classIds = ids("ClassGroup");
  const [withStudents, withHistory] = await Promise.all([
    tx.user.findMany({ where: { classGroupId: { in: classIds } }, select: { classGroupId: true }, distinct: ["classGroupId"] }),
    tx.classMembership.findMany({ where: { classGroupId: { in: classIds } }, select: { classGroupId: true }, distinct: ["classGroupId"] }),
  ]);
  const keep = new Set([...withStudents, ...withHistory].map((r) => r.classGroupId).filter((x): x is string => !!x));
  const keptClasses = (await tx.classGroup.findMany({ where: { id: { in: [...keep] } } })).map((c) => classLabel(c)).sort();
  await tx.classGroup.deleteMany({ where: { id: { in: classIds.filter((c) => !keep.has(c)) } } });

  // Školní rok, který ukázková data založila, zůstane, pokud už se k němu váže skutečná historie
  const yearIds = ids("SchoolYear");
  if (yearIds.length > 0) {
    const [memberships, assignments] = await Promise.all([
      tx.classMembership.count({ where: { schoolYearId: { in: yearIds } } }),
      tx.teachingAssignment.count({ where: { schoolYearId: { in: yearIds } } }),
    ]);
    if (memberships === 0 && assignments === 0) await tx.schoolYear.deleteMany({ where: { id: { in: yearIds } } });
  }

  await tx.demoRecord.deleteMany({});
  const summary =
    `Smazána ukázková data (${records.length} záznamů evidence)` +
    (keptClasses.length > 0 ? `; ${keptClasses.length === 1 ? "třída" : "třídy"} ${keptClasses.join(", ")} zůstala, jsou v ní skuteční studenti` : "");
  await audit(tx, actor, { action: "system.demo.clear", entityType: "demo", summary, data: { records: records.length, keptClasses } as Prisma.InputJsonValue });
  return { summary, deleted: records.length, keptClasses };
}
