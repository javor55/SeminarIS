import type { ReactNode } from "react";
import { ensureModulePage } from "@/lib/modules";

// Zapnutí modulu se čte z DB při každém požadavku – stránky se nesmí předgenerovat při buildu
export const dynamic = "force-dynamic";

export default async function EventsLayout({ children }: { children: ReactNode }) {
  await ensureModulePage("events");
  return children;
}
