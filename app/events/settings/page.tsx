import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";
import { describeSettings } from "@/lib/settings-registry";
import { AdminShell } from "@/modules/core/components/admin/AdminShell";
import { SettingsForm } from "@/modules/core/components/admin/SettingsForm";

// Sekce „Události“ v administraci: lhůta pro smazání osobních údajů a výchozí texty souhlasu a potvrzení.
export default async function EventsSettingsPage() {
  const user = await requirePagePermission("events.manage.all");
  const fields = await describeSettings(user, (d) => d.owner === "events");

  return (
    <AdminShell>
      <PageHeader title="Události" description="Nastavení modulu Události." />
      <SettingsForm
        title="Osobní údaje a výchozí texty"
        description="Údaje účastníků se po akci mažou automaticky v denní úloze. Výchozí texty se použijí u událostí, které mají vlastní text prázdný."
        fields={fields}
        testId="events-settings"
      />
    </AdminShell>
  );
}
