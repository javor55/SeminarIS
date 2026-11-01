import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatRemaining } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import type { User } from "@/lib/types";
import { can } from "@/modules/registry";
import type { DashboardCard, DashboardHighlight } from "@/modules/server-types";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
import { Progress } from "@/components/ui/progress";
import { liveWindowWhere, openWindowWhere, windowPhase, type WindowPhaseInput } from "@/modules/seminars/window-phase";
import { computeUnenrolled } from "@/modules/seminars/unenrolled";
import { listStudentWindows } from "@/modules/seminars/student-windows";
import { windowDeadlineText, WindowActionButton, WindowProgress, WindowStatusBadge } from "@/modules/seminars/components/student/window-summary";

// Karty dashboardu modulu Semináře (F8). Student a host jen vidí přehled a odkazují na stránku Zápisy;
// učitel a admin sledují průběh zápisu a odkazují na detail okna v /enrollments.


/** Student a host: otevřená / blížící se okna, po uzavření zapsané semináře z posledního okna. */
async function studentCards(user: User): Promise<DashboardCard[]> {
  const windows = await listStudentWindows(user);
  if (windows.length === 0) return [];
  const canEnroll = can(user.role, "seminars.enroll.self");
  const current = windows.filter((w) => w.status !== "CLOSED");

  if (current.length > 0) {
    return [
      {
        id: "windows",
        title: "Zápis seminářů",
        order: 10,
        size: "md",
        href: "/zapisy",
        linkLabel: "Všechny zápisy",
        content: (
          <ul className="space-y-4" data-testid="dashboard-windows">
            {current.map((w) => (
              <li key={w.id} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0" data-testid="dashboard-window" data-window={w.id} data-status={w.status}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/zapisy/${w.id}`} className="font-medium hover:underline">{w.name}</Link>
                  <WindowStatusBadge status={w.status} />
                </div>
                <p className="text-sm text-muted-foreground">{windowDeadlineText(w)}</p>
                {canEnroll && <WindowProgress window={w} />}
                <WindowActionButton window={w} canEnroll={canEnroll} />
              </li>
            ))}
          </ul>
        ),
      },
    ];
  }

  // Nic neběží: ukázat, na co je student zapsaný v posledním uzavřeném zápisu
  const last = windows[0];
  return [
    {
      id: "windows",
      title: "Zápis seminářů",
      order: 10,
      size: "md",
      href: `/zapisy/${last.id}`,
      linkLabel: "Zobrazit zápis",
      content: (
        <div className="space-y-2 text-sm" data-testid="dashboard-closed-window" data-window={last.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{last.name}</span>
            <WindowStatusBadge status={last.status} />
          </div>
          {last.enrollments.length === 0 ? (
            <p className="text-muted-foreground">{canEnroll ? "Nemáte zapsaný žádný seminář." : "Zápis skončil."}</p>
          ) : (
            <ul className="divide-y rounded-md border" data-testid="dashboard-enrolled">
              {last.enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="font-medium">{e.subjectName}</span>
                  <span className="text-muted-foreground">{e.blockName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
  ];
}

/** Okno, které se právě zapisuje nebo se blíží (stav se vždy odvozuje z dat okna). */
function liveStatus(w: WindowPhaseInput): "OPEN" | "SCHEDULED" | null {
  const { phase } = windowPhase(w);
  return phase === "OPEN" ? "OPEN" : phase === "PLANNED" ? "SCHEDULED" : null;
}

/** Věta do pásu „Nejbližší“ o jednom zápisovém okně, ve kterém učitel vypisuje semináře. */
function highlightFor(
  g: { window: { id: string; name: string; startsAt: Date; endsAt: Date }; live: "OPEN" | "SCHEDULED"; items: { capacity: number | null; subject: { name: string }; _count: { studentEnrollments: number } }[] },
  missing: number | null | undefined,
  user: User,
  index: number
): DashboardHighlight {
  const href = can(user.role, "seminars.windows.view") ? `/enrollments/${g.window.id}` : undefined;
  const count = g.items.length;
  if (g.live === "SCHEDULED") {
    return {
      id: `window-${g.window.id}`,
      order: 30 + index,
      tone: "info",
      icon: "chart",
      title: `${g.window.name}: zápis začíná ${formatDateTime(g.window.startsAt)}`,
      text: `vypisujete ${count} ${plural(count, "seminář", "semináře", "seminářů")}`,
      href,
    };
  }
  const one = count === 1 ? g.items[0] : null;
  const mine = one
    ? `Váš seminář ${one.subject.name} má ${one.capacity == null ? `${one._count.studentEnrollments} zapsaných` : `${one._count.studentEnrollments} z ${one.capacity} míst`}`
    : `Vypisujete ${count} ${plural(count, "seminář", "semináře", "seminářů")}, zapsáno ${g.items.reduce((n, o) => n + o._count.studentEnrollments, 0)}`;
  return {
    id: `window-${g.window.id}`,
    order: 30 + index,
    tone: "success",
    icon: "chart",
    title: `${g.window.name}: zápis běží`,
    text: `${mine}, končí za ${formatRemaining(g.window.endsAt.getTime() - Date.now())}${missing != null && missing > 0 ? ` · nezapsáno ${missing} ${plural(missing, "student", "studenti", "studentů")}` : ""}`,
    href,
  };
}

/** Učitel (a admin, který nějaký seminář vede): moje výskyty v otevřených a blížících se oknech. */
async function myOccurrencesCard(user: User): Promise<DashboardCard | null> {
  const occurrences = await prisma.subjectOccurrence.findMany({
    where: {
      teacherId: user.id,
      deletedAt: null,
      block: { deletedAt: null, enrollmentWindow: liveWindowWhere() },
    },
    select: {
      id: true,
      capacity: true,
      subject: { select: { id: true, name: true } },
      block: { select: { name: true, enrollmentWindow: { select: { id: true, name: true, published: true, closedEarlyAt: true, startsAt: true, endsAt: true } } } },
      _count: { select: { studentEnrollments: { where: { deletedAt: null } } } },
    },
  });
  type Group = { window: (typeof occurrences)[number]["block"]["enrollmentWindow"]; live: "OPEN" | "SCHEDULED"; items: typeof occurrences };
  const groups = new Map<string, Group>();
  for (const o of occurrences) {
    const w = o.block.enrollmentWindow;
    const live = liveStatus(w);
    if (!live) continue;
    const g = groups.get(w.id) ?? { window: w, live, items: [] };
    g.items.push(o);
    groups.set(w.id, g);
  }
  if (groups.size === 0) return null;
  const list = [...groups.values()].sort((a, b) => a.window.endsAt.getTime() - b.window.endsAt.getTime());
  // Průběh zápisu (kolik studentů ještě nemá hotovo) jen u otevřených oken; počet oken je malý a omezený
  const unenrolled = new Map(
    await Promise.all(list.filter((g) => g.live === "OPEN").map(async (g) => [g.window.id, (await computeUnenrolled(g.window.id))?.students.length ?? null] as const))
  );
  return {
    id: "my-occurrences",
    title: "Moje semináře v zápisu",
    order: 20,
    size: "md",
    content: (
      <div className="space-y-4" data-testid="dashboard-my-occurrences">
        {list.map((g) => {
          const missing = unenrolled.get(g.window.id);
          const canOpen = can(user.role, "seminars.windows.view");
          return (
            <div key={g.window.id} className="space-y-2" data-window={g.window.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {canOpen ? <Link href={`/enrollments/${g.window.id}`} className="font-medium hover:underline">{g.window.name}</Link> : <span className="font-medium">{g.window.name}</span>}
                <WindowStatusBadge status={g.live} />
              </div>
              <p className="text-xs text-muted-foreground">
                {g.live === "OPEN" ? `Do ${formatDateTime(g.window.endsAt)}` : `Otevře se ${formatDateTime(g.window.startsAt)}`}
                {missing != null && ` · nezapsáno ${missing} ${plural(missing, "student", "studenti", "studentů")}`}
              </p>
              <ul className="divide-y rounded-md border text-sm">
                {g.items
                  .sort((a, b) => a.subject.name.localeCompare(b.subject.name, "cs"))
                  .map((o) => (
                    <li key={o.id} className="space-y-1.5 px-3 py-2" data-testid="dashboard-my-occurrence">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <Link href={`/subjects/${o.subject.id}`} className="font-medium hover:underline">{o.subject.name}</Link>
                          <span className="text-muted-foreground"> – {o.block.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">zapsáno {o._count.studentEnrollments}/{o.capacity ?? "∞"}</span>
                      </div>
                      {o.capacity != null && <Meter value={o._count.studentEnrollments} max={o.capacity} label={`Obsazeno ${o._count.studentEnrollments} z ${o.capacity} míst`} />}
                    </li>
                  ))}
              </ul>
              {canOpen && (
                <Link href={`/enrollments/${g.window.id}`} className="inline-block text-sm font-medium underline underline-offset-4">
                  Seznam zapsaných studentů
                </Link>
              )}
            </div>
          );
        })}
      </div>
    ),
    highlights: list.map((g, i) => highlightFor(g, unenrolled.get(g.window.id), user, i)),
  };
}

/** Admin: průběh otevřených zápisů (zapsáno / nezapsaní). */
async function progressCard(): Promise<DashboardCard | null> {
  const open = await prisma.enrollmentWindow.findMany({
    where: openWindowWhere(),
    orderBy: { endsAt: "asc" },
    select: { id: true, name: true, endsAt: true },
  });
  if (open.length === 0) return null;
  const overviews = await Promise.all(open.map((w) => computeUnenrolled(w.id)));
  return {
    id: "progress",
    title: "Průběh otevřených zápisů",
    order: 10,
    size: "md",
    highlights: open.flatMap((w, i) => {
      const missing = overviews[i]?.students.length ?? 0;
      if (missing === 0) return [];
      return [
        {
          id: `missing-${w.id}`,
          order: 40 + i,
          tone: "attention" as const,
          icon: "people" as const,
          title: `${w.name}: chybí dokončit ${missing} ${plural(missing, "student", "studenti", "studentů")}`,
          text: `zápis končí za ${formatRemaining(w.endsAt.getTime() - Date.now())}`,
          href: `/enrollments/${w.id}`,
        },
      ];
    }),
    content: (
      <ul className="space-y-4" data-testid="dashboard-progress">
        {open.map((w, i) => {
          const o = overviews[i];
          const total = o?.audienceCount ?? 0;
          const missing = o?.students.length ?? 0;
          const done = total - missing;
          return (
            <li key={w.id} className="space-y-1.5" data-testid="dashboard-progress-window" data-window={w.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/enrollments/${w.id}`} className="font-medium hover:underline">{w.name}</Link>
                <Badge variant={missing === 0 ? "success" : "warning"}>
                  {missing === 0 ? "všichni hotovo" : `nezapsáno ${missing}`}
                </Badge>
              </div>
              <Progress value={total === 0 ? 100 : Math.round((done / total) * 100)} className="h-2" aria-label={`Zapsáno ${done} z ${total}`} />
              <p className="text-xs text-muted-foreground">
                Hotovo {done} z {total} {plural(total, "studenta", "studentů", "studentů")} · konec {formatDateTime(w.endsAt)}
              </p>
            </li>
          );
        })}
      </ul>
    ),
  };
}

export async function getSeminarsDashboardCards(user: User): Promise<DashboardCard[]> {
  if (can(user.role, "seminars.enroll.view")) return studentCards(user);
  if (!can(user.role, "seminars.windows.view")) return [];
  const [mine, progress] = await Promise.all([myOccurrencesCard(user), can(user.role, "seminars.windows.manage") ? progressCard() : null]);
  return [mine, progress].filter((c): c is DashboardCard => c !== null);
}
