import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";
import { classLabel, compareClasses, subjectInGrade } from "@/lib/school";
import { getCurrentSchoolYear } from "@/modules/core/school";
import { formatName, sortByText } from "@/lib/names";

// Data stránky „Moje předměty“ (jádro): učitel – úvazky, student – předměty ročníku a jejich vyučující.
// Části modulů (semináře, dopisování) dodávají body rozšíření getMySubjectsSections.

const fullName = (u: { firstName: string; lastName: string }) => formatName(u, "list");

export type MyTeachingSubject = { id: string; name: string; code: string | null; isActive: boolean; classes: string[] };
export type MyGradeSubject = { id: string; name: string; code: string | null; teachers: string[] };

/** Učitel: předměty a třídy z úvazků v aktuálním školním roce. */
export async function getMyTeaching(userId: string): Promise<MyTeachingSubject[]> {
  const year = await getCurrentSchoolYear();
  if (!year.id) return [];
  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId: userId, schoolYearId: year.id },
    include: { subject: true, classGroup: true },
  });
  const bySubject = new Map<string, MyTeachingSubject & { groups: { grade: number; letter: string }[] }>();
  for (const a of assignments) {
    const entry = bySubject.get(a.subjectId) ?? { id: a.subjectId, name: a.subject.name, code: a.subject.code, isActive: a.subject.isActive, classes: [], groups: [] };
    entry.groups.push(a.classGroup);
    bySubject.set(a.subjectId, entry);
  }
  return [...bySubject.values()]
    .map(({ groups, ...s }) => ({ ...s, classes: groups.sort(compareClasses).map(classLabel) }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

/** Student: aktivní předměty jeho ročníku a vyučující jeho třídy (z úvazků). */
export async function getMyGradeSubjects(user: User): Promise<{ classLabel: string | null; subjects: MyGradeSubject[] }> {
  const student = await prisma.user.findUnique({
    where: { id: user.id },
    select: { classGroup: true, classGroupId: true, studyStatus: true },
  });
  if (!student?.classGroup || student.studyStatus !== "ACTIVE") return { classLabel: null, subjects: [] };
  const year = await getCurrentSchoolYear();
  const [subjects, assignments] = await Promise.all([
    prisma.subject.findMany({ where: { isActive: true } }),
    year.id
      ? prisma.teachingAssignment.findMany({
          where: { classGroupId: student.classGroup.id, schoolYearId: year.id },
          include: { teacher: { select: { firstName: true, lastName: true } } },
        })
      : [],
  ]);
  return {
    classLabel: classLabel(student.classGroup),
    subjects: sortByText(subjects, (s) => s.name)
      .filter((s) => subjectInGrade(s.grades, student.classGroup!.grade))
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        teachers: [...new Set(assignments.filter((a) => a.subjectId === s.id).map((a) => fullName(a.teacher)))].sort((a, b) => a.localeCompare(b, "cs")),
      })),
  };
}
