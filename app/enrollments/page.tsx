// app/enrollments/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrollmentWindowsWithDetails } from "@/modules/seminars/actions/windows";
import { EnrollmentsClientView } from "@/modules/seminars/components/enrollment/EnrollmentsClientView";
import { User } from "@/lib/types";
import { can } from "@/modules/registry";

export default async function EnrollmentsPage() {
  const [session, enrollments] = await Promise.all([
    getServerSession(authOptions),
    getEnrollmentWindowsWithDetails(false),
  ]);

  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  if (!can(currentUser.role, "seminars.windows.view")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }

  return (
    <EnrollmentsClientView
      enrollments={enrollments}
      currentUser={currentUser}
    />
  );
}