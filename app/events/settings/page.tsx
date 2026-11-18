import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";
import { AdminShell } from "@/modules/core/components/admin/AdminShell";

// Sekce „Události“ v administraci; nastavení modulu (lhůta pro smazání údajů, výchozí texty) přibude později.
export default async function EventsSettingsPage() {
  await requirePagePermission("events.manage.all");

  return (
    <AdminShell>
      <PageHeader title="Události" description="Nastavení modulu Události." />
      <p className="text-sm text-muted-foreground" data-testid="events-settings">
        Zatím není co nastavovat.
      </p>
    </AdminShell>
  );
}
