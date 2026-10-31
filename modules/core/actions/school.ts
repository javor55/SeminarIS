"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  DEFAULT_STUDY_YEARS,
  classLabel,
  compareClasses,
  schoolYearLabel,
  subjectInGrade,
  type StudyEndReasonValue,
} from "@/lib/school";
import {
  activeStudentsWhere,
  ensureCurrentSchoolYear,
  findOrCreateClass,
  setStudentClass,
} from "@/modules/core/school";
import { formatName } from "@/lib/names";
import { sortByName } from "@/lib/names";

const fullName = (u: { firstName: string; lastName: string }) => formatName(u, "list");

// === ŠKOLNÍ ROK ===

/**
 * Ruční nastavení aktuálního školního roku – jen při prvním nastavení systému,
 * dokud nikdo není zařazen do třídy. Potom se rok mění jen uzavřením školního roku,
 * aby historie tříd zůstala konzistentní.
 */
export async function setCurrentSchoolYear(startYear: number) {
  return safeAction(async () => {
    const admin = await requirePermission("core.school.manage");
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
      throw new Error("Neplatný školní rok.");
    }
    if ((await prisma.classMembership.count()) > 0) {
      throw new Error("Studenti už jsou zařazeni do tříd – školní rok změňte uzavřením roku.");
    }
    await prisma.$transaction(async (tx) => {
      const before = await tx.schoolYear.findFirst({ where: { isCurrent: true } });
      await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      await tx.schoolYear.upsert({
        where: { startYear },
        update: { isCurrent: true },
        create: { startYear, isCurrent: true },
      });
      await audit(tx, admin, {
        action: "school.year.set",
        entityType: "schoolYear",
        entityId: String(startYear),
        summary: `Nastaven aktuální školní rok ${schoolYearLabel(startYear)}${before ? ` (dříve ${schoolYearLabel(before.startYear)})` : ""}`,
        data: { before: before?.startYear ?? null, after: startYear },
      });
    });
    revalidatePath("/", "layout");
  });
}

// === UZAVŘENÍ ŠKOLNÍHO ROKU ===

export type YearOutcome = "PROMOTE" | "GRADUATE" | "REPEAT" | "LEAVE";

/** Co s úvazky do nového roku: nepřebírat / ponechat u stejných tříd / jít se třídou (2.A → 3.A). */
export type AssignmentMode = "NONE" | "SAME" | "WITH_CLASS";

export type YearClosureStudent = {
  id: string;
  name: string;
  classGroupId: string;
  classLabel: string;
  grade: number;
  letter: string;
  // Co se stane bez zásahu: poslední ročník absolvuje, ostatní postoupí do (g+1).<stejné písmeno>
  defaultOutcome: "PROMOTE" | "GRADUATE";
};

export type YearClosurePreview = {
  currentYear: { startYear: number; label: string };
  nextYear: { startYear: number; label: string };
  students: YearClosureStudent[];
  // Studující bez třídy – uzavření se jich netýká
  unassignedCount: number;
  // Existující třídy (cíle postupu a opakování); chybějící se při uzavření založí
  classes: { grade: number; letter: string; label: string }[];
  assignmentCount: number;
  // Kolik úvazků se přenese při jednotlivých volbách
  assignmentCopyCounts: Record<AssignmentMode, number>;
};

type AssignmentLite = {
  teacherId: string;
  subjectId: string;
  grade: number;
  letter: string;
  subjectGrades: number[];
};

/** Úvazky, které se podle zvolené možnosti přenesou do nového roku (třída = cílový ročník + písmeno). */
function planAssignments(mode: AssignmentMode, list: AssignmentLite[]) {
  if (mode === "NONE") return [];
  if (mode === "SAME") return list.map((a) => ({ ...a, targetGrade: a.grade }));
  // jít se třídou: ne ze 4. ročníku a jen tam, kde se předmět v novém ročníku vyučuje
  return list
    .filter((a) => a.grade < DEFAULT_STUDY_YEARS && subjectInGrade(a.subjectGrades, a.grade + 1))
    .map((a) => ({ ...a, targetGrade: a.grade + 1 }));
}

async function loadAssignments(schoolYearId: string): Promise<AssignmentLite[]> {
  const rows = await prisma.teachingAssignment.findMany({
    where: { schoolYearId },
    include: { classGroup: true, subject: { select: { grades: true } } },
  });
  return rows.map((a) => ({
    teacherId: a.teacherId,
    subjectId: a.subjectId,
    grade: a.classGroup.grade,
    letter: a.classGroup.letter,
    subjectGrades: a.subject.grades,
  }));
}

export async function getYearClosurePreview(): Promise<YearClosurePreview> {
  await requirePermission("core.school.manage");
  const current = await ensureCurrentSchoolYear();
  const next = current.startYear + 1;

  const [students, unassignedCount, classes, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { ...activeStudentsWhere, classGroupId: { not: null } },
      include: { classGroup: true },
    }),
    prisma.user.count({ where: { ...activeStudentsWhere, classGroupId: null } }),
    prisma.classGroup.findMany(),
    loadAssignments(current.id),
  ]);

  return {
    currentYear: { startYear: current.startYear, label: schoolYearLabel(current.startYear) },
    nextYear: { startYear: next, label: schoolYearLabel(next) },
    students: sortByName(students)
      .map((u) => {
        const cls = u.classGroup!;
        return {
          id: u.id,
          name: fullName(u),
          classGroupId: cls.id,
          classLabel: classLabel(cls),
          grade: cls.grade,
          letter: cls.letter,
          defaultOutcome: cls.grade >= DEFAULT_STUDY_YEARS ? ("GRADUATE" as const) : ("PROMOTE" as const),
        };
      })
      .sort((a, b) => a.grade - b.grade || a.classLabel.localeCompare(b.classLabel, "cs") || a.name.localeCompare(b.name, "cs")),
    unassignedCount,
    classes: classes.sort(compareClasses).map((c) => ({ grade: c.grade, letter: c.letter, label: classLabel(c) })),
    assignmentCount: assignments.length,
    assignmentCopyCounts: {
      NONE: 0,
      SAME: planAssignments("SAME", assignments).length,
      WITH_CLASS: planAssignments("WITH_CLASS", assignments).length,
    },
  };
}

export type YearClosureDecision = {
  userId: string;
  outcome: YearOutcome;
  // PROMOTE / REPEAT: písmeno cílové třídy (výchozí stejné písmeno)
  targetLetter?: string;
  // LEAVE: důvod ukončení a poznámka
  leaveReason?: StudyEndReasonValue;
  leaveNote?: string;
};

/**
 * Uzavře aktuální školní rok a přejde na další, vše v jedné transakci:
 * - postupující: přesun do třídy o ročník výš (výchozí stejné písmeno, lze změnit),
 * - opakující: třída stejného ročníku (výchozí stejná, lze změnit písmeno),
 * - absolventi (poslední ročník): stav GRADUATED a deaktivace účtu,
 * - odcházející: ukončení studia s důvodem a deaktivace účtu,
 * - chybějící cílové třídy se založí, úvazky se podle volby přenesou do nového roku.
 * Hosté a učitelé se nemění.
 */
export async function closeSchoolYear(input: {
  // Ochrana proti dvojímu odeslání: rok, který uživatel viděl v náhledu
  expectedStartYear: number;
  assignmentMode: AssignmentMode;
  // Jen výjimky oproti výchozímu výsledku; kdo tu není, postoupí / absolvuje
  decisions: YearClosureDecision[];
}) {
  return safeAction(async () => {
    const admin = await requirePermission("core.school.manage");
    const current = await ensureCurrentSchoolYear();
    if (current.startYear !== input.expectedStartYear) {
      throw new Error("Školní rok se mezitím změnil. Načtěte stránku znovu.");
    }
    if (!["NONE", "SAME", "WITH_CLASS"].includes(input.assignmentMode)) throw new Error("Neplatná volba úvazků.");
    const nextStart = current.startYear + 1;
    const decisions = new Map(input.decisions.map((e) => [e.userId, e]));
    const now = new Date();

    const students = await prisma.user.findMany({
      where: { ...activeStudentsWhere, classGroupId: { not: null } },
      include: { classGroup: true },
    });

    // Rozdělení studentů podle výsledku (s kontrolou přípustnosti)
    const move: { userId: string; grade: number; letter: string; reason: "PROMOTED" | "REPEATED" }[] = [];
    const graduate: string[] = [];
    const leave: { userId: string; reason: StudyEndReasonValue; note: string | null }[] = [];
    for (const u of students) {
      const cls = u.classGroup!;
      const isLast = cls.grade >= DEFAULT_STUDY_YEARS;
      const d = decisions.get(u.id);
      const outcome: YearOutcome = d?.outcome ?? (isLast ? "GRADUATE" : "PROMOTE");
      const name = fullName(u);
      const letter = (d?.targetLetter || cls.letter).trim().toUpperCase();
      if ((outcome === "PROMOTE" || outcome === "REPEAT") && !/^[A-Z]$/.test(letter)) {
        throw new Error(`${name}: neplatné písmeno třídy.`);
      }

      if (outcome === "PROMOTE") {
        if (isLast) throw new Error(`${name}: z posledního ročníku nelze postoupit – absolvuje, opakuje, nebo ukončí studium.`);
        move.push({ userId: u.id, grade: cls.grade + 1, letter, reason: "PROMOTED" });
      } else if (outcome === "REPEAT") {
        move.push({ userId: u.id, grade: cls.grade, letter, reason: "REPEATED" });
      } else if (outcome === "GRADUATE") {
        if (!isLast) throw new Error(`${name}: absolvovat lze jen z posledního ročníku.`);
        graduate.push(u.id);
      } else if (outcome === "LEAVE") {
        const reason = d?.leaveReason;
        if (!reason || reason === "GRADUATED") throw new Error(`${name}: vyberte důvod ukončení studia.`);
        leave.push({ userId: u.id, reason, note: d?.leaveNote?.trim() || null });
      } else {
        throw new Error(`${name}: neplatný výsledek.`);
      }
    }

    const assignmentPlan = planAssignments(input.assignmentMode, await loadAssignments(current.id));

    await prisma.$transaction(
      async (tx) => {
        // 1. Doplnit historii aktuálního roku (kdyby někdo byl zařazen mimo setStudentClass)
        await tx.classMembership.createMany({
          data: students.map((u) => ({
            userId: u.id,
            classGroupId: u.classGroupId!,
            schoolYearId: current.id,
            grade: u.classGroup!.grade,
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

        // 3. Cílové třídy (chybějící se založí)
        const classIds = new Map<string, string>();
        const classFor = async (grade: number, letter: string) => {
          const key = `${grade}.${letter}`;
          if (!classIds.has(key)) classIds.set(key, (await findOrCreateClass(grade, letter, tx)).id);
          return classIds.get(key)!;
        };

        // 4. Postup a opakování – přesun do cílové třídy, v historii nového roku s důvodem
        for (const m of move) {
          await setStudentClass(tx, {
            userId: m.userId,
            classGroupId: await classFor(m.grade, m.letter),
            schoolYear: next,
            reason: m.reason,
          });
        }

        // 5. Absolventi a odcházející – ukončení studia a deaktivace účtu
        if (graduate.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: graduate } },
            data: { studyStatus: "GRADUATED", studyEndReason: "GRADUATED", studyEndedAt: now, isActive: false },
          });
        }
        for (const l of leave) {
          await tx.user.update({
            where: { id: l.userId },
            data: { studyStatus: "LEFT", studyEndReason: l.reason, studyEndedAt: now, studyEndNote: l.note, isActive: false },
          });
        }

        // 6. Úvazky do nového roku
        if (assignmentPlan.length > 0) {
          const data = [];
          for (const a of assignmentPlan) {
            data.push({
              teacherId: a.teacherId,
              subjectId: a.subjectId,
              classGroupId: await classFor(a.targetGrade, a.letter),
              schoolYearId: next.id,
            });
          }
          await tx.teachingAssignment.createMany({ data, skipDuplicates: true });
        }

        // 7. Historie změn (souhrnně; třídy studentů jsou v historii zařazení)
        await audit(tx, admin, {
          action: "school.year.close",
          entityType: "schoolYear",
          entityId: String(nextStart),
          summary:
            `Uzavřen školní rok ${schoolYearLabel(current.startYear)}, nový rok ${schoolYearLabel(nextStart)}: ` +
            `postoupilo ${move.filter((m) => m.reason === "PROMOTED").length}, opakuje ${move.filter((m) => m.reason === "REPEATED").length}, ` +
            `absolvovalo ${graduate.length}, ukončilo studium ${leave.length}, přenesených úvazků ${assignmentPlan.length}`,
          data: {
            promoted: move.filter((m) => m.reason === "PROMOTED").length,
            repeated: move.filter((m) => m.reason === "REPEATED").length,
            graduated: graduate.map((id) => id),
            left: leave.map((l) => ({ userId: l.userId, reason: l.reason })),
            assignmentMode: input.assignmentMode,
            assignments: assignmentPlan.length,
          },
        });
      },
      // Stovky studentů v jedné transakci – delší limit než výchozích 5 s
      { timeout: 120_000, maxWait: 10_000 }
    );

    revalidatePath("/", "layout");
    return {
      promoted: move.filter((m) => m.reason === "PROMOTED").length,
      repeated: move.filter((m) => m.reason === "REPEATED").length,
      graduated: graduate.length,
      left: leave.length,
      assignments: assignmentPlan.length,
      nextYearLabel: schoolYearLabel(nextStart),
    };
  });
}
