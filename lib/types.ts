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

export type EnrollmentWindow = {
  id: string;
  name: string;
  description?: string;
  startsAt: string | Date;
  endsAt: string | Date;
  // Zveřejněno studentům (false = koncept) a předčasné uzavření; stav plánováno / otevřeno / uzavřeno
  // se odvozuje z dat (`phase` dodává server, viz modules/seminars/window-phase.ts)
  published: boolean;
  closedEarlyAt?: string | Date | null;
  phase?: "DRAFT" | "PLANNED" | "OPEN" | "CLOSED";
  phaseLabel?: string;
  closedEarly?: boolean;
  canReopen?: boolean;
  canCloseEarly?: boolean;
  // Pravidla okna (modul Semináře): smí se student sám odepsat, do kdy smí měnit zápis (null = konec okna),
  // co o zapsaných vidí studenti
  allowSelfUnenroll?: boolean;
  changesUntil?: string | Date | null;
  resultsVisibility?: "COUNTS" | "NAMES";
  // Publikum okna (jen pro učitele a adminy): ročníky, třídy, studenti, vynechaní a čitelný popis
  audienceView?: {
    draft: { grades: number[]; classIds: string[]; userIds: string[]; excludeUserIds: string[] };
    classes: { id: string; label: string }[];
    users: { id: string; name: string; email: string }[];
    excluded: { id: string; name: string; email: string }[];
    summary: string;
  };
  // Automatická připomínka nezapsaným N dní před koncem (null = ne)
  reminderDaysBefore?: number | null;
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
  // Povinný blok a počet zápisů, které student v bloku má / smí mít
  required?: boolean;
  minEnrollments?: number;
  maxEnrollments?: number;
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
  // Omezení výskytu na ročníky a třídy (obojí prázdné = bez omezení)
  restrictGrades?: number[];
  restrictClasses?: { id: string; grade: number; letter: string }[];
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
  // Student dostane jen své zápisy; počet všech zápisů je v `enrolledCount`
  enrollments: StudentEnrollment[];
  enrolledCount?: number;
};

export type EnrollmentWindowWithBlocks = EnrollmentWindow & {
  blocks: Array<
    Block & {
      occurrences: Array<SubjectOccurrenceWithRelations>;
    }
  >;
};
