import type { TxClient } from "@/lib/prisma";
import { readTable } from "@/lib/csv";
import { classLabel, parseClassLabel, schoolYearLabel, subjectInGrade } from "@/lib/school";
import { ensureCurrentSchoolYear } from "@/modules/core/school";
import type { ImportPlan, ImportPreviewRow } from "./types";

// Import úvazků (učitel × předmět × třída) pro aktuální školní rok. Klíč = trojice, opakovaný
// import úvazky nezdvojí. Nic se nemaže ani nemění, jen se přidávají chybějící úvazky.

const FIELDS = {
  teacher: ["emailucitele", "email", "ucitel", "teacher", "teacheremail"],
  subject: ["kodpredmetu", "kod", "predmet", "zkratka", "subject", "subjectcode", "code"],
  class: ["trida", "class", "classgroup"],
};
const LABELS = { teacher: "email_ucitele", subject: "kod_predmetu", class: "trida" };

export async function planAssignmentsImport(db: TxClient, content: string): Promise<ImportPlan> {
  const table = readTable(content, FIELDS, ["teacher", "subject", "class"], LABELS);
  if (table.fileError) return { rows: [], fileError: table.fileError, apply: async () => ({}) };

  const year = await ensureCurrentSchoolYear();
  const [teachers, subjects, classes, assignments] = await Promise.all([
    db.user.findMany({ where: { email: { in: table.rows.map((r) => r.v.teacher.trim().toLowerCase()).filter(Boolean), mode: "insensitive" } } }),
    db.subject.findMany({ where: { code: { not: null } } }),
    db.classGroup.findMany(),
    db.teachingAssignment.findMany({ where: { schoolYearId: year.id } }),
  ]);
  const teacherByEmail = new Map(teachers.map((t) => [t.email.toLowerCase(), t]));
  const subjectByCode = new Map(subjects.map((s) => [s.code!.toUpperCase(), s]));
  const classByKey = new Map(classes.map((c) => [`${c.grade}${c.letter}`, c]));
  const have = new Set(assignments.map((a) => `${a.teacherId}|${a.subjectId}|${a.classGroupId}`));

  const rows: ImportPreviewRow[] = [];
  const fresh: { teacherId: string; subjectId: string; classGroupId: string }[] = [];
  const seen = new Map<string, number>();

  for (const { line, v } of table.rows) {
    const email = v.teacher.trim().toLowerCase();
    const code = v.subject.trim().toUpperCase();
    const title = `${email || "?"} · ${code || "?"} · ${v.class.trim() || "?"}`;
    const fail = (error: string) => rows.push({ line, status: "error", title, changes: [], error });

    if (!email) { fail("chybí e-mail učitele"); continue; }
    if (!code) { fail("chybí kód předmětu"); continue; }
    if (!v.class.trim()) { fail("chybí třída"); continue; }
    const teacher = teacherByEmail.get(email);
    if (!teacher) { fail(`učitel s e-mailem ${email} neexistuje`); continue; }
    if (teacher.role !== "TEACHER" && teacher.role !== "ADMIN") { fail(`uživatel ${email} není učitel`); continue; }
    const subject = subjectByCode.get(code);
    if (!subject) { fail(`předmět se zkratkou ${code} neexistuje`); continue; }
    if (!subject.isActive) { fail(`předmět ${code} je archivovaný`); continue; }
    const parsed = parseClassLabel(v.class);
    const cls = parsed ? classByKey.get(`${parsed.grade}${parsed.letter}`) : undefined;
    if (!cls) { fail(`třída „${v.class.trim()}“ neexistuje (třídy se zakládají v Administraci → Školní rok a třídy)`); continue; }
    if (!subjectInGrade(subject.grades, cls.grade)) { fail(`předmět ${code} se v ${cls.grade}. ročníku nevyučuje`); continue; }

    const key = `${teacher.id}|${subject.id}|${cls.id}`;
    if (seen.has(key)) { fail(`stejný úvazek je v souboru už na řádku ${seen.get(key)}`); continue; }
    seen.set(key, line);

    const shown = `${teacher.lastName} ${teacher.firstName} · ${subject.name} · ${classLabel(cls)}`.trim();
    if (have.has(key)) {
      rows.push({ line, status: "unchanged", title: shown, changes: ["úvazek už existuje"] });
    } else {
      fresh.push({ teacherId: teacher.id, subjectId: subject.id, classGroupId: cls.id });
      rows.push({ line, status: "new", title: shown, changes: [`nový úvazek ${schoolYearLabel(year.startYear)}`] });
    }
  }

  return {
    rows,
    apply: async (tx) => {
      const res = await tx.teachingAssignment.createMany({
        data: fresh.map((f) => ({ ...f, schoolYearId: year.id })),
        skipDuplicates: true,
      });
      return { created: res.count, schoolYear: schoolYearLabel(year.startYear), teacherIds: [...new Set(fresh.map((f) => f.teacherId))] };
    },
  };
}
