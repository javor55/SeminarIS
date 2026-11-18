import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";

// Seznam událostí; zakládání a správa přibývají v dalších ticketech.
export default async function EventsPage() {
  await requirePagePermission("events.view");

  return (
    <div className="space-y-6">
      <PageHeader title="Události" description="Registrace veřejnosti na akce školy." />
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="events-empty">
        Zatím žádné události
      </div>
    </div>
  );
}
