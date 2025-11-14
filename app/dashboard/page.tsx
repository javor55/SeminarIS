// app/dashboard/page.tsx
"use client";

import { useAuth } from "@/components/auth/auth-provider";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/lib/data";
import { EnrollmentView } from "@/components/enrollment/EnrollmentView";
import { EnrollmentWindow, User } from "@/lib/types";

// 🔥 Tato logika nyní patří sem, na /dashboard
function findDashboardEnrollment(
  allWindows: EnrollmentWindow[],
  currentUser: User
): EnrollmentWindow | null {
  // ... (vaše logika pro findDashboardEnrollment)
  // 1. Předfiltrování podle role
  const windowsToSearch =
    currentUser.role === "STUDENT"
      ? allWindows.filter((ew) => ew.visibleToStudents)
      : allWindows;

  // 2. Priorita: "OPEN"
  const openWindows = windowsToSearch
    .filter((ew) => ew.status === "OPEN")
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  if (openWindows.length > 0) return openWindows[0];

  // 3. Priorita: "SCHEDULED"
  const scheduledWindows = windowsToSearch
    .filter((ew) => ew.status === "SCHEDULED")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  if (scheduledWindows.length > 0) return scheduledWindows[0];

  // 4. Priorita: "DRAFT"
  if (currentUser.role !== "STUDENT") {
    const draftWindows = windowsToSearch
      .filter((ew) => ew.status === "DRAFT")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (draftWindows.length > 0) return draftWindows[0];
  }

  // 5. Priorita: "CLOSED"
  const closedWindows = windowsToSearch
    .filter((ew) => ew.status === "CLOSED")
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());
  if (closedWindows.length > 0) return closedWindows[0];

  return null;
}

export default function DashboardPage() {
  const { user } = useAuth();

  const enrollmentToShow = user
    ? findDashboardEnrollment(getEnrollmentWindowsVisible() ?? [], user)
    : null;

  const ew = enrollmentToShow
    ? getEnrollmentWindowByIdWithBlocks(enrollmentToShow.id)
    : null;

  if (!user) {
    return null; // Čekání na přihlášení (layout se o to postará)
  }

  if (!ew) {
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

  return <EnrollmentView enrollmentWindow={ew} currentUser={user} />;
}