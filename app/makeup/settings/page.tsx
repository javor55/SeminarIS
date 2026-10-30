import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/session";
import { describeSettings } from "@/lib/settings-registry";
import { can } from "@/modules/registry";
import { AdminShell } from "@/modules/core/components/admin/AdminShell";
import { SettingsForm } from "@/modules/core/components/admin/SettingsForm";

// Sekce „Dopisování“ v administraci: výchozí kapacita a uzávěrka nových termínů
export default async function MakeupSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "makeup.sessions.manageAll")) redirect("/dashboard");
  const fields = await describeSettings(user, (d) => d.owner === "makeup");

  return (
    <AdminShell>
      <PageHeader title="Dopisování" description="Výchozí nastavení termínů dopisování písemek." />
      <SettingsForm title="Výchozí nastavení termínů" description="Hodnoty se předvyplní při vypisování nového termínu." fields={fields} testId="makeup-settings" />
    </AdminShell>
  );
}
