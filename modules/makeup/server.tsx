import { prisma } from "@/lib/prisma";
import { can } from "@/modules/registry";
import type { ModuleServer } from "@/modules/server-types";
import { UserMakeupPanel } from "@/modules/makeup/user-makeup";
import { SubjectMakeupPanel } from "@/modules/makeup/subject-makeup";
import { getMakeupMySubjectsSections } from "@/modules/makeup/my-subjects";
import { plural } from "@/lib/plural";
import type { SubjectBadge } from "@/modules/types";
import { getMakeupDashboardCards } from "@/modules/makeup/dashboard-cards";
import { getMakeupEmailEstimates, runMakeupDailyJob } from "@/modules/makeup/notifications";

export const makeupServer: ModuleServer = {
  runDailyJob: runMakeupDailyJob,
  getEmailEstimates: () => getMakeupEmailEstimates(),

  getDashboardCards: getMakeupDashboardCards,

  // Detail uživatele: zápisy studenta s docházkou, u učitele dozorované termíny. Admin vidí vše,
  // učitel jen termíny, které dozoruje, a písemky svých předmětů.
  async getUserTabs(userId, viewer) {
    if (!can(viewer.role, "makeup.sessions.manage")) return [];
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) return [];
    return [
      {
        id: "makeup",
        label: "Dopisování",
        order: 110,
        content: <UserMakeupPanel userId={userId} role={target.role} scope={{ all: can(viewer.role, "makeup.sessions.manageAll"), viewerId: viewer.id }} />,
      },
    ];
  },

  getMySubjectsSections: getMakeupMySubjectsSections,

  // „3 termíny dopisování“: počet nadcházejících neodvolaných termínů s předmětem
  async getSubjectBadges(subjectIds, user) {
    const result = new Map<string, SubjectBadge[]>();
    if (!can(user.role, "makeup.view")) return result;
    const counts = await prisma.makeupSessionSubject.groupBy({
      by: ["subjectId"],
      where: { subjectId: { in: subjectIds }, session: { endsAt: { gte: new Date() }, cancelledAt: null } },
      _count: { _all: true },
    });
    for (const c of counts) {
      const n = c._count._all;
      result.set(c.subjectId, [
        {
          id: "sessions",
          label: `${n} ${plural(n, "termín", "termíny", "termínů")} dopisování`,
          href: `/subjects/${c.subjectId}?tab=makeup.sessions`,
          filter: { key: "makeup", label: "Dopisování", yesLabel: "S termínem dopisování", noLabel: "Bez termínu dopisování" },
        },
      ]);
    }
    return result;
  },

  // Termíny dopisování s předmětem (nadcházející a nedávné); kdo dopisuje, vidí jen oprávnění uživatelé
  async getSubjectTabs(subjectId, user) {
    if (!can(user.role, "makeup.view")) return [];
    return [{ id: "sessions", label: "Dopisování", order: 110, content: <SubjectMakeupPanel subjectId={subjectId} viewer={user} /> }];
  },

  async getSubjectUsage(subjectId) {
    const [sessions, registrations] = await Promise.all([
      prisma.makeupSession.count({ where: { subjects: { some: { subjectId } } } }),
      prisma.makeupRegistration.count({ where: { subjects: { some: { subjectId } } } }),
    ]);
    return [
      { id: "sessions", label: "Termíny dopisování s tímto předmětem", count: sessions },
      { id: "registrations", label: "Zápisy studentů na dopisování tohoto předmětu", count: registrations },
    ];
  },

  // Přehled „co udělat“: nadcházející termíny, které nejdou použít
  async getAdminTodos(user) {
    if (!can(user.role, "makeup.sessions.manage")) return [];
    const upcoming = { endsAt: { gte: new Date() }, cancelledAt: null };
    const all = can(user.role, "makeup.sessions.manageAll");
    // Učitel řeší jen termíny, které sám dozoruje; admin všechny
    const mine = all ? {} : { teacherId: user.id };
    const [withoutSubjects, withoutSupervisor] = await Promise.all([
      prisma.makeupSession.count({ where: { ...upcoming, ...mine, subjects: { none: {} } } }),
      all ? prisma.makeupSession.count({ where: { ...upcoming, teacher: { isActive: false } } }) : 0,
    ]);
    return [
      {
        id: "without-subjects",
        label: all ? "Nadcházející termíny dopisování bez předmětů" : "Vaše nadcházející termíny dopisování bez předmětů",
        count: withoutSubjects,
        severity: "warning" as const,
        href: "/makeup",
        permission: "makeup.sessions.manage",
      },
      {
        id: "without-supervisor",
        label: "Nadcházející termíny dopisování s neaktivním dozorem",
        count: withoutSupervisor,
        severity: "warning" as const,
        href: "/makeup",
        permission: "makeup.sessions.manageAll",
      },
    ];
  },

  async getAdminStats() {
    const upcoming = await prisma.makeupSession.count({ where: { endsAt: { gte: new Date() }, cancelledAt: null } });
    return [{ label: "Termíny dopisování", value: upcoming, hint: "Nadcházející vypsané termíny", icon: "calendar" }];
  },

  async onUserDelete(tx, userId, replacementUserId) {
    // Termíny, které uživatel dozoroval nebo vytvořil, převezme admin, který maže
    await tx.makeupSession.updateMany({ where: { teacherId: userId }, data: { teacherId: replacementUserId } });
    await tx.makeupSession.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    await tx.makeupRegistration.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    // Zápisy studenta a vazby „vyučující“ řeší databáze (onDelete: Cascade / SetNull)
  },
};
