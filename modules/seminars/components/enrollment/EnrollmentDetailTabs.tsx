"use client";

import { useEffect, useState, type ReactNode } from "react";
import { OPEN_TAB_EVENT } from "@/modules/seminars/components/enrollment/EnrollmentProgressPanel";
import { UnenrolledTab } from "@/modules/seminars/components/enrollment/UnenrolledTab";
import { Button } from "@/components/ui/button";

type Tab = "enrollments" | "unenrolled";

/** Detail zápisového okna: záložky Zápisy (obsah předaný jako children) a Nezapsaní. */
export function EnrollmentDetailTabs({
  windowId,
  windowName,
  canRemind,
  children,
}: {
  windowId: string;
  windowName: string;
  canRemind: boolean;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("enrollments");
  const [count, setCount] = useState<number | null>(null);

  // Panel průběhu zápisu (v záložce Zápisy) umí přepnout na Nezapsané
  useEffect(() => {
    const open = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "unenrolled") setTab("unenrolled");
    };
    window.addEventListener(OPEN_TAB_EVENT, open);
    return () => window.removeEventListener(OPEN_TAB_EVENT, open);
  }, []);

  return (
    <div className="space-y-6">
      <div role="tablist" className="flex gap-1 border-b">
        {(
          [
            ["enrollments", "Zápisy"],
            ["unenrolled", count == null ? "Nezapsaní" : `Nezapsaní (${count})`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={tab === id}
            data-tab={id}
            onClick={() => setTab(id)}
            className={`-mb-px h-auto rounded-none border-b-2 px-4 py-2 hover:bg-transparent ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "enrollments" ? (
        children
      ) : (
        <UnenrolledTab windowId={windowId} windowName={windowName} canRemind={canRemind} onCount={setCount} />
      )}
    </div>
  );
}
