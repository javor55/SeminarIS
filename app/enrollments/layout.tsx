import type { ReactNode } from "react";
import { ensureModulePage } from "@/lib/modules";

export default async function SeminarsLayout({ children }: { children: ReactNode }) {
  await ensureModulePage("seminars");
  return children;
}
