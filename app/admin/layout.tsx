import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import { AdminShell } from "@/modules/core/components/admin/AdminShell";

// Menu sekcí závisí na zapnutých modulech (DB) – nesmí se předgenerovat při buildu
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "core.admin")) redirect("/dashboard");
  return <AdminShell>{children}</AdminShell>;
}
