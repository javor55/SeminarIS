import type { ReactNode } from "react";

// Záložky detailu uživatele dodávají moduly podle toho, zda jsou zapnuté (stav z DB za běhu)
export const dynamic = "force-dynamic";

export default function UsersLayout({ children }: { children: ReactNode }) {
  return children;
}
