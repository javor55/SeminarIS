import {
  users,
  subjects,
  enrollmentWindows,
  blocks,
  subjectOccurrences,
  studentEnrollments,
} from "./mock-db";
import {
  EnrollmentWindowWithBlocks,
  User,
  Subject,
  EnrollmentWindow,
} from "./types";

//export function getCurrentUser(): User {
//  return users.find((u) => u.id === "u-admin")!;
//}

export function getSubjects(): Subject[] {
  return subjects;
}

export function getSubjectById(id: string): Subject | undefined {
  return subjects.find((s) => s.id === id);
}

export function getEnrollmentWindowsVisible(): EnrollmentWindow[] {
  return enrollmentWindows.filter(
    (e) => e.visibleToStudents && e.status !== "DRAFT"
  );
}

export function getEnrollmentWindowByIdWithBlocks(
  id: string
): EnrollmentWindowWithBlocks | undefined {
  const ew = enrollmentWindows.find((e) => e.id === id);
  if (!ew) return;
  const ewBlocks = blocks
    .filter((b) => b.enrollmentWindowId === ew.id && !b.deletedAt)
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const occs = subjectOccurrences
        .filter((o) => o.blockId === b.id && !o.deletedAt)
        .map((o) => {
          const subject = subjects.find((s) => s.id === o.subjectId)!;
          const teacher = users.find((u) => u.id === o.teacherId)!;
          const enrolls = studentEnrollments.filter(
            (se) => se.subjectOccurrenceId === o.id && !se.deletedAt
          );
          return {
            ...o,
            subject,
            teacher,
            enrollments: enrolls,
          };
        });
      return { ...b, occurrences: occs };
    });

  return {
    ...ew,
    blocks: ewBlocks,
  };
}

export function getAllUsers() {
  return users;
}
