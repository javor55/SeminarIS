import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { computeEnrollmentStatus } from "@/lib/utils";

/** Záložka „Zápisy“ v detailu uživatele: zápisy studenta do seminářů po zápisových oknech (od nejnovějšího). */
export async function UserEnrollmentsPanel({ userId, canOpenWindows }: { userId: string; canOpenWindows: boolean }) {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: userId, deletedAt: null },
    include: {
      subjectOccurrence: { include: { subject: true, block: { include: { enrollmentWindow: true } } } },
    },
  });

  const windows = new Map<string, { window: (typeof enrollments)[number]["subjectOccurrence"]["block"]["enrollmentWindow"]; items: typeof enrollments }>();
  for (const e of enrollments) {
    const w = e.subjectOccurrence.block.enrollmentWindow;
    const entry = windows.get(w.id) ?? { window: w, items: [] };
    entry.items.push(e);
    windows.set(w.id, entry);
  }
  const sorted = [...windows.values()].sort((a, b) => b.window.startsAt.getTime() - a.window.startsAt.getTime());

  return (
    <Card data-testid="user-enrollments">
      <CardHeader>
        <CardTitle className="text-lg">Zápisy seminářů</CardTitle>
        <CardDescription>Na co je uživatel zapsaný, po zápisových oknech.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sorted.length === 0 && <p className="text-sm text-muted-foreground">Uživatel zatím nemá žádné zápisy.</p>}
        {sorted.map(({ window: w, items }) => {
          const status = computeEnrollmentStatus(w.status, w.startsAt, w.endsAt);
          return (
            <div key={w.id} className="space-y-2" data-testid="user-enrollment-window" data-window={w.name}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {canOpenWindows ? (
                    <Link href={`/enrollments/${w.id}`} className="hover:underline">{w.name}</Link>
                  ) : (
                    w.name
                  )}
                </h3>
                <Badge variant="outline">{status.label}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(w.startsAt)} – {formatDateTime(w.endsAt)}</span>
              </div>
              <ul className="divide-y rounded-md border text-sm">
                {items
                  .sort((a, b) => a.subjectOccurrence.block.order - b.subjectOccurrence.block.order)
                  .map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2" data-testid="user-enrollment">
                      <span>
                        <Link href={`/subjects/${e.subjectOccurrence.subjectId}`} className="font-medium hover:underline">{e.subjectOccurrence.subject.name}</Link>
                        {e.subjectOccurrence.subCode && <span className="text-muted-foreground"> ({e.subjectOccurrence.subCode})</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{e.subjectOccurrence.block.name}</span>
                    </li>
                  ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
