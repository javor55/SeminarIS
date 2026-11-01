import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { audienceKey, hasIncludes, isInAudience, type AudienceEntry, type AudienceStudent } from "@/modules/seminars/audience";
import { loadAudienceEntries } from "@/modules/seminars/eligibility";
import { windowPhase } from "@/modules/seminars/window-phase";
import type { BulkPreview, BulkUserAction, BulkUserInfo } from "@/modules/server-types";

// Hromadné akce nad uživateli patřící modulu Semináře (bod rozšíření `bulkUserActions`):
// „Přidat do publika zápisu“ a „Odebrat z publika zápisu“. Spouští je společný běh jádra
// (modules/core/bulk-runner.ts): oprávnění, výběr, náhled, transakce a souhrnný záznam v historii.

const isActiveStudent = (u: BulkUserInfo) => u.role === "STUDENT" && u.isActive && u.studyStatus === "ACTIVE";

const studentsWord = (n: number) => `${n} ${n === 1 ? "student" : n >= 2 && n <= 4 ? "studenti" : "studentů"}`;

async function windowParam(actor: unknown) {
  void actor;
  const windows = await prisma.enrollmentWindow.findMany({ orderBy: { startsAt: "desc" }, select: { id: true, name: true, published: true, closedEarlyAt: true, startsAt: true, endsAt: true } });
  return [
    {
      key: "windowId",
      label: "Zápis",
      type: "select" as const,
      required: true,
      options: windows.map((w) => ({ value: w.id, label: `${w.name} (${windowPhase(w).label.toLowerCase()})` })),
    },
  ];
}

/** Ročníky tříd vybraných uživatelů (BulkUserInfo nese jen id třídy). */
async function toAudienceStudents(users: BulkUserInfo[]): Promise<Map<string, AudienceStudent>> {
  const classIds = [...new Set(users.map((u) => u.classGroupId).filter((x): x is string => !!x))];
  const classes = classIds.length ? await prisma.classGroup.findMany({ where: { id: { in: classIds } }, select: { id: true, grade: true } }) : [];
  const grade = new Map(classes.map((c) => [c.id, c.grade]));
  return new Map(users.map((u) => [u.id, { id: u.id, classGroupId: u.classGroupId, grade: u.classGroupId ? grade.get(u.classGroupId) ?? null : null }]));
}

type Plan = { entries: AudienceEntry[]; added: number; exceptionsLifted: number; removedUserEntries: number; excluded: number };

/** Přidání studentů do publika: zruší jejich výjimku a pokud ještě nejsou uvnitř, přidá jim položku USER. */
export function planAdd(entries: AudienceEntry[], students: AudienceStudent[]): Plan {
  let next = [...entries];
  let exceptionsLifted = 0;
  let added = 0;
  for (const s of students) {
    if (next.some((e) => e.type === "EXCLUDE_USER" && e.userId === s.id)) {
      next = next.filter((e) => !(e.type === "EXCLUDE_USER" && e.userId === s.id));
      exceptionsLifted++;
    }
    if (!isInAudience(next, s)) {
      next.push({ type: "USER", userId: s.id });
      added++;
    }
  }
  return { entries: next, added, exceptionsLifted, removedUserEntries: 0, excluded: 0 };
}

/** Odebrání studentů z publika: smaže jejich položku USER a pokud je pořád pokrývá ročník či třída, přidá výjimku. */
export function planRemove(entries: AudienceEntry[], students: AudienceStudent[]): Plan {
  let next = [...entries];
  let removedUserEntries = 0;
  let excluded = 0;
  for (const s of students) {
    if (next.some((e) => e.type === "USER" && e.userId === s.id)) {
      next = next.filter((e) => !(e.type === "USER" && e.userId === s.id));
      removedUserEntries++;
    }
    if (isInAudience(next, s)) {
      next.push({ type: "EXCLUDE_USER", userId: s.id });
      excluded++;
    }
  }
  return { entries: next, added: 0, exceptionsLifted: 0, removedUserEntries, excluded };
}

/** Uloží výsledný stav publika (rozdíl proti původnímu) v transakci. */
async function persist(tx: Pick<typeof prisma, "enrollmentWindowAudience">, windowId: string, before: AudienceEntry[], after: AudienceEntry[]) {
  const was = new Set(before.map(audienceKey));
  const now = new Set(after.map(audienceKey));
  const removed = before.filter((e) => !now.has(audienceKey(e)));
  for (const e of removed) await tx.enrollmentWindowAudience.deleteMany({ where: { windowId, key: audienceKey(e) } });
  const created = after.filter((e) => !was.has(audienceKey(e)));
  if (created.length) {
    await tx.enrollmentWindowAudience.createMany({
      data: created.map((e) => ({ windowId, type: e.type, grade: e.grade ?? null, classGroupId: e.classGroupId ?? null, userId: e.userId ?? null, key: audienceKey(e) })),
      skipDuplicates: true,
    });
  }
}

async function loadWindow(windowId: string | undefined) {
  if (!windowId) return null;
  return prisma.enrollmentWindow.findUnique({ where: { id: windowId }, select: { id: true, name: true } });
}

function empty(blocked: string): BulkPreview {
  return { eligibleIds: [], lines: [], skipped: [], blocked };
}

const addToAudience: BulkUserAction = {
  id: "audience",
  label: "Přidat do publika zápisu",
  permission: "seminars.windows.manage",
  confirm: "Vybraní studenti se přidají do publika zvoleného zápisu: uvidí ho a budou se do něj moci zapsat.",
  params: windowParam,
  async preview(users, _actor, params) {
    const ew = await loadWindow(params.windowId);
    if (!ew) return empty("Vyberte zápis.");
    const entries = await loadAudienceEntries(ew.id);
    if (!hasIncludes(entries)) {
      return empty(`Zápis „${ew.name}“ je určen všem studentům, takže přidávat do publika nemá smysl. Nejdřív publikum omezte (ročníky, třídy) v úpravě zápisu.`);
    }
    const students = await toAudienceStudents(users);
    const skipped = new Map<string, number>();
    const eligible: BulkUserInfo[] = [];
    for (const u of users) {
      if (!isActiveStudent(u)) skipped.set("nejsou aktivní studenti", (skipped.get("nejsou aktivní studenti") ?? 0) + 1);
      else if (isInAudience(entries, students.get(u.id)!)) skipped.set("už jsou v publiku", (skipped.get("už jsou v publiku") ?? 0) + 1);
      else eligible.push(u);
    }
    const plan = planAdd(entries, eligible.map((u) => students.get(u.id)!));
    const lines = eligible.length
      ? [
          `Do publika zápisu „${ew.name}“ se přidá ${studentsWord(eligible.length)}.`,
          ...(plan.exceptionsLifted ? [`U ${plan.exceptionsLifted} z nich se zruší výjimka „kromě těchto studentů“.`] : []),
        ]
      : [];
    return { eligibleIds: eligible.map((u) => u.id), lines, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
  },
  async run(tx, userIds, actor, params) {
    const ew = await loadWindow(params.windowId);
    if (!ew) throw new Error("Zápis nenalezen.");
    const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, classGroupId: true, classGroup: { select: { grade: true } } } });
    const before = await loadAudienceEntries(ew.id, tx);
    const plan = planAdd(before, users.map((u) => ({ id: u.id, classGroupId: u.classGroupId, grade: u.classGroup?.grade ?? null })));
    await persist(tx, ew.id, before, plan.entries);
    const summary = `Do publika zápisu „${ew.name}“ přidáno: ${studentsWord(userIds.length)}`;
    await audit(tx, actor, {
      action: "seminars.window.audience",
      entityType: "enrollmentWindow",
      entityId: ew.id,
      summary: `${summary}${plan.exceptionsLifted ? ` (u ${plan.exceptionsLifted} zrušena výjimka)` : ""}`,
      data: { windowId: ew.id, added: userIds, exceptionsLifted: plan.exceptionsLifted, via: "users.bulk" },
    });
    return { affected: userIds.length, summary, data: { windowId: ew.id, windowName: ew.name } };
  },
};

const removeFromAudience: BulkUserAction = {
  id: "audience-remove",
  label: "Odebrat z publika zápisu",
  permission: "seminars.windows.manage",
  confirm: "Vybraní studenti se odeberou z publika zvoleného zápisu (už existující zápisy zůstanou).",
  params: windowParam,
  async preview(users, _actor, params) {
    const ew = await loadWindow(params.windowId);
    if (!ew) return empty("Vyberte zápis.");
    const entries = await loadAudienceEntries(ew.id);
    if (!hasIncludes(entries)) {
      return empty(`Zápis „${ew.name}“ je určen všem studentům. Publikum nejdřív omezte (ročníky, třídy) v úpravě zápisu, nebo studenty přidejte mezi vynechané tam.`);
    }
    const students = await toAudienceStudents(users);
    const eligible = users.filter((u) => isInAudience(entries, students.get(u.id)!));
    const skippedCount = users.length - eligible.length;
    const plan = planRemove(entries, eligible.map((u) => students.get(u.id)!));
    if (eligible.length && !hasIncludes(plan.entries)) {
      return empty("Po odebrání by v publiku nikdo nezbyl, a prázdné publikum znamená všechny studenty. Upravte publikum přímo v zápisu.");
    }
    return {
      eligibleIds: eligible.map((u) => u.id),
      lines: eligible.length
        ? [
            `Z publika zápisu „${ew.name}“ se odebere ${studentsWord(eligible.length)}.`,
            ...(plan.excluded ? [`${plan.excluded} z nich pokrývá ročník nebo třída, proto se přidají mezi vynechané.`] : []),
            "Už existující zápisy těchto studentů zůstanou.",
          ]
        : [],
      skipped: skippedCount ? [{ reason: "nejsou v publiku", count: skippedCount }] : [],
    };
  },
  async run(tx, userIds, actor, params) {
    const ew = await loadWindow(params.windowId);
    if (!ew) throw new Error("Zápis nenalezen.");
    const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, classGroupId: true, classGroup: { select: { grade: true } } } });
    const before = await loadAudienceEntries(ew.id, tx);
    const plan = planRemove(before, users.map((u) => ({ id: u.id, classGroupId: u.classGroupId, grade: u.classGroup?.grade ?? null })));
    if (!hasIncludes(plan.entries)) throw new Error("Po odebrání by v publiku nikdo nezbyl. Upravte publikum přímo v zápisu.");
    await persist(tx, ew.id, before, plan.entries);
    const summary = `Z publika zápisu „${ew.name}“ odebráno: ${studentsWord(userIds.length)}`;
    await audit(tx, actor, {
      action: "seminars.window.audience",
      entityType: "enrollmentWindow",
      entityId: ew.id,
      summary,
      data: { windowId: ew.id, removed: userIds, excluded: plan.excluded, via: "users.bulk" },
    });
    return { affected: userIds.length, summary, data: { windowId: ew.id, windowName: ew.name } };
  },
};

export const seminarsBulkActions: readonly BulkUserAction[] = [addToAudience, removeFromAudience];
