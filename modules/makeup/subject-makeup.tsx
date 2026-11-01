import { roomText } from "@/lib/room";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimeRange } from "@/lib/datetime";
import { classLabel } from "@/lib/school";
import { can } from "@/modules/registry";
import { ATTENDANCE_LABELS } from "@/modules/makeup/types";
import { canManageSession, fullName } from "@/modules/makeup/data";

const RECENT_DAYS = 60;

/**
 * Záložka „Dopisování“ v detailu předmětu: nadcházející a nedávné termíny s tímto předmětem a počty.
 * Kdo dopisuje a docházku vidí admin (vše) a učitel (termíny, které dozoruje, a studenty, kterým
 * dopisuje jeho předmět). Student vidí termíny a svůj vlastní zápis, ne jména ostatních.
 */
export async function SubjectMakeupPanel({ subjectId, viewer }: { subjectId: string; viewer: User }) {
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 3600_000);
  const sessions = await prisma.makeupSession.findMany({
    where: { subjects: { some: { subjectId } }, endsAt: { gte: since } },
    include: {
      teacher: { select: { firstName: true, lastName: true } },
      _count: { select: { registrations: true } },
      registrations: {
        where: { subjects: { some: { subjectId } } },
        include: {
          student: { select: { firstName: true, lastName: true, classGroup: true } },
          subjects: { where: { subjectId }, select: { subjectTeacherId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const rows = sessions.map((s) => {
    const manage = can(viewer.role, "makeup.sessions.manage") && canManageSession(viewer, s);
    // učitel, který session nedozoruje, vidí jen studenty, kterým dopisuje jeho předmět
    const visible = can(viewer.role, "makeup.sessions.manage")
      ? s.registrations.filter((r) => manage || r.subjects.some((x) => x.subjectTeacherId === viewer.id))
      : [];
    return { s, manage, visible, mine: s.registrations.find((r) => r.studentId === viewer.id) ?? null };
  });
  const upcoming = rows.filter((r) => r.s.endsAt >= now);
  const recent = rows.filter((r) => r.s.endsAt < now).reverse();
  const showPeople = can(viewer.role, "makeup.sessions.manage");

  const renderList = (list: typeof rows, testId: string) =>
    list.length === 0 ? (
      <p className="text-sm text-muted-foreground">Žádné termíny.</p>
    ) : (
      <ul className="divide-y rounded-md border text-sm" data-testid={testId}>
        {list.map(({ s, manage, visible, mine }) => (
          <li key={s.id} className="space-y-1 px-3 py-2" data-testid="subject-makeup-session" data-session={s.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={manage ? `/makeup/sessions/${s.id}` : "/makeup"} className="hover:underline">
                <strong>{formatTimeRange(s.startsAt, s.endsAt)}</strong>, {roomText(s.room)}
                <span className="text-muted-foreground"> – dozor {fullName(s.teacher)}</span>
              </Link>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {s.cancelledAt && <Badge variant="destructive">zrušeno</Badge>}
                {mine && <Badge variant="default">jste zapsán(a)</Badge>}
                <span data-testid="subject-makeup-counts">
                  zapsáno {s._count.registrations}/{s.capacity}, z toho na tento předmět {s.registrations.length}
                </span>
              </span>
            </div>
            {showPeople && visible.length > 0 && (
              <ul className="ml-4 list-disc text-xs text-muted-foreground" data-testid="subject-makeup-students">
                {visible.map((r) => (
                  <li key={r.id}>
                    {fullName(r.student)}
                    {r.student.classGroup ? ` (${classLabel(r.student.classGroup)})` : ""} – {ATTENDANCE_LABELS[r.attendance]}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6" data-testid="subject-makeup">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nadcházející termíny dopisování</CardTitle>
          <CardDescription>
            Termíny, na kterých lze dopisovat tento předmět.{showPeople ? " U termínů vidíte, kdo dopisuje a docházku (podle vašich oprávnění)." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>{renderList(upcoming, "subject-makeup-upcoming")}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nedávné termíny</CardTitle>
          <CardDescription>Za posledních {RECENT_DAYS} dní.</CardDescription>
        </CardHeader>
        <CardContent>{renderList(recent, "subject-makeup-recent")}</CardContent>
      </Card>
    </div>
  );
}
