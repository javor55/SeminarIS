export type Role = "GUEST" | "STUDENT" | "TEACHER" | "ADMIN";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  classGroupId?: string | null;
  // Označení třídy studenta ("2.A"), jen v session při náhledu (banner)
  classLabel?: string | null;
  // Vyplněno jen v režimu „zobrazit jako“: admin, který právě uživatele prohlíží
  impersonatedBy?: { id: string; name: string } | null;
  lastLoginAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type EnrollmentStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";

export type EnrollmentWindow = {
  id: string;
  name: string;
  description?: string;
  status: EnrollmentStatus;
  startsAt: string | Date;
  endsAt: string | Date;
  visibleToStudents: boolean;
  // Cílové ročníky; prázdné = všichni
  targetGrades?: number[];
  createdById: string;
  updatedById?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type Block = {
  id: string;
  name: string;
  order: number;
  description?: string;
  enrollmentWindowId: string;
  createdById: string;
  updatedById?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
};

export type Subject = {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  syllabus?: string | null;
  grades?: number[];
  isActive: boolean;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date | null;
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
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
};

export type StudentEnrollment = {
  id: string;
  studentId: string;
  subjectOccurrenceId: string;
  createdById: string;
  updatedById?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
  deletedById?: string;
};

export type SubjectOccurrenceWithRelations = SubjectOccurrence & {
  subject: Subject;
  teacher?: User | null;
  enrollments: StudentEnrollment[];
};

export type EnrollmentWindowWithBlocks = EnrollmentWindow & {
  blocks: Array<
    Block & {
      occurrences: Array<SubjectOccurrenceWithRelations>;
    }
  >;
};
