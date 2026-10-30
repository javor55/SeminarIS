import { PageHeader } from "@/components/page-header";
import { NotificationsView } from "@/modules/core/components/admin/notifications/NotificationsView";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Upozornění"
        description="E-mailová upozornění: zapnutí, odesílatel, limity, texty a přehled odeslaných e-mailů."
      />
      <NotificationsView />
    </div>
  );
}
