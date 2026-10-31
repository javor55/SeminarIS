import { prisma } from "@/lib/prisma";
import { can } from "@/modules/registry";
import { computeUnenrolled } from "@/modules/seminars/unenrolled";
import type { ModuleServer } from "@/modules/server-types";
import type { SubjectBadge } from "@/modules/types";
import { SubjectOccurrencesPanel } from "@/modules/seminars/components/subjects/SubjectOccurrencesPanel";
import { getSubjectOccurrences } from "@/modules/seminars/actions/occurrences";
import { getSubjectWindows } from "@/modules/seminars/subject-windows";
import { getSeminarsDashboardCards } from "@/modules/seminars/dashboard-cards";
import { getSeminarsMySubjectsSections } from "@/modules/seminars/my-subjects";
import { UserEnrollmentsPanel } from "@/modules/seminars/user-enrollments";
import { seminarsBulkActions } from "@/modules/seminars/bulk-audience";
import { getSeminarsEmailEstimates, runSeminarsDailyJob } from "@/modules/seminars/notifications";

export const seminarsServer: ModuleServer = {
  runDailyJob: runSeminarsDailyJob,
  // Uživatelé → hromadné akce „Přidat do publika zápisu“ / „Odebrat z publika zápisu“
  bulkUserActions: seminarsBulkActions,
  getEmailEstimates: () => getSeminarsEmailEstimates(),

  getDashboardCards: getSeminarsDashboardCards,

  getMySubjectsSections: getSeminarsMySubjectsSections,

  // „v zápisu“: štítky předmětů nabízených v zápisových oknech (podle viditelnosti pro uživatele)
  async getSubjectBadges(subjectIds, user) {
    const windows = await getSubjectWindows(user, subjectIds);
    const canOpen = can(user.role, "seminars.windows.view");
    const canEnrollView = can(user.role, "seminars.enroll.view");
    const result = new Map<string, SubjectBadge[]>();
    for (const [subjectId, list] of windows) {
      result.set(
        subjectId,
        list.map((w) => ({
          id: `window.${w.id}`,
          label: `v zápisu: ${w.name}`,
          // Učitel a admin do správy okna, student a host na stránku Zápisy (server stejně pustí jen viditelná okna)
          href: canOpen ? `/enrollments/${w.id}` : canEnrollView ? `/zapisy/${w.id}` : undefined,
          filter: { key: "inWindow", label: "V zápisu", yesLabel: "Nabízené v zápisu", noLabel: "Mimo zápis" },
          grantsAccess: true,
        }))
      );
    }
    return result;
  },

  // Panel výskytů předmětu v zápisech – jen pro učitele a admina
  async getSubjectTabs(subjectId, user) {
    if (!can(user.role, "seminars.windows.view")) return [];
    const occurrences = await getSubjectOccurrences(subjectId);
    return [
      {
        id: "occurrences",
        label: "Zápisy",
        order: 100,
        content: <SubjectOccurrencesPanel occurrences={occurrences} currentUser={user} />,
      },
    ];
  },

  // Detail uživatele: zápisy studenta po zápisových oknech (učitel a admin)
  async getUserTabs(userId, viewer) {
    if (!can(viewer.role, "seminars.windows.view")) return [];
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) return [];
    if (target.role !== "STUDENT" && (await prisma.studentEnrollment.count({ where: { studentId: userId, deletedAt: null } })) === 0) return [];
    return [{ id: "enrollments", label: "Zápisy", order: 100, content: <UserEnrollmentsPanel userId={userId} canOpenWindows /> }];
  },

  async getSubjectUsage(subjectId) {
    const [occurrences, enrollments, windows] = await Promise.all([
      prisma.subjectOccurrence.count({ where: { subjectId } }),
      prisma.studentEnrollment.count({ where: { subjectOccurrence: { subjectId } } }),
      prisma.enrollmentWindow.count({ where: { blocks: { some: { subjectOccurrences: { some: { subjectId } } } } } }),
    ]);
    return [
      { id: "windows", label: "Zápisová okna s tímto předmětem", count: windows },
      { id: "occurrences", label: "Výskyty v zápisech", count: occurrences },
      { id: "enrollments", label: "Zápisy studentů na tento předmět", count: enrollments },
    ];
  },

  // Přehled „co udělat“: otevřená okna, ve kterých ještě nemají zapsáno všichni studenti
  async getAdminTodos(user) {
    if (!can(user.role, "seminars.windows.view")) return [];
    const open = await prisma.enrollmentWindow.findMany({ where: { status: "OPEN" }, orderBy: { endsAt: "asc" }, select: { id: true, name: true } });
    const todos = await Promise.all(
      open.map(async (w) => ({
        id: `unenrolled.${w.id}`,
        label: `Nezapsaní studenti v otevřeném zápisu „${w.name}“`,
        count: (await computeUnenrolled(w.id))?.students.length ?? 0,
        severity: "warning" as const,
        href: `/enrollments/${w.id}`,
        permission: "seminars.windows.view",
      }))
    );
    return todos;
  },

  async getAdminStats() {
    const [subjectCount, activeEnrollmentCount] = await Promise.all([
      prisma.subject.count({ where: { isActive: true } }),
      prisma.enrollmentWindow.count({ where: { status: "OPEN" } }),
    ]);
    return [
      { label: "Aktivní předměty", value: subjectCount, hint: "Nabízené v aktuálním katalogu", icon: "book" as const },
      { label: "Otevřené zápisy", value: activeEnrollmentCount, hint: "Aktuálně probíhající zápisová okna", icon: "calendar" as const },
    ];
  },

  async onUserDelete(tx, userId, adminId) {
    // 1. Odpojit jako učitele
    await tx.subjectOccurrence.updateMany({
      where: { teacherId: userId },
      data: { teacherId: null },
    });

    // 2. Smazat zápisy studenta
    await tx.studentEnrollment.deleteMany({
      where: { studentId: userId },
    });

    // 3. Přepsat povinná createdById → adminId (předměty jsou v jádru, autor se tam sám nuluje)
    await tx.enrollmentWindow.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    await tx.block.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    await tx.subjectOccurrence.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    // (záznamy jiných studentů, kde byl autorem admin/učitel)
    await tx.studentEnrollment.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });

    // 4. Nullovat volitelná audit pole
    await tx.enrollmentWindow.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.block.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.block.updateMany({ where: { deletedById: userId }, data: { deletedById: null } });
    await tx.subjectOccurrence.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.subjectOccurrence.updateMany({ where: { deletedById: userId }, data: { deletedById: null } });
    await tx.studentEnrollment.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.studentEnrollment.updateMany({ where: { deletedById: userId }, data: { deletedById: null } });
  },
};
