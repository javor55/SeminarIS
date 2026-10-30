"use client";

import * as React from "react";
import { toast } from "sonner";
import { UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/action-result";
import { startImpersonation } from "@/modules/core/actions/impersonation";

/** „Zobrazit jako tento uživatel“ (jen pro čtení). Celá aplikace se načte znovu jako zobrazovaný uživatel. */
export function ImpersonateButton({ userId, name, label }: { userId: string; name: string; label?: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant={label ? "outline" : "ghost"}
      size="sm"
      className={label ? "gap-2" : "h-8 w-8 p-0"}
      title="Zobrazit jako tento uživatel (jen pro čtení)"
      aria-label={`Zobrazit jako ${name}`}
      data-testid="impersonate"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          unwrap(await startImpersonation(userId));
          window.location.assign("/dashboard");
        } catch (err) {
          toast.error((err as Error).message || "Náhled se nepodařilo spustit.");
          setBusy(false);
        }
      }}
    >
      <UserRoundSearch className="w-4 h-4" />
      {label}
    </Button>
  );
}
