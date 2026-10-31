import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";
import { getEnrollmentWindowByIdWithBlocks } from "@/modules/seminars/actions/windows";
import { EnrollmentView } from "@/modules/seminars/components/enrollment/EnrollmentView";

// Detail zápisu pro studenta: tady se zapisuje, odepisuje a přepisuje. Okno, které student nesmí vidět
// (skryté, koncept, mimo publikum), se tváří jako neexistující – rozhoduje server (getEnrollmentWindowByIdWithBlocks).
export default async function StudentEnrollmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission("seminars.enroll.view");
  const ew = await getEnrollmentWindowByIdWithBlocks(id);

  if (!ew) {
    return (
      <PageHeader
        back={{ href: "/zapisy", label: "Všechny zápisy" }}
        title="Zápis nenalezen"
        description="Hledaný zápis neexistuje nebo k němu nemáte přístup."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/zapisy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" /> Všechny zápisy
      </Link>
      <EnrollmentView enrollmentWindow={ew} currentUser={user} />
    </div>
  );
}
