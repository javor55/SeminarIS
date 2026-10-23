import type { ReactNode } from "react";
import { ensureModulePage } from "@/lib/modules";

export default async function MakeupLayout({ children }: { children: ReactNode }) {
  await ensureModulePage("makeup");
  return children;
}
