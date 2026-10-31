import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { classLabel } from "@/lib/school";
import { formatDateTime, formatTime, formatTimeRange, startOfSchoolDay } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import type { DashboardCard } from "@/modules/server-types";
import { Badge } from "@/components/ui/badge";
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
                <strong>{formatTimeRange(r.session.startsAt, r.session.endsAt)}</strong>, učebna {r.session.room}
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

/** Učitel (i admin): moje nadcházející dozory. */
async function supervisionCard(user: User): Promise<DashboardCard | null> {
  const sessions = await prisma.makeupSession.findMany({
    where: { ...upcoming(), teacherId: user.id },
    include: { _count: { select: { registrations: true } } },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  if (sessions.length === 0) return null;
  return {
    id: "supervision",
    title: "Moje dozory dopisování",
    order: 10,
    size: "md",
    href: "/makeup",
    linkLabel: "Dopisování",
    content: (
      <ul className="space-y-2 text-sm" data-testid="makeup-widget">
        {sessions.map((s) => (
          <li key={s.id} data-testid="dashboard-makeup-session">
            <Link href={`/makeup/sessions/${s.id}`} className="hover:underline">
              <strong>{formatTimeRange(s.startsAt, s.endsAt)}</strong>, učebna {s.room} – zapsáno {s._count.registrations}/{s.capacity}
            </Link>
          </li>
        ))}
      </ul>
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
              – {r.subject.name}, {formatTimeRange(r.registration.session.startsAt, r.registration.session.endsAt)}, učebna {r.registration.session.room}
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
  return {
    id: "today",
    title: "Dopisování dnes a zítra",
    order: 20,
    size: "md",
    href: "/makeup",
    linkLabel: "Dopisování",
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
                      <strong>{formatTime(s.startsAt)}–{formatTime(s.endsAt)}</strong>, učebna {s.room}, {fullName(s.teacher)} – zapsáno {s._count.registrations}/{s.capacity}
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
