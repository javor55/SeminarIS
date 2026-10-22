"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, requireModule, requirePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { getViewerGrade, windowsForGradeWhere } from "@/modules/seminars/eligibility";

export async function getSubjects() {
  const user = await requireAuth();
  await requireModule("seminars");
  const isPrivileged = can(user.role, "seminars.windows.view");
  const grade = await getViewerGrade(user);

  const subjects = await prisma.seminar.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      subjectOccurrences: {
        where: {
          deletedAt: null,
          ...( !isPrivileged ? {
            block: {
              enrollmentWindow: {
                visibleToStudents: true,
                status: { not: "DRAFT" },
                // jen zápisy určené pro ročník studenta
                ...(grade !== undefined ? windowsForGradeWhere(grade) : {}),
              }
            }
          } : {})
        },
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
          block: {
             include: {
                enrollmentWindow: true
             }
          }
        }
      }
    }
  });

  // Pokud je to student/host, vyfiltrujeme předměty, které nemají žádný viditelný výskyt
  // (Učitelé/Admini vidí všechny předměty vždy)
  const filtered = !isPrivileged
    ? subjects.filter(s => s.subjectOccurrences.length > 0)
    : subjects;

  return JSON.parse(JSON.stringify(filtered));
}

export async function createSubject(subject: { name: string; code?: string; description?: string; syllabus: string }) {
  const admin = await requirePermission("seminars.subjects.edit");
  const res = await prisma.seminar.create({
    data: {
      name: subject.name,
      code: subject.code,
      description: subject.description,
      syllabus: subject.syllabus,
      createdById: admin.id,
    },
  });
  revalidatePath("/", "layout");
  return res;
}

export async function toggleSubjectActive(subjectId: string) {
  await requirePermission("seminars.subjects.archive");
  const targetSubject = await prisma.seminar.findUnique({ where: { id: subjectId } });
  if (!targetSubject) return;

  const res = await prisma.seminar.update({
    where: { id: subjectId },
    data: { isActive: !targetSubject.isActive },
  });
  revalidatePath("/", "layout");
  return res;
}

export async function updateSubject(subject: { id: string; name: string; code?: string; description?: string; syllabus: string }) {
  const admin = await requirePermission("seminars.subjects.edit");
  return await prisma.seminar.update({
    where: { id: subject.id },
    data: {
      name: subject.name,
      code: subject.code,
      description: subject.description,
      syllabus: subject.syllabus,
      updatedById: admin.id,
      updatedAt: new Date(),
    },
  });
}

/**
 * Trvale smaže předmět včetně všech jeho výskytů (SubjectOccurrence) a zápisů studentů
 * (StudentEnrollment). Kaskáda je zajištěna na úrovni DB (onDelete: Cascade).
 * Pouze ADMIN.
 */
export async function deleteSubjectPermanently(subjectId: string) {
  await requirePermission("seminars.subjects.archive");

  const subject = await prisma.seminar.findUnique({ where: { id: subjectId } });
  if (!subject) throw new Error("Předmět nenalezen.");

  await prisma.seminar.delete({ where: { id: subjectId } });
  revalidatePath("/", "layout");
}
