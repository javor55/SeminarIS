"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/school";
import type { User } from "@/lib/types";
import { stopImpersonation } from "@/modules/core/actions/impersonation";
import { formatName } from "@/lib/names";

/** Výrazný pruh nahoře, dokud admin prohlíží aplikaci jako jiný uživatel. */
export function ImpersonationBanner({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const role = ROLE_LABELS[user.role] ?? user.role;

  async function stop() {
    setBusy(true);
    try {
      await stopImpersonation();
      // Znovu načíst celou aplikaci jako skutečný admin
      window.location.assign("/users");
    } catch {
      toast.error("Náhled se nepodařilo ukončit.");
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      className="print:hidden sticky top-0 z-50 border-b border-banner-border bg-banner text-banner-foreground"
    >
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            Prohlížíte jako{" "}
            <strong>
              {formatName(user, "text")}
            </strong>{" "}
            ({role}
            {user.classLabel ? ` ${user.classLabel}` : ""}) – jen pro čtení, nic nelze měnit.
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={stop} disabled={busy} data-testid="stop-impersonation">
          Ukončit náhled
        </Button>
      </div>
    </div>
  );
}
