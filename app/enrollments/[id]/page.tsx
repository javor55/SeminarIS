import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrollmentWindowByIdWithBlocks } from "@/lib/data";
import { EnrollmentView } from "@/components/enrollment/EnrollmentView";
import { User } from "@/lib/types";

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
  const isAllowed = user.role === "ADMIN" || user.role === "TEACHER";

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

  return <EnrollmentView enrollmentWindow={ew} currentUser={user} />;
}