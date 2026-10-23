// Datové typy modulu Dopisování posílané do klienta (data jako ISO řetězce).

export type MakeupSubjectRef = { id: string; name: string; code: string | null };

export type MakeupSessionItem = {
  id: string;
  teacherId: string;
  teacherName: string;
  startsAt: string;
  endsAt: string;
  room: string;
  capacity: number;
  registeredCount: number;
  changeDeadlineMinutes: number;
  // okamžik, do kdy lze zapsat / odhlásit / přepsat
  changeDeadline: string;
  note: string | null;
  seriesId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  subjects: MakeupSubjectRef[];
  // Smí přihlášený uživatel termín spravovat (vlastní termín nebo admin)?
  canManage: boolean;
  // Zápis přihlášeného studenta na tento termín
  myRegistrationId: string | null;
};

export type MakeupAttendanceValue = "REGISTERED" | "ATTENDED" | "NO_SHOW";

export type MakeupRegistrationItem = {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  classLabel: string | null;
  note: string | null;
  attendance: MakeupAttendanceValue;
  subjects: (MakeupSubjectRef & { subjectTeacherName: string | null })[];
  createdAt: string;
};

export type MyRegistrationItem = MakeupRegistrationItem & { session: MakeupSessionItem };

export type SessionInput = {
  // Dozor; učitel vypisuje sobě, admin může komukoli
  teacherId?: string;
  room: string;
  capacity: number;
  subjectIds: string[];
  changeDeadlineMinutes: number;
  note?: string;
};

export const ATTENDANCE_LABELS: Record<MakeupAttendanceValue, string> = {
  REGISTERED: "zapsán(a)",
  ATTENDED: "dopsal(a)",
  NO_SHOW: "nedostavil(a) se",
};

// Volby uzávěrky (minuty před začátkem)
export const DEADLINE_OPTIONS = [0, 30, 60, 120, 1440, 2880] as const;
