import { prisma } from "@/lib/prisma";
import type { EnrollmentWindow, User } from "@/lib/types";
import type { ModuleServer } from "@/modules/server-types";
import { EnrollmentView } from "@/modules/seminars/components/enrollment/EnrollmentView";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/modules/seminars/actions/windows";

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

    return <EnrollmentView enrollmentWindow={ew} currentUser={user} />;
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

    // 3. Přepsat povinná createdById → adminId
    await tx.subject.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    await tx.enrollmentWindow.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    await tx.block.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    await tx.subjectOccurrence.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });
    // (záznamy jiných studentů, kde byl autorem admin/učitel)
    await tx.studentEnrollment.updateMany({ where: { createdById: userId }, data: { createdById: adminId } });

    // 4. Nullovat volitelná audit pole
    await tx.subject.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.enrollmentWindow.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.block.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.block.updateMany({ where: { deletedById: userId }, data: { deletedById: null } });
    await tx.subjectOccurrence.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.subjectOccurrence.updateMany({ where: { deletedById: userId }, data: { deletedById: null } });
    await tx.studentEnrollment.updateMany({ where: { updatedById: userId }, data: { updatedById: null } });
    await tx.studentEnrollment.updateMany({ where: { deletedById: userId }, data: { deletedById: null } });
  },
};
