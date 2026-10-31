import { classLabel, schoolYearStartForDate } from "@/lib/school";
import type { TxClient } from "@/lib/prisma";
import type { DemoClass, DemoCoreData, DemoPerson, DemoSeedContext, DemoStudent, DemoSubject, DemoTeaching } from "@/modules/server-types";
import {
  DEMO_GRADES,
  DEMO_GUEST_COUNT,
  DEMO_LETTERS,
  DEMO_STUDENTS_PER_CLASS,
  DEMO_SUBJECTS,
  DEMO_TEACHER_COUNT,
} from "@/modules/core/demo/catalog";
import { asciiSlug, createNamePicker } from "@/modules/core/demo/names";

export const DEMO_EMAIL_DOMAIN = "ukazka.invalid";

const DAY = 24 * 3600 * 1000;
const pad = (n: number, width: number) => String(n).padStart(width, "0");

type CoreSeedInput = Pick<DemoSeedContext, "actor" | "now" | "rng" | "track" | "passwordHash">;

/** Jedinečný e-mail `jmeno.prijmeni@ukazka.invalid` (při shodě s číslem). */
function createEmailMaker(taken: Set<string>) {
  return (firstName: string, lastName: string) => {
    const base = `${asciiSlug(firstName)}.${asciiSlug(lastName)}`;
    let email = `${base}@${DEMO_EMAIL_DOMAIN}`;
    for (let i = 2; taken.has(email); i++) email = `${base}${i}@${DEMO_EMAIL_DOMAIN}`;
    taken.add(email);
    return email;
  };
}

/**
 * Ukázková data jádra: školní rok, třídy 1.A–4.C, učitelé, studenti, hosté čekající na schválení,
 * předměty a úvazky. Hromadné vkládání (`createMany`) – stejný výsledek jako `setStudentClass`
 * (třída studenta + záznam v historii zařazení), jen bez dotazu na každého studenta zvlášť.
 */
export async function seedCoreDemo(tx: TxClient, ctx: CoreSeedInput): Promise<DemoCoreData> {
  const { actor, now, rng, track, passwordHash } = ctx;

  // E-maily ukázkových účtů nesmějí kolidovat s ničím existujícím
  const taken = new Set((await tx.user.findMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } }, select: { email: true } })).map((u) => u.email));
  if (taken.size > 0) throw new Error(`V databázi už jsou účty na @${DEMO_EMAIL_DOMAIN}, které nejsou v evidenci ukázkových dat. Smažte je ručně.`);
  const makeEmail = createEmailMaker(taken);
  const pickName = createNamePicker(rng);

  // 1) Školní rok
  let year = await tx.schoolYear.findFirst({ where: { isCurrent: true } });
  if (!year) {
    const startYear = schoolYearStartForDate(now);
    const existing = await tx.schoolYear.findUnique({ where: { startYear } });
    if (existing) {
      year = await tx.schoolYear.update({ where: { id: existing.id }, data: { isCurrent: true } });
    } else {
      year = await tx.schoolYear.create({ data: { id: `demo-year-${startYear}`, startYear, isCurrent: true } });
      await track("SchoolYear", [year.id]);
    }
  }
  const schoolYear = { id: year.id, startYear: year.startYear };

  // 2) Třídy 1.A–4.C: existující se použijí (a neevidují), nové se založí a zapíšou do evidence
  const existingClasses = await tx.classGroup.findMany();
  const classes: DemoClass[] = [];
  const newClasses: { id: string; grade: number; letter: string }[] = [];
  for (const grade of DEMO_GRADES) {
    for (const letter of DEMO_LETTERS) {
      const found = existingClasses.find((c) => c.grade === grade && c.letter === letter);
      const id = found?.id ?? `demo-class-${grade}${letter}`;
      if (!found) newClasses.push({ id, grade, letter });
      classes.push({ id, grade, letter, label: classLabel({ grade, letter }) });
    }
  }
  if (newClasses.length > 0) {
    await tx.classGroup.createMany({ data: newClasses });
    await track("ClassGroup", newClasses.map((c) => c.id));
  }

  // 3) Učitelé
  const teachers: DemoPerson[] = [];
  for (let i = 0; i < DEMO_TEACHER_COUNT; i++) {
    const name = pickName();
    teachers.push({ id: `demo-teacher-${pad(i + 1, 2)}`, ...name, email: makeEmail(name.firstName, name.lastName) });
  }

  // 4) Studenti (20 na třídu) a hosté čekající na schválení
  const students: DemoStudent[] = [];
  let n = 0;
  for (const cls of classes) {
    for (let i = 0; i < DEMO_STUDENTS_PER_CLASS; i++) {
      const name = pickName();
      students.push({ id: `demo-student-${pad(++n, 3)}`, ...name, email: makeEmail(name.firstName, name.lastName), classGroupId: cls.id, grade: cls.grade });
    }
  }
  const guests: DemoPerson[] = [];
  for (let i = 0; i < DEMO_GUEST_COUNT; i++) {
    const name = pickName();
    guests.push({ id: `demo-guest-${i + 1}`, ...name, email: makeEmail(name.firstName, name.lastName) });
  }

  const lastLogin = (p: number, days: number) => (rng.chance(p) ? new Date(now.getTime() - rng.int(1, days * 24 * 60) * 60_000) : null);
  await tx.user.createMany({
    data: [
      ...teachers.map((t) => ({
        ...t,
        passwordHash,
        role: "TEACHER" as const,
        lastLoginAt: lastLogin(0.9, 7),
        createdAt: new Date(now.getTime() - rng.int(60, 200) * DAY),
      })),
      ...students.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        passwordHash,
        role: "STUDENT" as const,
        classGroupId: s.classGroupId,
        lastLoginAt: lastLogin(0.7, 14),
        createdAt: new Date(now.getTime() - rng.int(30, 120) * DAY),
      })),
      ...guests.map((g, i) => ({
        ...g,
        passwordHash,
        role: "GUEST" as const,
        requestedClassGroupId: classes[rng.int(0, classes.length - 1)].id,
        createdAt: new Date(now.getTime() - (i * 7 + rng.int(1, 6)) * 3600_000 - i * DAY),
      })),
    ],
  });
  await track("User", [...teachers, ...students, ...guests].map((u) => u.id));

  // Historie zařazení do tříd v aktuálním školním roce
  const memberships = students.map((s, i) => ({
    id: `demo-cm-${pad(i + 1, 3)}`,
    userId: s.id,
    classGroupId: s.classGroupId,
    schoolYearId: schoolYear.id,
    grade: s.grade,
    reason: "ASSIGNED" as const,
  }));
  await tx.classMembership.createMany({ data: memberships });
  await track("ClassMembership", memberships.map((m) => m.id));

  // 5) Předměty a úvazky podle ročníků
  const codes = new Set((await tx.subject.findMany({ where: { code: { not: null } }, select: { code: true } })).map((s) => s.code));
  const subjects: DemoSubject[] = DEMO_SUBJECTS.map((spec) => ({
    id: `demo-subj-${asciiSlug(spec.code)}`,
    name: spec.name,
    // Zkratka je jedinečná; kdyby ji už měl skutečný předmět, ukázkový ji mít nebude
    code: codes.has(spec.code) ? null : spec.code,
    grades: spec.grades,
    compulsory: spec.compulsory,
    teacherIds: spec.teachers.map((t) => teachers[t].id),
  }));
  await tx.subject.createMany({
    data: subjects.map((s, i) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      description: DEMO_SUBJECTS[i].description,
      grades: s.grades,
      createdById: actor.id,
    })),
  });
  await track("Subject", subjects.map((s) => s.id));

  const teaching: DemoTeaching[] = [];
  for (const subject of subjects) {
    for (const grade of subject.grades) {
      classes
        .filter((c) => c.grade === grade)
        .forEach((cls, idx) => teaching.push({ teacherId: subject.teacherIds[idx % subject.teacherIds.length], subjectId: subject.id, classGroupId: cls.id }));
    }
  }
  const assignments = teaching.map((t, i) => ({ id: `demo-ta-${pad(i + 1, 4)}`, ...t, schoolYearId: schoolYear.id }));
  await tx.teachingAssignment.createMany({ data: assignments });
  await track("TeachingAssignment", assignments.map((a) => a.id));

  return { schoolYear, classes, teachers, students, guests, subjects, teaching };
}
