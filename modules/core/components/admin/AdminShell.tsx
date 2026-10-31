import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { collectAdminSections } from "@/modules/core/extensions";
import { AdminNav } from "@/modules/core/components/admin/AdminNav";

/**
 * Rám administrace: boční menu (sekce jádra a zapnutých modulů podle oprávnění uživatele)
 * a obsah. Používá ho `app/admin/layout.tsx` i stránky modulů s vlastní sekcí administrace.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const sections = await collectAdminSections(user);
  // Do administrace patří jen ten, kdo smí otevřít aspoň jednu sekci
  if (sections.length === 0) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start" data-testid="admin-shell">
      <AdminNav items={sections.map((s) => ({ label: s.label, href: s.href, match: s.match }))} />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}
