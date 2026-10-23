import type { ReactNode } from "react";

// Předměty patří do jádra (nejdou vypnout), ale zápisy u předmětu čtou stav modulu z DB
export const dynamic = "force-dynamic";

export default function SubjectsLayout({ children }: { children: ReactNode }) {
  return children;
}
