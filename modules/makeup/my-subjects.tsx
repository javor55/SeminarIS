import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import type { MySubjectsSection } from "@/modules/server-types";
import { Badge } from "@/components/ui/badge";
import { formatTimeRange } from "@/lib/datetime";
import { classLabel } from "@/lib/school";
import { can } from "@/modules/registry";
import { ATTENDANCE_LABELS } from "@/modules/makeup/types";
import { fullName } from "@/modules/makeup/data";

const RECENT_DAYS = 60;
const sinceDate = () => new Date(Date.now() - RECENT_DAYS * 24 * 3600_000);

/** Student: jeho zápisy na dopisování (nadcházející a z posledních 60 dní). */
async function StudentSection({ user }: { user: User }) {
  const regs = await prisma.makeupRegistration.findMany({
    where: { studentId: user.id, session: { endsAt: { gte: sinceDate() } } },
    include: { session: true, subjects: { include: { subject: true } } },
    orderBy: { session: { startsAt: "asc" } },
  });
  if (regs.length === 0) return <p className="text-sm text-muted-foreground">Nemáte žádný zápis na dopisování. Termíny najdete v sekci <Link href="/makeup" className="underline">Dopisování</Link>.</p>;
  return (
    <ul className="divide-y rounded-md border text-sm" data-testid="my-makeup-registrations">
      {regs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="my-makeup-registration">
          <span>
            <strong>{formatTimeRange(r.session.startsAt, r.session.endsAt)}</strong>, učebna {r.session.room}
            <span className="text-muted-foreground"> – {r.subjects.map((x) => x.subject.name).join(", ") || "bez předmětu"}</span>
          </span>
          {r.session.cancelledAt ? <Badge variant="destructive">termín zrušen</Badge> : <Badge variant="outline">{ATTENDANCE_LABELS[r.attendance]}</Badge>}
        </li>
      ))}
    </ul>
  );
}

/** Učitel: kdo dopisuje písemky jeho předmětů (podle úvazků), seskupeno podle předmětu. */
async function TeacherSection({ user }: { user: User }) {
  const rows = await prisma.makeupRegistrationSubject.findMany({
    where: { subjectTeacherId: user.id, registration: { session: { endsAt: { gte: sinceDate() } } } },
    include: {
      subject: true,
      registration: { include: { student: { include: { classGroup: true } }, session: true } },
    },
    orderBy: { registration: { session: { startsAt: "asc" } } },
  });
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nikdo teď nedopisuje písemky vašich předmětů.</p>;
  const bySubject = new Map<string, { id: string; name: string; rows: typeof rows }>();
  for (const r of rows) {
    const g = bySubject.get(r.subjectId) ?? { id: r.subjectId, name: r.subject.name, rows: [] };
    g.rows.push(r);
    bySubject.set(r.subjectId, g);
  }
  return (
    <div className="space-y-4" data-testid="my-makeup-students">
      {[...bySubject.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "cs"))
        .map((g) => (
          <div key={g.id} data-subject={g.id}>
            <h3 className="mb-1 text-sm font-semibold">
              <Link href={`/subjects/${g.id}?tab=makeup.sessions`} className="hover:underline">{g.name}</Link>
            </h3>
            <ul className="divide-y rounded-md border text-sm">
              {g.rows.map((r) => (
                <li key={r.registrationId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="my-makeup-student">
                  <span>
                    {fullName(r.registration.student)}
                    {r.registration.student.classGroup ? ` (${classLabel(r.registration.student.classGroup)})` : ""}
                    <span className="text-muted-foreground"> – {formatTimeRange(r.registration.session.startsAt, r.registration.session.endsAt)}, učebna {r.registration.session.room}</span>
                  </span>
                  <Badge variant="outline">{ATTENDANCE_LABELS[r.registration.attendance]}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

export async function getMakeupMySubjectsSections(user: User): Promise<MySubjectsSection[]> {
  if (can(user.role, "makeup.register")) {
    return [{ id: "student", title: "Moje dopisování", description: "Termíny dopisování, na které jste zapsáni.", order: 120, content: <StudentSection user={user} /> }];
  }
  if (can(user.role, "makeup.subjectTeacher")) {
    return [
      {
        id: "teacher",
        title: "Kdo dopisuje moje předměty",
        description: "Studenti zapsaní na dopisování písemek předmětů, které učíte (nadcházející a z posledních 60 dní).",
        order: 120,
        content: <TeacherSection user={user} />,
      },
    ];
  }
  return [];
}
