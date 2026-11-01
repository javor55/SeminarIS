import { roomText } from "@/lib/room";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { classLabel } from "@/lib/school";
import { formatDateTime, formatDayRelative, formatTime, formatTimeRange, startOfSchoolDay } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import type { DashboardCard } from "@/modules/server-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionFormDialog } from "@/modules/makeup/components/SessionFormDialog";
import { changeDeadlineOf, fullName } from "@/modules/makeup/data";

// Karty dashboardu modulu Dopisování (F8): student své zápisy a volné termíny, učitel dozory a kdo mu dopisuje,
// admin dnešní a zítřejší termíny. Každý dotaz je jeden `findMany` bez smyčky přes položky.

const upcoming = () => ({ endsAt: { gte: new Date() }, cancelledAt: null });

/** Student: nadcházející zápisy a počet termínů, kam se ještě dá zapsat. */
async function studentCard(user: User): Promise<DashboardCard | null> {
  const now = new Date();
  const [regs, open] = await Promise.all([
    prisma.makeupRegistration.findMany({
      where: { studentId: user.id, session: { endsAt: { gte: now } } },
      include: { session: true, subjects: { include: { subject: true } } },
      orderBy: { session: { startsAt: "asc" } },
      take: 5,
    }),
    prisma.makeupSession.findMany({
      where: { ...upcoming(), startsAt: { gte: now } },
      select: {
        capacity: true,
        startsAt: true,
        changeDeadlineMinutes: true,
        _count: { select: { registrations: true } },
        registrations: { where: { studentId: user.id }, select: { id: true } },
      },
    }),
  ]);
  // Volné: neodvolaný termín, kde nejsem zapsaný, ještě neprošla uzávěrka a je místo
  const free = open.filter((s) => s.registrations.length === 0 && changeDeadlineOf(s) > now && s._count.registrations < s.capacity).length;
  if (regs.length === 0 && free === 0) return null;
  return {
    id: "student",
    title: "Dopisování",
    order: 20,
    size: "md",
    href: "/makeup",
    linkLabel: "Dopisování",
    content: (
      <div className="space-y-3" data-testid="makeup-widget">
        {regs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nemáte zapsaný žádný termín dopisování.</p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="dashboard-makeup-registrations">
            {regs.map((r) => (
              <li key={r.id} className={r.session.cancelledAt ? "text-danger" : ""} data-testid="dashboard-makeup-registration">
                <strong>{formatTimeRange(r.session.startsAt, r.session.endsAt)}</strong>, {roomText(r.session.room)}
                {" – "}
                {r.subjects.map((x) => x.subject.name).join(", ") || "bez předmětu"}
                {r.session.cancelledAt ? (
                  " (termín zrušen – přepište se jinam)"
                ) : (
                  <span className="text-muted-foreground"> · změny do {formatDateTime(changeDeadlineOf(r.session))}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground" data-testid="dashboard-makeup-free">
          {free === 0 ? "Teď nejsou volné žádné další termíny." : `Volných termínů: ${free}`}
        </p>
      </div>
    ),
  };
}

/** Kolik studentů se u termínu ukáže přímo v kartě (zbytek je v detailu termínu). */
const STUDENTS_SHOWN = 3;

/** „6 studentů, 2 mají poznámku“ */
function studentsSummary(count: number, withNote: number): string {
  if (count === 0) return "zatím se nikdo nepřihlásil";
  const base = `${count} ${plural(count, "student", "studenti", "studentů")}`;
  if (withNote === 0) return base;
  return `${base}, ${withNote} ${withNote === 1 ? "má poznámku" : withNote < 5 ? "mají poznámku" : "má poznámku"}`;
}

/** Učitel (i admin): moje nadcházející termíny dopisování i se jmény přihlášených, jejich předměty a poznámkami. */
async function supervisionCard(user: User): Promise<DashboardCard | null> {
  const sessions = await prisma.makeupSession.findMany({
    where: { ...upcoming(), teacherId: user.id },
    include: {
      registrations: {
        orderBy: { createdAt: "asc" },
        include: { student: { include: { classGroup: true } }, subjects: { include: { subject: { select: { name: true } } } } },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  if (sessions.length === 0) return null;
  const first = sessions[0];
  const firstNotes = first.registrations.filter((r) => r.note).length;
  const now = new Date();
  return {
    id: "supervision",
    title: "Moje termíny dopisování",
    order: 10,
    size: "md",
    href: "/makeup",
    linkLabel: "Všechny termíny",
    highlights: [
      {
        id: "next-session",
        order: 10,
        tone: "attention",
        icon: "clock",
        title: `${formatDayRelative(first.startsAt, now)} ${formatTime(first.startsAt)} dopisování`,
        text: studentsSummary(first.registrations.length, firstNotes),
        href: `/makeup/sessions/${first.id}`,
      },
    ],
    content: (
      <div className="space-y-3" data-testid="makeup-widget">
        <ul className="space-y-3 text-sm">
          {sessions.map((s) => {
            const shown = s.registrations.slice(0, STUDENTS_SHOWN);
            const rest = s.registrations.length - shown.length;
            return (
              <li key={s.id} className="space-y-2 rounded-lg border p-3" data-testid="dashboard-makeup-session" data-session={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <Link href={`/makeup/sessions/${s.id}`} className="font-semibold hover:underline">
                      {formatTimeRange(s.startsAt, s.endsAt)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {roomText(s.room)} · přihlášeno {s.registrations.length} z {s.capacity} · uzávěrka {formatTime(changeDeadlineOf(s))}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/makeup/sessions/${s.id}`}>Detail</Link>
                  </Button>
                </div>
                {shown.length > 0 && (
                  <ul className="divide-y">
                    {shown.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5" data-testid="dashboard-session-student">
                        <span className="font-medium">{fullName(r.student)}</span>
                        {r.student.classGroup && <span className="text-xs text-muted-foreground">{classLabel(r.student.classGroup)}</span>}
                        {r.subjects.map((x) => (
                          <Badge key={x.subjectId} variant="secondary" className="font-normal">{x.subject.name}</Badge>
                        ))}
                        {r.note && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{r.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {rest > 0 && (
                  <Link href={`/makeup/sessions/${s.id}`} className="text-xs text-muted-foreground underline underline-offset-2">
                    + {rest} další
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <SessionFormDialog trigger={<Button size="sm" variant="outline" data-testid="dashboard-new-session">+ Vypsat termín dopisování</Button>} />
      </div>
    ),
  };
}

/** Učitel: kdo v nadcházejících termínech dopisuje písemky mých předmětů (podle úvazků). */
async function whoWritesCard(user: User): Promise<DashboardCard | null> {
  const rows = await prisma.makeupRegistrationSubject.findMany({
    where: { subjectTeacherId: user.id, registration: { session: upcoming() } },
    include: {
      subject: { select: { id: true, name: true } },
      registration: { include: { student: { include: { classGroup: true } }, session: true } },
    },
    orderBy: { registration: { session: { startsAt: "asc" } } },
    take: 8,
  });
  if (rows.length === 0) return null;
  return {
    id: "who-writes",
    title: "Kdo u mě dopisuje",
    order: 15,
    size: "md",
    href: "/subjects/mine",
    linkLabel: "Moje předměty",
    content: (
      <ul className="space-y-2 text-sm" data-testid="dashboard-makeup-students">
        {rows.map((r) => (
          <li key={`${r.registrationId}-${r.subjectId}`} data-testid="dashboard-makeup-student">
            <strong>{fullName(r.registration.student)}</strong>
            {r.registration.student.classGroup ? ` (${classLabel(r.registration.student.classGroup)})` : ""}
            <span className="text-muted-foreground">
              {" "}
              – {r.subject.name}, {formatTimeRange(r.registration.session.startsAt, r.registration.session.endsAt)}, {roomText(r.registration.session.room)}
            </span>
          </li>
        ))}
      </ul>
    ),
  };
}

/** Admin: termíny dopisování dnes a zítra (den ve školním pásmu). */
async function todayTomorrowCard(): Promise<DashboardCard> {
  const from = startOfSchoolDay();
  const mid = startOfSchoolDay(new Date(), 1);
  const to = startOfSchoolDay(new Date(), 2);
  const sessions = await prisma.makeupSession.findMany({
    where: { cancelledAt: null, startsAt: { gte: from, lt: to } },
    include: { teacher: { select: { firstName: true, lastName: true } }, _count: { select: { registrations: true } } },
    orderBy: { startsAt: "asc" },
  });
  const days = [
    { label: "Dnes", items: sessions.filter((s) => s.startsAt < mid) },
    { label: "Zítra", items: sessions.filter((s) => s.startsAt >= mid) },
  ];
  // Do pásu „Nejbližší“ jde první den, ve kterém nějaký termín je
  const lead = days[0].items.length > 0 ? days[0] : days[1];
  return {
    id: "today",
    title: "Dopisování dnes a zítra",
    order: 20,
    size: "md",
    href: "/makeup",
    linkLabel: "Dopisování",
    highlights:
      sessions.length === 0
        ? []
        : [
            {
              id: "today",
              order: 15,
              tone: "info",
              icon: "clock",
              title: `${lead.label} ${lead.items.length} ${plural(lead.items.length, "termín", "termíny", "termínů")} dopisování`,
              text: `nejbližší ${formatTime(sessions[0].startsAt)}, ${roomText(sessions[0].room)}, zapsáno ${sessions[0]._count.registrations}/${sessions[0].capacity}`,
              href: `/makeup/sessions/${sessions[0].id}`,
            },
          ],
    content: (
      <div className="space-y-3 text-sm" data-testid="dashboard-makeup-days">
        {days.map((d) => (
          <div key={d.label} data-day={d.label}>
            <h3 className="mb-1 flex items-center gap-2 font-semibold">
              {d.label} <Badge variant="muted">{d.items.length} {plural(d.items.length, "termín", "termíny", "termínů")}</Badge>
            </h3>
            {d.items.length > 0 && (
              <ul className="space-y-1">
                {d.items.map((s) => (
                  <li key={s.id} data-testid="dashboard-makeup-session">
                    <Link href={`/makeup/sessions/${s.id}`} className="hover:underline">
                      <strong>{formatTime(s.startsAt)}–{formatTime(s.endsAt)}</strong>, {roomText(s.room)}, {fullName(s.teacher)} – zapsáno {s._count.registrations}/{s.capacity}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    ),
  };
}

export async function getMakeupDashboardCards(user: User): Promise<DashboardCard[]> {
  const cards = await Promise.all([
    can(user.role, "makeup.register") ? studentCard(user) : null,
    can(user.role, "makeup.sessions.manage") ? supervisionCard(user) : null,
    can(user.role, "makeup.subjectTeacher") ? whoWritesCard(user) : null,
    can(user.role, "makeup.sessions.manageAll") ? todayTomorrowCard() : null,
  ]);
  return cards.filter((c): c is DashboardCard => c !== null);
}
