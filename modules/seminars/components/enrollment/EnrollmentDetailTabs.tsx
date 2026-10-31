"use client";

import { useState, type ReactNode } from "react";
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
