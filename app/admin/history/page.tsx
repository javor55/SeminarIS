import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import { getHistoryUserName } from "@/modules/core/actions/history";
import { HistoryView } from "@/modules/core/components/admin/HistoryView";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "core.admin")) redirect("/dashboard");

  const { user: userId } = await searchParams;
  const name = userId ? await getHistoryUserName(userId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={name ? `Historie: ${name}` : "Historie změn"}
        description={
          name
            ? "Co uživatel udělal a co se s ním dělo."
            : "Kdo, co a kdy v systému změnil. Záznamy vznikají ve stejné chvíli jako změna samotná."
        }
        back={name ? { href: "/admin/history", label: "Celá historie" } : undefined}
      />
      <HistoryView userId={userId} />
    </div>
  );
}
