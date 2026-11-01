import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { getEnrollmentWindowByIdWithBlocks } from "@/modules/seminars/actions/windows";
import { listStudentWindows } from "@/modules/seminars/student-windows";
import { StudentEnrollmentView } from "@/modules/seminars/components/student/StudentEnrollmentView";

// Detail zápisu pro studenta (F12): zápis po krocích (zapsat, vyměnit, odepsat). Okno, které student nesmí vidět
// (skryté, koncept, mimo publikum), se tváří jako neexistující – rozhoduje server (getEnrollmentWindowByIdWithBlocks).
export default async function StudentEnrollmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission("seminars.enroll.view");
  const ew = await getEnrollmentWindowByIdWithBlocks(id);

  if (!ew) {
    return (
      <PageHeader
        back={{ href: "/zapisy?vse=1", label: "Všechny zápisy" }}
        title="Zápis nenalezen"
        description="Hledaný zápis neexistuje nebo k němu nemáte přístup."
      />
    );
  }

  // Odkaz na ostatní (např. uzavřené) zápisy, jen když nějaké jsou
  const hasOthers = (await listStudentWindows(user)).some((w) => w.id !== ew.id);

  return (
    <div className="space-y-4">
      {hasOthers && (
        <Link href="/zapisy?vse=1" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:underline md:min-h-0">
          <ArrowLeft className="h-4 w-4" /> Všechny zápisy
        </Link>
      )}
      <StudentEnrollmentView enrollmentWindow={ew} currentUser={user} canEnroll={can(user.role, "seminars.enroll.self") && user.role === "STUDENT"} />
    </div>
  );
}
