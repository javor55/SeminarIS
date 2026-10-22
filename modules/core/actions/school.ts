"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import {
  DEFAULT_STUDY_YEARS,
  classLabel,
  classStatus,
  gradeOf,
  schoolYearLabel,
  type ClassStatus,
  type StudyEndReasonValue,
} from "@/lib/school";
import {
  activeStudentsWhere,
  ensureCurrentSchoolYear,
  findOrCreateClass,
  getCurrentSchoolYear,
  setStudentClass,
} from "@/modules/core/school";

export type ClassOption = {
  id: string;
  label: string;
  status: ClassStatus;
};

export type SchoolOverview = {
  currentYear: { startYear: number; label: string };
  // Rok lze nastavit ručně jen před prvním zařazením studentů (pak jen uzavřením roku)
  canSetYearManually: boolean;
  years: { startYear: number; label: string; isCurrent: boolean }[];
  classes: (ClassOption & { letter: string; entryYear: number; grade: number; studentCount: number })[];
  subjects: { id: string; name: string; code: string; isActive: boolean; assignmentCount: number }[];
  teachers: { id: string; name: string }[];
  assignments: { id: string; teacherId: string; teacherName: string; subjectId: string; subjectName: string; classGroupId: string; classLabel: string }[];
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.lastName} ${u.firstName}`.trim();

function revalidateSchool() {
  revalidatePath("/school");
  revalidatePath("/users");
}

// === PŘEHLED ===

export async function getSchoolOverview(): Promise<SchoolOverview> {
  await requirePermission("core.school.manage");
  const current = await ensureCurrentSchoolYear();
  const startYear = current.startYear;

  const [years, classes, subjects, teachers, assignments, membershipCount] = await Promise.all([
    prisma.schoolYear.findMany({ orderBy: { startYear: "desc" } }),
    prisma.classGroup.findMany({
      orderBy: [{ entryYear: "desc" }, { letter: "asc" }],
      // počítají se jen studující (ne absolventi a ukončení)
      include: { _count: { select: { students: { where: { role: "STUDENT", studyStatus: "ACTIVE" } } } } },
    }),
    prisma.subject.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { teachingAssignments: { where: { schoolYearId: current.id } } } } },
    }),
    prisma.user.findMany({
      where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolYearId: current.id },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        subject: { select: { name: true } },
        classGroup: true,
      },
    }),
    prisma.classMembership.count(),
  ]);

  // Nabídka sousedních školních let pro přepnutí, i když ještě nejsou v DB
  const yearSet = new Map(years.map((y) => [y.startYear, y.isCurrent]));
  for (const y of [startYear - 1, startYear, startYear + 1]) {
    if (!yearSet.has(y)) yearSet.set(y, false);
  }

  return {
    currentYear: { startYear, label: schoolYearLabel(startYear) },
    canSetYearManually: membershipCount === 0,
    years: [...yearSet.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, isCurrent]) => ({ startYear: y, label: schoolYearLabel(y), isCurrent })),
    classes: classes.map((c) => ({
      id: c.id,
      letter: c.letter,
      entryYear: c.entryYear,
      grade: gradeOf(c, startYear),
      label: classLabel(c, startYear),
      status: classStatus(c, startYear),
      studentCount: c._count.students,
    })),
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      isActive: s.isActive,
      assignmentCount: s._count.teachingAssignments,
    })),
    teachers: teachers.map((t) => ({ id: t.id, name: fullName(t) })),
    assignments: assignments
      .map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: fullName(a.teacher),
        subjectId: a.subjectId,
        subjectName: a.subject.name,
        classGroupId: a.classGroupId,
        classLabel: classLabel(a.classGroup, startYear),
      }))
      .sort((a, b) =>
        a.teacherName.localeCompare(b.teacherName, "cs") ||
        a.subjectName.localeCompare(b.subjectName, "cs") ||
        a.classLabel.localeCompare(b.classLabel, "cs")
      ),
  };
}

/** Třídy pro výběr u uživatele (aktuální a budoucí; absolventi jen pokud už tam uživatel je). */
export async function getClassOptions(): Promise<ClassOption[]> {
  await requirePermission("core.users.manage");
  const { startYear } = await getCurrentSchoolYear();
  const classes = await prisma.classGroup.findMany({ orderBy: [{ entryYear: "desc" }, { letter: "asc" }] });
  return classes.map((c) => ({ id: c.id, label: classLabel(c, startYear), status: classStatus(c, startYear) }));
}

// === ŠKOLNÍ ROK ===

/**
 * Ruční nastavení aktuálního školního roku – jen při prvním nastavení systému,
 * dokud nikdo není zařazen do třídy. Potom se rok mění jen uzavřením školního roku,
 * aby historie tříd zůstala konzistentní.
 */
export async function setCurrentSchoolYear(startYear: number) {
  await requirePermission("core.school.manage");
  if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
    throw new Error("Neplatný školní rok.");
  }
  if ((await prisma.classMembership.count()) > 0) {
    throw new Error("Studenti už jsou zařazeni do tříd – školní rok změňte uzavřením roku.");
  }
  await prisma.$transaction([
    prisma.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
    prisma.schoolYear.upsert({
      where: { startYear },
      update: { isCurrent: true },
      create: { startYear, isCurrent: true },
    }),
  ]);
  revalidatePath("/", "layout");
}

// === UZAVŘENÍ ŠKOLNÍHO ROKU ===

export type YearOutcome = "PROMOTE" | "GRADUATE" | "REPEAT" | "LEAVE";

export type YearClosureStudent = {
  id: string;
  name: string;
  classGroupId: string;
  classLabel: string;
  grade: number;
  letter: string;
  // Co se stane bez zásahu: poslední ročník absolvuje, ostatní postoupí
  defaultOutcome: "PROMOTE" | "GRADUATE";
  // Písmena tříd, kam lze přeřadit při opakování (třídy o rok mladší)
  repeatLetters: string[];
};

export type YearClosurePreview = {
  currentYear: { startYear: number; label: string };
  nextYear: { startYear: number; label: string };
  students: YearClosureStudent[];
  // Studující bez třídy – uzavření se jich netýká
  unassignedCount: number;
  // Písmena 1. ročníků, které už pro příští rok existují
  existingFirstGradeLetters: string[];
  assignmentCount: number;
};

export async function getYearClosurePreview(): Promise<YearClosurePreview> {
  await requirePermission("core.school.manage");
  const current = await ensureCurrentSchoolYear();
  const next = current.startYear + 1;

  const [students, unassignedCount, classes, assignmentCount] = await Promise.all([
    prisma.user.findMany({
      where: { ...activeStudentsWhere, classGroupId: { not: null } },
      include: { classGroup: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.user.count({ where: { ...activeStudentsWhere, classGroupId: null } }),
    prisma.classGroup.findMany(),
    prisma.teachingAssignment.count({ where: { schoolYearId: current.id } }),
  ]);

  const lettersByEntry = new Map<number, string[]>();
  for (const c of classes) {
    lettersByEntry.set(c.entryYear, [...(lettersByEntry.get(c.entryYear) ?? []), c.letter].sort());
  }

  return {
    currentYear: { startYear: current.startYear, label: schoolYearLabel(current.startYear) },
    nextYear: { startYear: next, label: schoolYearLabel(next) },
    students: students
      .map((u) => {
        const cls = u.classGroup!;
        const grade = gradeOf(cls, current.startYear);
        const studyYears = cls.studyYears ?? DEFAULT_STUDY_YEARS;
        return {
          id: u.id,
          name: fullName(u),
          classGroupId: cls.id,
          classLabel: classLabel(cls, current.startYear),
          grade,
          letter: cls.letter,
          defaultOutcome: grade >= studyYears ? ("GRADUATE" as const) : ("PROMOTE" as const),
          repeatLetters: [...new Set([cls.letter, ...(lettersByEntry.get(cls.entryYear + 1) ?? [])])].sort(),
        };
      })
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel, "cs") || a.name.localeCompare(b.name, "cs")),
    unassignedCount,
    existingFirstGradeLetters: lettersByEntry.get(next) ?? [],
    assignmentCount,
  };
}

export type YearClosureException = {
  userId: string;
  outcome: YearOutcome;
  // REPEAT: písmeno třídy o rok mladší (výchozí stejné písmeno)
  targetLetter?: string;
  // LEAVE: důvod ukončení
  leaveReason?: StudyEndReasonValue;
};

/**
 * Uzavře aktuální školní rok a přejde na další, vše v jedné transakci:
 * - postupující: záznam do historie s ročníkem +1 (třída zůstává, ročník se dopočítá),
 * - absolventi (poslední ročník): stav GRADUATED a deaktivace účtu,
 * - opakující (libovolný ročník): přeřazení do třídy o rok mladší,
 * - odcházející: ukončení studia s důvodem a deaktivace účtu,
 * - založení nových 1. ročníků a volitelně převzetí úvazků do nového roku.
 */
export async function closeSchoolYear(input: {
  // Ochrana proti dvojímu odeslání: rok, který uživatel viděl v náhledu
  expectedStartYear: number;
  newFirstGradeLetters: string;
  copyAssignments: boolean;
  exceptions: YearClosureException[];
}) {
  await requirePermission("core.school.manage");
  const current = await ensureCurrentSchoolYear();
  if (current.startYear !== input.expectedStartYear) {
    throw new Error("Školní rok se mezitím změnil. Načtěte stránku znovu.");
  }
  const nextStart = current.startYear + 1;
  const firstGradeLetters = input.newFirstGradeLetters.trim() ? parseLetters(input.newFirstGradeLetters) : [];
  const exceptions = new Map(input.exceptions.map((e) => [e.userId, e]));
  const now = new Date();

  const students = await prisma.user.findMany({
    where: { ...activeStudentsWhere, classGroupId: { not: null } },
    include: { classGroup: true },
  });

  // Rozdělení studentů podle výsledku (s kontrolou přípustnosti)
  const promote: { userId: string; classGroupId: string; grade: number }[] = [];
  const graduate: string[] = [];
  const repeat: { userId: string; entryYear: number; letter: string; grade: number }[] = [];
  const leave = new Map<StudyEndReasonValue, string[]>();
  for (const u of students) {
    const cls = u.classGroup!;
    const grade = gradeOf(cls, current.startYear);
    const isLast = grade >= (cls.studyYears ?? DEFAULT_STUDY_YEARS);
    const ex = exceptions.get(u.id);
    const outcome: YearOutcome = ex?.outcome ?? (isLast ? "GRADUATE" : "PROMOTE");
    const name = fullName(u);

    if (outcome === "PROMOTE") {
      if (isLast) throw new Error(`${name}: z posledního ročníku nelze postoupit – absolvuje, opakuje, nebo ukončí studium.`);
      promote.push({ userId: u.id, classGroupId: cls.id, grade: grade + 1 });
    } else if (outcome === "GRADUATE") {
      if (!isLast) throw new Error(`${name}: absolvovat lze jen z posledního ročníku.`);
      graduate.push(u.id);
    } else if (outcome === "REPEAT") {
      const letter = (ex?.targetLetter || cls.letter).trim().toUpperCase();
      if (!/^[A-Z]$/.test(letter)) throw new Error(`${name}: neplatné písmeno třídy.`);
      repeat.push({ userId: u.id, entryYear: cls.entryYear + 1, letter, grade });
    } else if (outcome === "LEAVE") {
      const reason = ex?.leaveReason;
      if (!reason || reason === "GRADUATED") throw new Error(`${name}: vyberte důvod ukončení studia.`);
      leave.set(reason, [...(leave.get(reason) ?? []), u.id]);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      // 1. Doplnit historii aktuálního roku (kdyby někdo byl zařazen mimo setStudentClass)
      await tx.classMembership.createMany({
        data: students.map((u) => ({
          userId: u.id,
          classGroupId: u.classGroupId!,
          schoolYearId: current.id,
          grade: gradeOf(u.classGroup!, current.startYear),
          reason: "ASSIGNED" as const,
        })),
        skipDuplicates: true,
      });

      // 2. Nový školní rok
      await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const next = await tx.schoolYear.upsert({
        where: { startYear: nextStart },
        update: { isCurrent: true },
        create: { startYear: nextStart, isCurrent: true },
      });

      // 3. Nové 1. ročníky
      for (const letter of firstGradeLetters) {
        await tx.classGroup.upsert({
          where: { entryYear_letter: { entryYear: nextStart, letter } },
          update: {},
          create: { entryYear: nextStart, letter, studyYears: DEFAULT_STUDY_YEARS },
        });
      }

      // 4. Postup – třída zůstává, jen záznam do historie
      await tx.classMembership.createMany({
        data: promote.map((p) => ({
          userId: p.userId,
          classGroupId: p.classGroupId,
          schoolYearId: next.id,
          grade: p.grade,
          reason: "PROMOTED" as const,
        })),
        skipDuplicates: true,
      });

      // 5. Opakování – třída o rok mladší (založí se, pokud neexistuje)
      for (const r of repeat) {
        const target = await tx.classGroup.upsert({
          where: { entryYear_letter: { entryYear: r.entryYear, letter: r.letter } },
          update: {},
          create: { entryYear: r.entryYear, letter: r.letter, studyYears: DEFAULT_STUDY_YEARS },
        });
        await setStudentClass(tx, {
          userId: r.userId,
          classGroupId: target.id,
          schoolYear: next,
          reason: "REPEATED",
        });
      }

      // 6. Absolventi a odcházející – ukončení studia a deaktivace účtu
      if (graduate.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: graduate } },
          data: { studyStatus: "GRADUATED", studyEndReason: "GRADUATED", studyEndedAt: now, isActive: false },
        });
      }
      for (const [reason, ids] of leave) {
        await tx.user.updateMany({
          where: { id: { in: ids } },
          data: { studyStatus: "LEFT", studyEndReason: reason, studyEndedAt: now, isActive: false },
        });
      }

      // 7. Úvazky do nového roku (jen třídy, které v něm ještě studují)
      if (input.copyAssignments) {
        const assignments = await tx.teachingAssignment.findMany({
          where: { schoolYearId: current.id },
          include: { classGroup: true },
        });
        await tx.teachingAssignment.createMany({
          data: assignments
            .filter((a) => classStatus(a.classGroup, nextStart) === "active")
            .map((a) => ({
              teacherId: a.teacherId,
              subjectId: a.subjectId,
              classGroupId: a.classGroupId,
              schoolYearId: next.id,
            })),
          skipDuplicates: true,
        });
      }
    },
    // Stovky studentů v jedné transakci – delší limit než výchozích 5 s
    { timeout: 120_000, maxWait: 10_000 }
  );

  revalidatePath("/", "layout");
  return {
    promoted: promote.length,
    graduated: graduate.length,
    repeated: repeat.length,
    left: [...leave.values()].reduce((n, ids) => n + ids.length, 0),
    nextYearLabel: schoolYearLabel(nextStart),
  };
}

// === TŘÍDY ===

function parseLetters(letters: string): string[] {
  const list = letters
    .split(/[\s,;]+/)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0 || list.some((l) => !/^[A-Z]$/.test(l))) {
    throw new Error("Zadejte písmena tříd, např. „A, B, C“.");
  }
  return [...new Set(list)];
}

/** Založí třídy daného ročníku v aktuálním školním roce, např. 1. ročník „A, B, C“. */
export async function createClasses(grade: number, letters: string) {
  await requirePermission("core.school.manage");
  if (!Number.isInteger(grade) || grade < 1 || grade > DEFAULT_STUDY_YEARS) {
    throw new Error(`Ročník musí být 1–${DEFAULT_STUDY_YEARS}.`);
  }
  const { startYear } = await ensureCurrentSchoolYear();
  const list = parseLetters(letters);
  for (const letter of list) {
    await findOrCreateClass(grade, letter, startYear);
  }
  revalidateSchool();
  return list.length;
}

/** Smaže třídu. Studenti zůstanou, jen nebudou zařazeni; úvazky třídy se smažou. */
export async function deleteClass(classGroupId: string) {
  await requirePermission("core.school.manage");
  await prisma.classGroup.delete({ where: { id: classGroupId } });
  revalidateSchool();
}

// === ŠKOLNÍ PŘEDMĚTY ===

function cleanSubjectInput(data: { name: string; code: string }) {
  const name = data.name.trim();
  const code = data.code.trim().toUpperCase();
  if (!name || !code) throw new Error("Vyplňte název i zkratku předmětu.");
  return { name, code };
}

export async function createSchoolSubject(data: { name: string; code: string }) {
  await requirePermission("core.school.manage");
  const clean = cleanSubjectInput(data);
  const exists = await prisma.subject.findUnique({ where: { code: clean.code } });
  if (exists) throw new Error(`Předmět se zkratkou ${clean.code} už existuje.`);
  await prisma.subject.create({ data: clean });
  revalidateSchool();
}

export async function updateSchoolSubject(id: string, data: { name: string; code: string }) {
  await requirePermission("core.school.manage");
  const clean = cleanSubjectInput(data);
  const exists = await prisma.subject.findUnique({ where: { code: clean.code } });
  if (exists && exists.id !== id) throw new Error(`Předmět se zkratkou ${clean.code} už existuje.`);
  await prisma.subject.update({ where: { id }, data: clean });
  revalidateSchool();
}

export async function toggleSchoolSubjectActive(id: string) {
  await requirePermission("core.school.manage");
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) throw new Error("Předmět nenalezen.");
  await prisma.subject.update({ where: { id }, data: { isActive: !subject.isActive } });
  revalidateSchool();
}

export async function deleteSchoolSubject(id: string) {
  await requirePermission("core.school.manage");
  await prisma.subject.delete({ where: { id } });
  revalidateSchool();
}

// === ÚVAZKY (kdo co učí) ===

/** Přidá úvazky učitele pro předmět ve vybraných třídách v aktuálním školním roce. */
export async function createTeachingAssignments(data: { teacherId: string; subjectId: string; classGroupIds: string[] }) {
  await requirePermission("core.school.manage");
  if (!data.teacherId || !data.subjectId || data.classGroupIds.length === 0) {
    throw new Error("Vyberte učitele, předmět a alespoň jednu třídu.");
  }
  const teacher = await prisma.user.findUnique({ where: { id: data.teacherId }, select: { role: true } });
  if (!teacher || (teacher.role !== "TEACHER" && teacher.role !== "ADMIN")) {
    throw new Error("Vybraný uživatel není učitel.");
  }
  const year = await ensureCurrentSchoolYear();
  const res = await prisma.teachingAssignment.createMany({
    data: data.classGroupIds.map((classGroupId) => ({
      teacherId: data.teacherId,
      subjectId: data.subjectId,
      classGroupId,
      schoolYearId: year.id,
    })),
    skipDuplicates: true,
  });
  revalidateSchool();
  return res.count;
}

export async function deleteTeachingAssignment(id: string) {
  await requirePermission("core.school.manage");
  await prisma.teachingAssignment.delete({ where: { id } });
  revalidateSchool();
}
