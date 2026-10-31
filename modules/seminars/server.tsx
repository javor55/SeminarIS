import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can } from "@/modules/registry";
import { computeUnenrolled } from "@/modules/seminars/unenrolled";
import type { EnrollmentWindow, User } from "@/lib/types";
import type { ModuleServer } from "@/modules/server-types";
import type { SubjectBadge } from "@/modules/types";
import { EnrollmentView } from "@/modules/seminars/components/enrollment/EnrollmentView";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/modules/seminars/actions/windows";
import { SubjectOccurrencesPanel } from "@/modules/seminars/components/subjects/SubjectOccurrencesPanel";
import { getSubjectOccurrences } from "@/modules/seminars/actions/occurrences";
import { getSubjectWindows } from "@/modules/seminars/subject-windows";
import { getSeminarsMySubjectsSections } from "@/modules/seminars/my-subjects";
import { UserEnrollmentsPanel } from "@/modules/seminars/user-enrollments";
import { seminarsBulkActions } from "@/modules/seminars/bulk-audience";
import { getSeminarsEmailEstimates, runSeminarsDailyJob } from "@/modules/seminars/notifications";

function findDashboardEnrollment(
  allWindows: EnrollmentWindow[],
  currentUser: User
): EnrollmentWindow | null {
  const windowsToSearch =
    currentUser.role === "STUDENT" || currentUser.role === "GUEST"
      ? allWindows.filter((ew) => ew.visibleToStudents)
      : allWindows;

  const openWindows = windowsToSearch
    .filter((ew) => ew.status === "OPEN")
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  if (openWindows.length > 0) return openWindows[0];

  const scheduledWindows = windowsToSearch
    .filter((ew) => ew.status === "SCHEDULED")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  if (scheduledWindows.length > 0) return scheduledWindows[0];

  if (currentUser.role !== "STUDENT") {
    const draftWindows = windowsToSearch
      .filter((ew) => ew.status === "DRAFT")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (draftWindows.length > 0) return draftWindows[0];
  }

  const closedWindows = windowsToSearch
    .filter((ew) => ew.status === "CLOSED")
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());
  if (closedWindows.length > 0) return closedWindows[0];

  return null;
}

export const seminarsServer: ModuleServer = {
  runDailyJob: runSeminarsDailyJob,
  // Uživatelé → hromadné akce „Přidat do publika zápisu“ / „Odebrat z publika zápisu“
  bulkUserActions: seminarsBulkActions,
  getEmailEstimates: () => getSeminarsEmailEstimates(),

  async getDashboardWidget(user) {
    const visible = await getEnrollmentWindowsVisible();
    const found = findDashboardEnrollment(visible as EnrollmentWindow[], user);
    if (!found) return null;

    const ew = await getEnrollmentWindowByIdWithBlocks(found.id);
    if (!ew) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Chyba</h1>
          <p className="text-muted-foreground">
            Nepodařilo se načíst detaily zápisového období.
          </p>
        </div>
      );
    }

    // Učitel a admin: u otevřeného okna kolik studentů ještě nemá zapsáno vše
    let unenrolled: number | null = null;
    if (ew.status === "OPEN" && can(user.role, "seminars.windows.view")) {
      unenrolled = (await computeUnenrolled(ew.id))?.students.length ?? null;
    }

    return (
      <div className="space-y-6">
        {unenrolled != null && (
          <div className="rounded-lg border bg-card p-4 text-sm flex flex-wrap items-center justify-between gap-2" data-testid="unenrolled-widget">
            <span>
              V otevřeném zápisu „{ew.name}“ {unenrolled === 0 ? "mají zapsáno všichni studenti." : <>zbývá zapsat <strong>{unenrolled}</strong> {unenrolled === 1 ? "student" : "studentů"}.</>}
            </span>
            {unenrolled > 0 && (
              <Link href={`/enrollments/${ew.id}`} className="font-medium underline underline-offset-4">Zobrazit nezapsané</Link>
            )}
          </div>
        )}
        <EnrollmentView enrollmentWindow={ew} currentUser={user} />
      </div>
    );
  },

  getMySubjectsSections: getSeminarsMySubjectsSections,

  // „v zápisu“: štítky předmětů nabízených v zápisových oknech (podle viditelnosti pro uživatele)
  async getSubjectBadges(subjectIds, user) {
    const windows = await getSubjectWindows(user, subjectIds);
    const canOpen = can(user.role, "seminars.windows.view");
    const result = new Map<string, SubjectBadge[]>();
    for (const [subjectId, list] of windows) {
      result.set(
        subjectId,
        list.map((w) => ({
          id: `window.${w.id}`,
          label: `v zápisu: ${w.name}`,
          href: canOpen ? `/enrollments/${w.id}` : undefined,
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
