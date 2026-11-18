"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/action-result";
import { setEventStatus } from "@/modules/events/actions/events";
import { STATUS_ACTIONS, type EventStatusValue } from "@/modules/events/status";

const DONE: Record<EventStatusValue, string> = {
  DRAFT: "Událost je zase koncept.",
  PUBLISHED: "Událost je zveřejněná.",
  CLOSED: "Registrace je uzavřená.",
  ARCHIVED: "Událost je v archivu.",
};

/** Tlačítka změny stavu: Zveřejnit / Uzavřít registraci / Archivovat / Vrátit do konceptu. */
export function EventStatusActions({ eventId, status }: { eventId: string; status: EventStatusValue }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(to: EventStatusValue) {
    setBusy(true);
    try {
      unwrap(await setEventStatus(eventId, to));
      toast.success(DONE[to]);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {STATUS_ACTIONS[status].map((a) => (
        <Button key={a.to} type="button" variant={a.variant} size="sm" disabled={busy} data-status-action={a.to} onClick={() => change(a.to)}>
          {a.label}
        </Button>
      ))}
    </>
  );
}
