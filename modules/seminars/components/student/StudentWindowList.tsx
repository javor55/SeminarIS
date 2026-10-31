import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import type { StudentWindow } from "@/modules/seminars/student-windows";
import { WindowActionButton, WindowProgress, WindowStatusBadge } from "@/modules/seminars/components/student/window-summary";

/** Seznam zápisových oken na stránce Zápisy: stav, termíny, co má student hotovo a co mu chybí. */
export function StudentWindowList({ windows, canEnroll }: { windows: StudentWindow[]; canEnroll: boolean }) {
  if (windows.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground" data-testid="student-windows-empty">
        Zatím tu pro vás není žádný zápis. Až se nějaký otevře nebo naplánuje, objeví se tady.
      </p>
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2" data-testid="student-windows">
      {windows.map((w) => (
        <li key={w.id} data-testid="student-window" data-window={w.id} data-status={w.status}>
          <Card className="h-full">
            <CardHeader className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">
                  <Link href={`/zapisy/${w.id}`} className="hover:underline">{w.name}</Link>
                </CardTitle>
                <WindowStatusBadge status={w.status} />
              </div>
              {w.description && <CardDescription>{w.description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {formatDateTime(w.startsAt)} – {formatDateTime(w.endsAt)}
              </p>
              {canEnroll && <WindowProgress window={w} />}
              {w.enrollments.length > 0 && (
                <p className="text-sm" data-testid="window-enrollments">
                  <span className="text-muted-foreground">Zapsáno: </span>
                  {w.enrollments.map((e) => e.subjectName).join(", ")}
                </p>
              )}
              <WindowActionButton window={w} canEnroll={canEnroll} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
