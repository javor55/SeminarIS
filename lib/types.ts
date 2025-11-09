export type Role = "GUEST" | "STUDENT" | "TEACHER" | "ADMIN";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";

export type EnrollmentWindow = {
  id: string;
  name: string;
  description?: string;
  status: EnrollmentStatus;
  startsAt: string;
  endsAt: string;
  visibleToStudents: boolean;
  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
};

export type Block = {
  id: string;
  name: string;
  order: number;
  description?: string;
  enrollmentWindowId: string;
  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Subject = {
  id: string;
  name: string;
  description: string;
  code?: string;
  syllabus: string;
  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
};

export type SubjectOccurrence = {
  id: string;
  subjectId: string;
  blockId: string;
  teacherId: string;
  subCode?: string;
  capacity: number | null;
  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type StudentEnrollment = {
  id: string;
  studentId: string;
  subjectOccurrenceId: string;
  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedById?: string;
};

export type EnrollmentWindowWithBlocks = EnrollmentWindow & {
  blocks: Array<
    Block & {
      occurrences: Array<
        SubjectOccurrence & {
          subject: Subject;
          teacher: User;
          enrollments: StudentEnrollment[];
        }
      >;
    }
  >;
};
