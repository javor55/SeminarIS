import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getViewerContext, windowsForViewerWhere } from "@/modules/seminars/eligibility";
import type { User } from "@/lib/types";
import type { MySubjectsSection } from "@/modules/server-types";
import { can } from "@/modules/registry";

const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

/** Učitel: výskyty v zápisech, které vede (nesmazané bloky a výskyty), s obsazeností. */
async function TeacherSection({ user }: { user: User }) {
  const occurrences = await prisma.subjectOccurrence.findMany({
    where: { teacherId: user.id, deletedAt: null, block: { deletedAt: null } },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      block: { select: { name: true, enrollmentWindow: { select: { id: true, name: true, startsAt: true } } } },
      _count: { select: { studentEnrollments: { where: { deletedAt: null } } } },
    },
  });
  if (occurrences.length === 0) return <p className="text-sm text-muted-foreground">Nevedete žádný seminář v zápisech.</p>;
  occurrences.sort((a, b) => b.block.enrollmentWindow.startsAt.getTime() - a.block.enrollmentWindow.startsAt.getTime() || a.subject.name.localeCompare(b.subject.name, "cs"));
  const canOpen = can(user.role, "seminars.windows.view");
  return (
    <ul className="divide-y rounded-md border text-sm" data-testid="my-seminar-occurrences">
      {occurrences.map((o) => {
        const w = o.block.enrollmentWindow;
        const enrolled = o._count.studentEnrollments;
        return (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="my-seminar-occurrence">
            <span>
              <Link href={`/subjects/${o.subject.id}`} className="font-medium hover:underline">{o.subject.name}</Link>
              <span className="text-muted-foreground"> – {canOpen ? <Link href={`/enrollments/${w.id}`} className="hover:underline">{w.name}</Link> : w.name}, {o.block.name}</span>
            </span>
            <span className="text-xs text-muted-foreground">zapsáno {enrolled}/{o.capacity ?? "∞"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Student: semináře, na které je zapsaný – jen ze zápisů, které smí vidět (zveřejněné, je v publiku). */
async function StudentSection({ user }: { user: User }) {
  const ctx = await getViewerContext(user);
  const enrollmentWindow: Prisma.EnrollmentWindowWhereInput = ctx
    ? windowsForViewerWhere(ctx)
    : {};
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: user.id, deletedAt: null, subjectOccurrence: { deletedAt: null, block: { deletedAt: null, enrollmentWindow } } },
    include: {
      subjectOccurrence: {
        include: {
          subject: { select: { id: true, name: true } },
          teacher: { select: { firstName: true, lastName: true } },
          block: { select: { name: true, enrollmentWindow: { select: { name: true, startsAt: true } } } },
        },
      },
    },
  });
  if (enrollments.length === 0) return <p className="text-sm text-muted-foreground">Nejste zapsáni na žádný seminář.</p>;
  enrollments.sort((a, b) => b.subjectOccurrence.block.enrollmentWindow.startsAt.getTime() - a.subjectOccurrence.block.enrollmentWindow.startsAt.getTime());
  return (
    <ul className="divide-y rounded-md border text-sm" data-testid="my-seminar-enrollments">
      {enrollments.map((e) => {
        const o = e.subjectOccurrence;
        return (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="my-seminar-enrollment">
            <span>
              <Link href={`/subjects/${o.subject.id}`} className="font-medium hover:underline">{o.subject.name}</Link>
              <span className="text-muted-foreground"> – {o.block.enrollmentWindow.name}, {o.block.name}</span>
            </span>
            <span className="text-xs text-muted-foreground">{o.teacher ? fullName(o.teacher) : "vyučující neuveden"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export async function getSeminarsMySubjectsSections(user: User): Promise<MySubjectsSection[]> {
  if (user.role === "STUDENT" && can(user.role, "seminars.enroll.self")) {
    return [{ id: "student", title: "Moje semináře", description: "Semináře, na které jste zapsáni.", order: 100, content: <StudentSection user={user} /> }];
  }
  if (can(user.role, "seminars.windows.view")) {
    return [{ id: "teacher", title: "Semináře, které vedu", description: "Výskyty předmětů v zápisových oknech, u kterých jste uveden jako vyučující.", order: 100, content: <TeacherSection user={user} /> }];
  }
  return [];
}
