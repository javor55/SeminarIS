import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/session";
import { describeSettings } from "@/lib/settings-registry";
import { can } from "@/modules/registry";
import { AdminShell } from "@/modules/core/components/admin/AdminShell";
import { SettingsForm } from "@/modules/core/components/admin/SettingsForm";

// Sekce „Semináře“ v administraci: výchozí hodnoty zápisových oken (formulář z deklarací nastavení modulu)
export default async function SeminarsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "seminars.windows.manage")) redirect("/dashboard");
  const fields = await describeSettings(user, (d) => d.owner === "seminars");

  return (
    <AdminShell>
      <PageHeader title="Semináře" description="Výchozí nastavení zápisových oken." />
      <SettingsForm title="Výchozí nastavení zápisů" description="Hodnoty se předvyplní při zakládání nového zápisového okna." fields={fields} testId="seminars-settings" />
    </AdminShell>
  );
}
