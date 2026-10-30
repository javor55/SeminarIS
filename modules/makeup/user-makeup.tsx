import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimeRange } from "@/lib/datetime";
import { ATTENDANCE_LABELS } from "@/modules/makeup/types";

type Scope = {
  // správce vidí vše, učitel jen termíny, které dozoruje, a písemky, které učí
  all: boolean;
  viewerId: string;
};

/** Záložka „Dopisování“ v detailu uživatele: zápisy studenta s docházkou, u učitele dozorované termíny. */
export async function UserMakeupPanel({ userId, role, scope }: { userId: string; role: string; scope: Scope }) {
  const registrations =
    role === "STUDENT" || role === "GUEST"
      ? await prisma.makeupRegistration.findMany({
          where: {
            studentId: userId,
            ...(scope.all ? {} : { OR: [{ session: { teacherId: scope.viewerId } }, { subjects: { some: { subjectTeacherId: scope.viewerId } } }] }),
          },
          include: { session: true, subjects: { include: { subject: true } } },
          orderBy: { session: { startsAt: "desc" } },
          take: 100,
        })
      : [];
  // Dozorované termíny jen u učitele a admina; učitel vidí jen vlastní
  const supervised =
    (role === "TEACHER" || role === "ADMIN") && (scope.all || scope.viewerId === userId)
      ? await prisma.makeupSession.findMany({
          where: { teacherId: userId },
          include: { _count: { select: { registrations: true } } },
          orderBy: { startsAt: "desc" },
          take: 100,
        })
      : [];

  return (
    <div className="space-y-6" data-testid="user-makeup">
      {(role === "STUDENT" || role === "GUEST") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Zápisy na dopisování</CardTitle>
            <CardDescription>Termíny, na které je student zapsaný, a docházka.{!scope.all && " Zobrazují se jen termíny, které dozorujete, nebo vaše předměty."}</CardDescription>
          </CardHeader>
          <CardContent>
            {registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné zápisy na dopisování.</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {registrations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="user-makeup-registration" data-attendance={r.attendance}>
                    <span>
                      <strong>{formatTimeRange(r.session.startsAt, r.session.endsAt)}</strong>, učebna {r.session.room}
                      <span className="text-muted-foreground"> – {r.subjects.map((s) => s.subject.name).join(", ") || "bez předmětu"}</span>
                    </span>
                    {r.session.cancelledAt ? <Badge variant="destructive">termín zrušen</Badge> : <Badge variant={r.attendance === "ATTENDED" ? "default" : "outline"}>{ATTENDANCE_LABELS[r.attendance]}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {(role === "TEACHER" || role === "ADMIN") && (scope.all || scope.viewerId === userId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dozorované termíny</CardTitle>
            <CardDescription>Termíny dopisování, které uživatel dozoruje.</CardDescription>
          </CardHeader>
          <CardContent>
            {supervised.length === 0 ? (
              <p className="text-sm text-muted-foreground">Uživatel nedozoruje žádný termín.</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {supervised.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="user-makeup-session">
                    <Link href={`/makeup/sessions/${s.id}`} className="hover:underline">
                      <strong>{formatTimeRange(s.startsAt, s.endsAt)}</strong>, učebna {s.room}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      zapsáno {s._count.registrations}/{s.capacity}
                      {s.cancelledAt && " · zrušeno"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
