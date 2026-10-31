import type { TxClient } from "@/lib/prisma";
import type { DemoClearContext, DemoSeedContext, DemoStudent, ModuleDemoData } from "@/modules/server-types";

// Ukázková data modulu Semináře (F9): otevřené zápisové okno pro 4. ročník se třemi bloky
// (část studentů zapsaná, část ne, některé semináře plné) a jedno starší uzavřené okno.
// Žádné e-maily se neposílají; publikum je ročník 4, takže se okna ukážou jen studentům 4. ročníku.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

type OccSpec = { code: string; subCode?: string; capacity: number; popularity: number };
type BlockSpec = { name: string; description: string; required: boolean; min: number; max: number; occurrences: OccSpec[] };

const OPEN_BLOCKS: BlockSpec[] = [
  {
    name: "Blok A – přírodní vědy a matematika",
    description: "Vyberte jeden seminář.",
    required: true,
    min: 1,
    max: 1,
    occurrences: [
      { code: "SMA", capacity: 22, popularity: 3 },
      { code: "SFY", capacity: 14, popularity: 4 },
      { code: "SBI", capacity: 18, popularity: 3 },
      { code: "SCH", capacity: 12, popularity: 2 },
    ],
  },
  {
    name: "Blok B – humanitní obory a jazyky",
    description: "Vyberte jeden seminář.",
    required: true,
    min: 1,
    max: 1,
    occurrences: [
      { code: "SDE", capacity: 20, popularity: 3 },
      { code: "KAJ", subCode: "A", capacity: 16, popularity: 3 },
      { code: "KAJ", subCode: "B", capacity: 16, popularity: 3 },
      { code: "PSY", capacity: 18, popularity: 4 },
    ],
  },
  {
    name: "Blok C – praktické a ekonomické",
    description: "Nepovinný blok: můžete vybrat jeden seminář navíc.",
    required: false,
    min: 0,
    max: 1,
    occurrences: [
      { code: "PRG", capacity: 20, popularity: 4 },
      { code: "EKO", capacity: 20, popularity: 2 },
    ],
  },
];

const CLOSED_BLOCKS: BlockSpec[] = [
  {
    name: "Jazykové a společenskovědní semináře",
    description: "První kolo zápisu.",
    required: true,
    min: 1,
    max: 1,
    occurrences: [
      { code: "KAJ", capacity: 25, popularity: 3 },
      { code: "PSY", capacity: 20, popularity: 3 },
      { code: "SDE", capacity: 20, popularity: 2 },
    ],
  },
];

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Vybere výskyt s volnou kapacitou podle oblíbenosti; null, když je všechno plné. */
function pickOccurrence(ctx: DemoSeedContext, items: { id: string; remaining: number; popularity: number }[]) {
  const free = items.filter((o) => o.remaining > 0);
  const total = free.reduce((sum, o) => sum + o.popularity, 0);
  if (total === 0) return null;
  let roll = ctx.rng.next() * total;
  for (const o of free) {
    roll -= o.popularity;
    if (roll < 0) return o;
  }
  return free[free.length - 1];
}

export const seminarsDemoData: ModuleDemoData = {
  labels: {
    EnrollmentWindow: "Zápisová okna",
    Block: "Bloky zápisu",
    SubjectOccurrence: "Výskyty seminářů",
    StudentEnrollment: "Zápisy studentů na semináře",
  },

  async seed(tx: TxClient, ctx: DemoSeedContext) {
    const { core, actor, now, rng } = ctx;
    const subjectOf = (code: string) => {
      const s = core.subjects.find((x) => x.id === `demo-subj-${code.toLowerCase()}`);
      if (!s) throw new Error(`Ukázkový předmět ${code} nenalezen.`);
      return s;
    };
    const fourth = core.students.filter((s) => s.grade === 4);

    const windows: { id: string; name: string; description: string; startsAt: Date; endsAt: Date; resultsVisibility: "COUNTS" | "NAMES"; reminderDaysBefore: number | null; blocks: BlockSpec[]; enrollShare: number }[] = [
      {
        id: "demo-win-open",
        name: "Zápis volitelných seminářů – 4. ročník",
        description: "Vyberte si semináře pro závěrečný ročník: jeden z bloku A, jeden z bloku B a podle zájmu jeden z bloku C.",
        startsAt: new Date(now.getTime() - 3 * DAY),
        endsAt: new Date(now.getTime() + 9 * DAY),
        resultsVisibility: "COUNTS",
        reminderDaysBefore: 2,
        blocks: OPEN_BLOCKS,
        enrollShare: 0.68,
      },
      {
        id: "demo-win-closed",
        name: "Zápis seminářů – 1. kolo (uzavřeno)",
        description: "První kolo zápisu na jazykové a společenskovědní semináře.",
        startsAt: new Date(now.getTime() - 40 * DAY),
        endsAt: new Date(now.getTime() - 26 * DAY),
        resultsVisibility: "NAMES",
        reminderDaysBefore: null,
        blocks: CLOSED_BLOCKS,
        enrollShare: 0.85,
      },
    ];

    await tx.enrollmentWindow.createMany({
      data: windows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        startsAt: w.startsAt,
        endsAt: w.endsAt,
        published: true,
        resultsVisibility: w.resultsVisibility,
        reminderDaysBefore: w.reminderDaysBefore,
        // Okno se otevřelo už dřív; upozornění „zápis otevřen“ se tak nikdy nepošle
        openedNotifiedAt: w.startsAt,
        createdById: actor.id,
      })),
    });
    await ctx.track("EnrollmentWindow", windows.map((w) => w.id));

    await tx.enrollmentWindowAudience.createMany({
      data: windows.map((w) => ({ id: `${w.id}-aud`, windowId: w.id, type: "GRADE" as const, grade: 4, key: "GRADE:4" })),
    });

    const blocks: { id: string; name: string; description: string; order: number; required: boolean; minEnrollments: number; maxEnrollments: number; enrollmentWindowId: string; createdById: string }[] = [];
    const occurrences: { id: string; subjectId: string; blockId: string; teacherId: string; subCode: string | null; capacity: number; createdById: string }[] = [];
    const blocksByWindow = new Map<string, { blockId: string; required: boolean; occ: { id: string; remaining: number; popularity: number }[] }[]>();

    for (const w of windows) {
      const list: { blockId: string; required: boolean; occ: { id: string; remaining: number; popularity: number }[] }[] = [];
      w.blocks.forEach((b, bi) => {
        const blockId = `${w.id}-blk-${bi + 1}`;
        blocks.push({ id: blockId, name: b.name, description: b.description, order: bi + 1, required: b.required, minEnrollments: b.min, maxEnrollments: b.max, enrollmentWindowId: w.id, createdById: actor.id });
        const occ = b.occurrences.map((o, oi) => {
          const subject = subjectOf(o.code);
          const id = `${blockId}-occ-${oi + 1}`;
          occurrences.push({ id, subjectId: subject.id, blockId, teacherId: subject.teacherIds[oi % subject.teacherIds.length], subCode: o.subCode ?? null, capacity: o.capacity, createdById: actor.id });
          return { id, remaining: o.capacity, popularity: o.popularity };
        });
        list.push({ blockId, required: b.required, occ });
      });
      blocksByWindow.set(w.id, list);
    }
    await tx.block.createMany({ data: blocks });
    await ctx.track("Block", blocks.map((b) => b.id));
    await tx.subjectOccurrence.createMany({ data: occurrences });
    await ctx.track("SubjectOccurrence", occurrences.map((o) => o.id));

    // Zápisy: část studentů je zapsaná úplně, část jen napůl, část vůbec (aby byli i nezapsaní)
    const enrollments: { id: string; studentId: string; subjectOccurrenceId: string; createdById: string; createdAt: Date }[] = [];
    for (const w of windows) {
      const list = blocksByWindow.get(w.id) ?? [];
      const shuffled: DemoStudent[] = rng.shuffle(fourth);
      const full = Math.round(shuffled.length * w.enrollShare);
      const partial = list.length > 1 ? Math.round(shuffled.length * 0.15) : 0;
      const spanMs = Math.min(w.endsAt.getTime(), now.getTime()) - w.startsAt.getTime();
      shuffled.forEach((student, idx) => {
        if (idx >= full + partial) return; // nezapsaní
        const blocksToUse = idx < full ? list : list.slice(0, 1);
        for (const block of blocksToUse) {
          // nepovinný blok si vybere jen část studentů
          if (!block.required && !rng.chance(0.5)) continue;
          const occ = pickOccurrence(ctx, block.occ);
          if (!occ) continue;
          occ.remaining--;
          enrollments.push({
            id: `demo-enr-${pad(enrollments.length + 1, 4)}`,
            studentId: student.id,
            subjectOccurrenceId: occ.id,
            createdById: student.id,
            createdAt: new Date(w.startsAt.getTime() + Math.floor(rng.next() * spanMs)),
          });
        }
      });
    }
    await tx.studentEnrollment.createMany({ data: enrollments });
    await ctx.track("StudentEnrollment", enrollments.map((e) => e.id));
  },

  async clear(tx: TxClient, ctx: DemoClearContext) {
    const users = ctx.ids("User");
    const windows = ctx.ids("EnrollmentWindow");
    const blocks = ctx.ids("Block");
    const occurrences = ctx.ids("SubjectOccurrence");
    const enrollments = ctx.ids("StudentEnrollment");

    // Zápisy ukázkových studentů (i do skutečných oken) a všechny zápisy do ukázkových výskytů
    await tx.studentEnrollment.deleteMany({
      where: { OR: [{ id: { in: enrollments } }, { studentId: { in: users } }, { subjectOccurrenceId: { in: occurrences } }] },
    });
    // Skutečné záznamy, které ukázkový uživatel jen vytvořil nebo vedl, zůstanou; autorem se stane admin
    const replace = { in: users };
    await tx.enrollmentWindow.updateMany({ where: { createdById: replace, id: { notIn: windows } }, data: { createdById: ctx.actor.id } });
    await tx.block.updateMany({ where: { createdById: replace, id: { notIn: blocks } }, data: { createdById: ctx.actor.id } });
    await tx.subjectOccurrence.updateMany({ where: { createdById: replace, id: { notIn: occurrences } }, data: { createdById: ctx.actor.id } });
    await tx.studentEnrollment.updateMany({ where: { createdById: replace }, data: { createdById: ctx.actor.id } });
    await tx.subjectOccurrence.updateMany({ where: { teacherId: replace, id: { notIn: occurrences } }, data: { teacherId: null } });

    await tx.subjectOccurrence.deleteMany({ where: { id: { in: occurrences } } });
    await tx.block.deleteMany({ where: { id: { in: blocks } } });
    await tx.enrollmentWindow.deleteMany({ where: { id: { in: windows } } });
  },
};
