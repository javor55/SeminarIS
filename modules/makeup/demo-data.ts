import type { TxClient } from "@/lib/prisma";
import { addDaysToDayKey, formatTime, schoolDayKey, startOfSchoolDay } from "@/lib/datetime";
import type { DemoClearContext, DemoSeedContext, ModuleDemoData } from "@/modules/server-types";

// Ukázková data modulu Dopisování (F9): termíny na příští dva týdny (různí dozoři, učebny a předměty),
// zápisy studentů s poznámkami a jeden proběhlý termín s docházkou. Žádné e-maily se neposílají.

type SessionSpec = {
  // Počet dní od dneška (víkend se posune na nejbližší pracovní den)
  day: number;
  start: string;
  minutes: number;
  teacher: number;
  room: string;
  subjects: string[];
  capacity: number;
  deadline: number;
  note?: string;
  // Kolik míst se obsadí (podíl kapacity); 1 = plný termín
  fill: number;
};

const SESSIONS: SessionSpec[] = [
  { day: -3, start: "14:30", minutes: 60, teacher: 5, room: "Učebna 2.04", subjects: ["MAT", "FYZ"], capacity: 12, deadline: 60, fill: 0.7 },
  { day: 1, start: "14:30", minutes: 60, teacher: 5, room: "Učebna 2.04", subjects: ["MAT"], capacity: 12, deadline: 60, fill: 0.5, note: "Přineste psací potřeby a kalkulačku." },
  { day: 1, start: "15:00", minutes: 45, teacher: 0, room: "Učebna 1.12", subjects: ["ČJL"], capacity: 10, deadline: 120, fill: 0.3 },
  { day: 2, start: "07:15", minutes: 45, teacher: 2, room: "Jazyková učebna", subjects: ["AJ", "NJ"], capacity: 8, deadline: 1440, fill: 0.6, note: "Poslech a čtení." },
  { day: 3, start: "14:45", minutes: 60, teacher: 7, room: "Fyzikální laboratoř", subjects: ["FYZ"], capacity: 10, deadline: 60, fill: 0.4 },
  { day: 4, start: "14:30", minutes: 90, teacher: 8, room: "Chemická laboratoř", subjects: ["CHE", "BIO"], capacity: 6, deadline: 1440, fill: 1 },
  { day: 6, start: "15:00", minutes: 60, teacher: 10, room: "Učebna 3.07", subjects: ["DEJ", "ZSV"], capacity: 12, deadline: 120, fill: 0.25 },
  { day: 8, start: "14:30", minutes: 60, teacher: 12, room: "Počítačová učebna", subjects: ["INF"], capacity: 14, deadline: 60, fill: 0.15 },
  { day: 9, start: "15:15", minutes: 60, teacher: 6, room: "Učebna 2.04", subjects: ["MAT"], capacity: 12, deadline: 2880, fill: 0.1 },
  { day: 11, start: "14:30", minutes: 45, teacher: 1, room: "Knihovna", subjects: ["ČJL", "ZSV"], capacity: 10, deadline: 60, fill: 0 },
  { day: 13, start: "07:30", minutes: 45, teacher: 3, room: "Jazyková učebna", subjects: ["AJ"], capacity: 8, deadline: 1440, fill: 0.2 },
];

const NOTES = [
  "Zameškaná písemka z kapitoly 3 (nemoc).",
  "Reprezentace školy na soutěži, písemku dopisuji.",
  "Dopisuji test z minulého týdne.",
  "Omluvená absence, prosím o zadání ve stejné podobě jako ve třídě.",
  "Chci dopsat čtvrtletní písemku.",
];

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Okamžik v pásmu školy: `day` dní od dneška (víkend se posune), `hhmm` místního času (i přes změnu času). */
function schoolInstant(now: Date, day: number, hhmm: string): Date {
  let offset = day;
  for (;;) {
    const weekday = new Date(addDaysToDayKey(schoolDayKey(now), offset)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) break;
    offset += day < 0 ? -1 : 1;
  }
  const [h, m] = hhmm.split(":").map(Number);
  const want = h * 60 + m;
  let t = new Date(startOfSchoolDay(now, offset).getTime() + want * 60_000);
  for (let i = 0; i < 2; i++) {
    const [ah, am] = formatTime(t).split(":").map(Number);
    const diff = want - (ah * 60 + am);
    if (diff === 0) break;
    t = new Date(t.getTime() + diff * 60_000);
  }
  return t;
}

export const makeupDemoData: ModuleDemoData = {
  labels: {
    MakeupSession: "Termíny dopisování",
    MakeupRegistration: "Zápisy studentů na dopisování",
  },

  async seed(tx: TxClient, ctx: DemoSeedContext) {
    const { core, now, rng } = ctx;
    const subjectId = (code: string) => `demo-subj-${code.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}`;

    const sessions: {
      id: string;
      teacherId: string;
      startsAt: Date;
      endsAt: Date;
      room: string;
      capacity: number;
      changeDeadlineMinutes: number;
      note: string | null;
      createdById: string;
      createdAt: Date;
      subjects: string[];
      fill: number;
      past: boolean;
    }[] = SESSIONS.map((spec, i) => {
      const startsAt = schoolInstant(now, spec.day, spec.start);
      const subjects = spec.subjects.map(subjectId);
      for (const id of subjects) if (!core.subjects.some((s) => s.id === id)) throw new Error(`Ukázkový předmět ${id} nenalezen.`);
      return {
        id: `demo-ms-${pad(i + 1, 2)}`,
        teacherId: core.teachers[spec.teacher].id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + spec.minutes * 60_000),
        room: spec.room,
        capacity: spec.capacity,
        changeDeadlineMinutes: spec.deadline,
        note: spec.note ?? null,
        createdById: core.teachers[spec.teacher].id,
        createdAt: new Date(Math.min(now.getTime(), startsAt.getTime()) - rng.int(2, 6) * 24 * 3600_000),
        subjects,
        fill: spec.fill,
        past: spec.day < 0,
      };
    });

    await tx.makeupSession.createMany({
      data: sessions.map(({ subjects: _s, fill: _f, past: _p, ...row }) => row),
    });
    await ctx.track("MakeupSession", sessions.map((s) => s.id));
    await tx.makeupSessionSubject.createMany({
      data: sessions.flatMap((s) => s.subjects.map((subjectId) => ({ sessionId: s.id, subjectId }))),
    });

    // Zápisy: každý student nejvýš na jeden termín (aby se termíny nepřekrývaly)
    const pool = rng.shuffle(core.students);
    let cursor = 0;
    const registrations: { id: string; sessionId: string; studentId: string; note: string | null; attendance: "REGISTERED" | "ATTENDED" | "NO_SHOW"; createdById: string; createdAt: Date }[] = [];
    const registrationSubjects: { registrationId: string; subjectId: string; subjectTeacherId: string | null }[] = [];
    for (const s of sessions) {
      const count = s.past ? 8 : Math.round(s.capacity * s.fill);
      for (let i = 0; i < count && cursor < pool.length; i++) {
        const student = pool[cursor++];
        const id = `demo-mr-${pad(registrations.length + 1, 3)}`;
        // Předmět z termínu, který se ve ročníku studenta učí
        const taught = s.subjects.filter((sid) => core.subjects.find((x) => x.id === sid)?.grades.includes(student.grade));
        const candidates = taught.length > 0 ? taught : s.subjects;
        const chosen = candidates.length > 1 && rng.chance(0.2) ? candidates : [rng.pick(candidates)];
        for (const sid of chosen) {
          const teacher = core.teaching.find((t) => t.classGroupId === student.classGroupId && t.subjectId === sid);
          registrationSubjects.push({ registrationId: id, subjectId: sid, subjectTeacherId: teacher?.teacherId ?? null });
        }
        registrations.push({
          id,
          sessionId: s.id,
          studentId: student.id,
          note: rng.chance(0.6) ? rng.pick(NOTES) : null,
          attendance: s.past ? (rng.chance(0.8) ? "ATTENDED" : "NO_SHOW") : "REGISTERED",
          createdById: student.id,
          createdAt: new Date(Math.min(now.getTime(), s.startsAt.getTime()) - rng.int(60, 3 * 24 * 60) * 60_000),
        });
      }
    }
    await tx.makeupRegistration.createMany({ data: registrations });
    await ctx.track("MakeupRegistration", registrations.map((r) => r.id));
    await tx.makeupRegistrationSubject.createMany({ data: registrationSubjects });
  },

  async clear(tx: TxClient, ctx: DemoClearContext) {
    const users = ctx.ids("User");
    const sessions = ctx.ids("MakeupSession");
    const registrations = ctx.ids("MakeupRegistration");

    // Zápisy ukázkových studentů (i na skutečné termíny) a všechny zápisy na ukázkové termíny
    await tx.makeupRegistration.deleteMany({
      where: { OR: [{ id: { in: registrations } }, { studentId: { in: users } }, { sessionId: { in: sessions } }] },
    });
    // Skutečné termíny, které dozoroval nebo založil ukázkový učitel, převezme admin (stejně jako při mazání uživatele)
    await tx.makeupSession.updateMany({ where: { teacherId: { in: users }, id: { notIn: sessions } }, data: { teacherId: ctx.actor.id } });
    await tx.makeupSession.updateMany({ where: { createdById: { in: users }, id: { notIn: sessions } }, data: { createdById: ctx.actor.id } });
    await tx.makeupRegistration.updateMany({ where: { createdById: { in: users } }, data: { createdById: ctx.actor.id } });
    await tx.makeupSession.deleteMany({ where: { id: { in: sessions } } });
  },
};
