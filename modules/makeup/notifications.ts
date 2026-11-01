import { roomBare, roomText } from "@/lib/room";
import { prisma } from "@/lib/prisma";
import { sendEventEmail, type EmailRecipient } from "@/lib/email";
import { formatDayShort, formatTimeRange, startOfSchoolDay } from "@/lib/datetime";
import { isEmailEventActive } from "@/lib/email/settings";
import type { DailyJobStep } from "@/modules/server-types";
import type { EmailEventId } from "@/lib/email/events";
import { formatName } from "@/lib/names";

// E-mailová upozornění modulu Dopisování. Volá se vždy PO commitu transakce, která změnu
// provedla; chyba odeslání akci nikdy neshodí (sendEventEmail výjimky nevyhazuje).

const displayName = (u: { firstName: string; lastName: string }) => formatName(u, "text");

const registrationMailInclude = {
  student: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true, studyStatus: true } },
  subjects: { include: { subject: { select: { name: true } } } },
} as const;

type SessionLike = { startsAt: Date; endsAt: Date; room: string; teacher: { firstName: string; lastName: string } };

function sessionVars(s: SessionLike) {
  return { termin: formatTimeRange(s.startsAt, s.endsAt), ucebna: roomBare(s.room), dozor: displayName(s.teacher) };
}

const subjectsText = (r: { subjects: { subject: { name: string } }[] }) =>
  r.subjects.map((x) => x.subject.name).sort((a, b) => a.localeCompare(b, "cs")).join(", ");

/** Termíny zrušeny: zapsaným studentům. Každý termín zvlášť (student může být zapsaný na víc termínů řady). */
export async function notifySessionsCancelled(sessionIds: string[], reason: string | null) {
  if (sessionIds.length === 0) return;
  const sessions = await prisma.makeupSession.findMany({
    where: { id: { in: sessionIds } },
    include: { teacher: { select: { firstName: true, lastName: true } }, registrations: { include: registrationMailInclude } },
    orderBy: { startsAt: "asc" },
  });
  for (const s of sessions) {
    await sendEventEmail(
      "makeup.session.cancelled",
      s.registrations.map((r) => ({
        email: r.student.email,
        userId: r.student.id,
        vars: { jmeno: r.student.firstName, ...sessionVars(s), predmety: subjectsText(r), duvod: reason?.trim() || "neuveden" },
      }))
    );
  }
}

/** Změna času nebo učebny termínu: zapsaným studentům. */
export async function notifySessionChanged(
  sessionId: string,
  before: { startsAt: Date; endsAt: Date; room: string }
) {
  const s = await prisma.makeupSession.findUnique({
    where: { id: sessionId },
    include: { teacher: { select: { firstName: true, lastName: true } }, registrations: { include: registrationMailInclude } },
  });
  if (!s || s.cancelledAt) return;
  const recipients: EmailRecipient[] = s.registrations.map((r) => ({
    email: r.student.email,
    userId: r.student.id,
    vars: {
      jmeno: r.student.firstName,
      ...sessionVars(s),
      predmety: subjectsText(r),
      puvodni_termin: formatTimeRange(before.startsAt, before.endsAt),
      puvodni_ucebna: roomBare(before.room),
    },
  }));
  await sendEventEmail("makeup.session.changed", recipients);
}

/** Dozor odepsal studenta z termínu. `snapshot` je zápis načtený před smazáním. */
export async function notifyRegistrationRemoved(
  snapshot: {
    student: { id: string; email: string; firstName: string };
    session: SessionLike;
    subjectNames: string[];
  },
  actor: { firstName: string; lastName: string }
) {
  await sendEventEmail("makeup.registration.removed", [
    {
      email: snapshot.student.email,
      userId: snapshot.student.id,
      vars: {
        jmeno: snapshot.student.firstName,
        ...sessionVars(snapshot.session),
        predmety: snapshot.subjectNames.join(", "),
        kym: displayName(actor),
      },
    },
  ]);
}

/** Dozor přesunul studenta na jiný termín. */
export async function notifyRegistrationMoved(
  registrationId: string,
  before: { startsAt: Date; endsAt: Date },
  actor: { firstName: string; lastName: string }
) {
  const r = await prisma.makeupRegistration.findUnique({
    where: { id: registrationId },
    include: { ...registrationMailInclude, session: { include: { teacher: { select: { firstName: true, lastName: true } } } } },
  });
  if (!r) return;
  await sendEventEmail("makeup.registration.moved", [
    {
      email: r.student.email,
      userId: r.student.id,
      vars: {
        jmeno: r.student.firstName,
        ...sessionVars(r.session),
        predmety: subjectsText(r),
        puvodni_termin: formatTimeRange(before.startsAt, before.endsAt),
        kym: displayName(actor),
      },
    },
  ]);
}

// === Denní úloha ===

/** Zítřejší (podle pásma školy) nezrušené termíny se zápisy. */
async function tomorrowSessions(now: Date) {
  return prisma.makeupSession.findMany({
    where: { cancelledAt: null, startsAt: { gte: startOfSchoolDay(now, 1), lt: startOfSchoolDay(now, 2) } },
    include: {
      teacher: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
      registrations: {
        include: {
          ...registrationMailInclude,
          subjects: { include: { subject: { select: { name: true } }, subjectTeacher: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } } } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });
}

const studentActive = (st: { isActive: boolean; studyStatus: string }) => st.isActive && st.studyStatus === "ACTIVE";

type TomorrowSession = Awaited<ReturnType<typeof tomorrowSessions>>[number];

/** Příjemci souhrnu: dozor termínu a vyučující předmětů zapsaných studentů. */
function digestRecipients(sessions: TomorrowSession[], datum: string): EmailRecipient[] {
  const byUser = new Map<string, { user: { id: string; email: string; firstName: string }; lines: string[] }>();
  const add = (u: { id: string; email: string; firstName: string; isActive: boolean }, line: string) => {
    if (!u.isActive) return;
    const entry = byUser.get(u.id) ?? { user: u, lines: [] };
    entry.lines.push(line);
    byUser.set(u.id, entry);
  };
  for (const s of sessions) {
    const regs = s.registrations.filter((r) => studentActive(r.student));
    if (regs.length === 0) continue;
    const when = `${formatTimeRange(s.startsAt, s.endsAt)}, ${roomText(s.room)}`;
    add(s.teacher, `${when} (dozor):\n${regs.map((r) => `  - ${displayName(r.student)}: ${subjectsText(r)}`).join("\n")}`);
    for (const r of regs) {
      for (const x of r.subjects) {
        // dozor vlastního termínu už souhrn má; vyučující předmětu dostane jen své předměty
        if (x.subjectTeacher && x.subjectTeacher.id !== s.teacher.id) {
          add(x.subjectTeacher, `${when}: ${displayName(r.student)} – ${x.subject.name}`);
        }
      }
    }
  }
  return [...byUser.values()].map(({ user, lines }) => ({
    email: user.email,
    userId: user.id,
    vars: { jmeno: user.firstName, datum, prehled: lines.join("\n\n") },
  }));
}

export async function getMakeupEmailEstimates(now = new Date()): Promise<Partial<Record<EmailEventId, number>>> {
  const sessions = await tomorrowSessions(now);
  const students = new Set(sessions.flatMap((s) => s.registrations.filter((r) => studentActive(r.student)).map((r) => r.student.id)));
  const datum = formatDayShort(startOfSchoolDay(now, 1));
  return { "makeup.reminder": students.size, "makeup.digest": digestRecipients(sessions, datum).length };
}

/** Denní úloha: připomínky studentům a souhrny pro dozor a vyučující (každé jen když je zapnuté). */
export async function runMakeupDailyJob(now: Date): Promise<DailyJobStep[]> {
  const steps: DailyJobStep[] = [];
  const [reminderOn, digestOn] = await Promise.all([isEmailEventActive("makeup.reminder"), isEmailEventActive("makeup.digest")]);
  if (!reminderOn && !digestOn) {
    return [{ task: "makeup.notifications", ok: true, detail: "Připomínky a souhrny dopisování jsou vypnuté." }];
  }
  const sessions = await tomorrowSessions(now);

  if (reminderOn) {
    try {
      // jeden student může mít zítra víc termínů – e-maily se posílají po termínech
      let sent = 0, skipped = 0;
      for (const s of sessions) {
        const recipients: EmailRecipient[] = s.registrations
          .filter((r) => studentActive(r.student))
          .map((r) => ({
            email: r.student.email,
            userId: r.student.id,
            vars: { jmeno: r.student.firstName, ...sessionVars(s), predmety: subjectsText(r) },
          }));
        const res = await sendEventEmail("makeup.reminder", recipients);
        sent += res.sent;
        skipped += res.skippedLimit + res.skippedDisabled;
      }
      steps.push({ task: "makeup.reminder", ok: true, detail: `Odesláno ${sent}, přeskočeno ${skipped}.` });
    } catch (e) {
      steps.push({ task: "makeup.reminder", ok: false, detail: e instanceof Error ? e.message : "Chyba." });
    }
  }

  if (digestOn) {
    try {
      const res = await sendEventEmail("makeup.digest", digestRecipients(sessions, formatDayShort(startOfSchoolDay(now, 1))));
      steps.push({ task: "makeup.digest", ok: true, detail: `Odesláno ${res.sent}, přeskočeno ${res.skippedLimit + res.skippedDisabled}.` });
    } catch (e) {
      steps.push({ task: "makeup.digest", ok: false, detail: e instanceof Error ? e.message : "Chyba." });
    }
  }
  return steps;
}
