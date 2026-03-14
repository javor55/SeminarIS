import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/lib/data";
import { EnrollmentView } from "@/components/enrollment/EnrollmentView";
import { EnrollmentWindow, User } from "@/lib/types";

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

export default async function DashboardPage() {
  // Paralelní načtení session a viditelných oken
  const [session, visible] = await Promise.all([
    getServerSession(authOptions),
    getEnrollmentWindowsVisible(),
  ]);
  
  if (!session?.user) {
    redirect("/");
  }

  const user = session.user as User;
  const found = findDashboardEnrollment(visible, user);
  
  if (!found) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Vítejte</h1>
        <p className="text-muted-foreground">
          Momentálně zde není žádné aktivní ani naplánované zápisové období
          k zobrazení.
        </p>
      </div>
    );
  }

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
}