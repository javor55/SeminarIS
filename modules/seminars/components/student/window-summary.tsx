import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { missingBlockLabel } from "@/modules/seminars/unenrolled";
import type { StudentWindow, StudentWindowStatus } from "@/modules/seminars/student-windows";

// Společné kousky stránky Zápisy a karty na dashboardu: stav, termíny, průběh zápisu a tlačítko.

const STATUS: Record<StudentWindowStatus, { label: string; variant: "success" | "info" | "muted" }> = {
  OPEN: { label: "Otevřeno", variant: "success" },
  SCHEDULED: { label: "Naplánováno", variant: "info" },
  CLOSED: { label: "Uzavřeno", variant: "muted" },
};

export function WindowStatusBadge({ status }: { status: StudentWindowStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant} data-testid="window-status">{s.label}</Badge>;
}

/** „Otevřeno do …“, „Otevře se …“, „Uzavřeno …“ */
export function windowDeadlineText(w: Pick<StudentWindow, "status" | "startsAt" | "endsAt">): string {
  if (w.status === "OPEN") return `Zápis běží do ${formatDateTime(w.endsAt)}`;
  if (w.status === "SCHEDULED") return `Zápis se otevře ${formatDateTime(w.startsAt)} (do ${formatDateTime(w.endsAt)})`;
  return `Zápis skončil ${formatDateTime(w.endsAt)}`;
}

/** Co student ve svém zápisu ještě nemá hotové (jen pro ty, kdo se mohou zapisovat). */
export function WindowProgress({ window: w }: { window: StudentWindow }) {
  if (w.requiredBlockCount === 0) return <p className="text-sm text-muted-foreground">Zápis nemá povinné bloky.</p>;
  if (w.missingBlocks.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-success" data-testid="window-progress" data-complete="true">
        <CheckCircle2 className="h-4 w-4" /> Povinné bloky máte zapsané.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-sm text-warning" data-testid="window-progress" data-complete="false">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Chybí zápis v {w.missingBlocks.length === 1 ? "bloku" : "blocích"}: {w.missingBlocks.map(missingBlockLabel).join(", ")}
      </span>
    </p>
  );
}

/** Tlačítko na detail okna: „Zapsat se“ / „Upravit zápis“ v otevřeném okně, jinak „Zobrazit“. */
export function WindowActionButton({ window: w, canEnroll, size = "sm" }: { window: StudentWindow; canEnroll: boolean; size?: "sm" | "default" }) {
  const label = w.status === "OPEN" && canEnroll ? (w.enrollments.length > 0 ? "Upravit zápis" : "Zapsat se") : "Zobrazit";
  return (
    <Button asChild size={size} variant={label === "Zobrazit" ? "outline" : "default"} data-testid="window-action">
      <Link href={`/zapisy/${w.id}`}>{label}</Link>
    </Button>
  );
}
