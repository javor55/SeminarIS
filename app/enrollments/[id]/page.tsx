import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrollmentWindowByIdWithBlocks } from "@/modules/seminars/actions/windows";
import { EnrollmentView } from "@/modules/seminars/components/enrollment/EnrollmentView";
import { EnrollmentDetailTabs } from "@/modules/seminars/components/enrollment/EnrollmentDetailTabs";
import { User } from "@/lib/types";
import { can } from "@/modules/registry";

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const user = session.user as User;
  const isAllowed = can(user.role, "seminars.windows.view");

  if (!isAllowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }

  const ew = await getEnrollmentWindowByIdWithBlocks(id);

  if (!ew) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Zápis nenalezen</h1>
        <p className="text-muted-foreground">
          Hledané zápisové období neexistuje nebo k němu nemáte přístup.
        </p>
      </div>
    );
  }

  return (
    <EnrollmentDetailTabs windowId={ew.id} windowName={ew.name} canRemind={can(user.role, "seminars.windows.manage")}>
      <EnrollmentView enrollmentWindow={ew} currentUser={user} />
    </EnrollmentDetailTabs>
  );
}