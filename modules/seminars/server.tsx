import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can } from "@/modules/registry";
import { computeUnenrolled } from "@/modules/seminars/unenrolled";
import type { EnrollmentWindow, User } from "@/lib/types";
import type { ModuleServer } from "@/modules/server-types";
import { EnrollmentView } from "@/modules/seminars/components/enrollment/EnrollmentView";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/modules/seminars/actions/windows";
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
