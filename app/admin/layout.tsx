import type { ReactNode } from "react";
import { AdminShell } from "@/modules/core/components/admin/AdminShell";

// Menu sekcí závisí na zapnutých modulech (DB) – nesmí se předgenerovat při buildu.
// Oprávnění k jednotlivým stránkám hlídá middleware (manifest) a každá stránka sama (requirePagePermission);
// rám jen sestaví menu z toho, co smí uživatel otevřít.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
