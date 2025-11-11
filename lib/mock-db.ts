import {
  User,
  Subject,
  EnrollmentWindow,
  Block,
  SubjectOccurrence,
  StudentEnrollment,
} from "./types";

const now = new Date().toISOString();

// lib/mock-db.ts

// ... tvoje export const studentEnrollments = [...]

export function enrollStudent(studentId: string, occurrenceId: string) {
  const newEnrollment: StudentEnrollment = {
    id: `se-${Date.now()}`, // jednoduché id
    studentId,
    subjectOccurrenceId: occurrenceId,
    createdById: studentId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  studentEnrollments.push(newEnrollment);
  return newEnrollment;
}

export function unenrollStudent(enrollmentId: string) {
  const index = studentEnrollments.findIndex((e) => e.id === enrollmentId);
  if (index !== -1) {
    studentEnrollments.splice(index, 1);
    return true;
  }
  return false;
}

/** Smaže blok podle ID (včetně jeho výskytů/předmětů) */
export function deleteBlock(blockId: string) {
  const blockIndex = blocks.findIndex((b) => b.id === blockId);
  if (blockIndex === -1) return false;

  // Smažeme všechny subjectOccurrences navázané na blok
  for (let i = subjectOccurrences.length - 1; i >= 0; i--) {
    if (subjectOccurrences[i].blockId === blockId) {
      subjectOccurrences.splice(i, 1);
    }
  }

  blocks.splice(blockIndex, 1);
  return true;
}

/** Posune blok nahoru nebo dolů */
export function moveBlock(blockId: string, direction: "UP" | "DOWN") {
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index === -1) return false;

  const newIndex = direction === "UP" ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= blocks.length) return false;

  const [block] = blocks.splice(index, 1);
  blocks.splice(newIndex, 0, block);

  // aktualizuj pořadí (order)
  blocks.forEach((b, i) => (b.order = i + 1));
  return true;
}

/** Uloží úpravu bloku (mock) */
export function updateBlock(block: Block) {
  const index = blocks.findIndex((b) => b.id === block.id);
  if (index !== -1) {
    blocks[index] = {
      ...blocks[index],
      ...block,
      updatedAt: new Date().toISOString(),
    };
    return true;
  }
  return false;
}
/** Uloží úpravu předmětu (mock) */
export function updateSubject(subject: Subject & { syllabus?: string }) {
  const idx = subjects.findIndex((s) => s.id === subject.id);
  if (idx === -1) return false;
  subjects[idx] = { ...subjects[idx], ...subject };
  return true;
}

export function createSubject(newSubject: Partial<Subject>): Subject {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  const authorId =
    newSubject.createdById ||
    newSubject.updatedById ||
    users[0]?.id || // fallback na prvního uživatele z mocku
    "system";

  const subject: Subject = {
    id,
    name: newSubject.name || "Nový předmět",
    code: newSubject.code || "",
    description: newSubject.description || "",
    syllabus: newSubject.syllabus || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdById: authorId,   // 👈 DOPLNĚNO
    updatedById: authorId,   // 👈 ať je to konzistentní
  };

  subjects.push(subject);
  return subject;
}

export function updateUserRole(userId: string, role: string) {
  const user = users.find((u) => u.id === userId);
  if (!user) return false;
  user.role = role as any;
  return true;
}

export function toggleUserActive(userId: string) {
  const user = users.find((u) => u.id === userId);
  if (!user) return false;
  user.isActive = !user.isActive;
  return true;
}






/* ---------------------- USERS ---------------------- */
export const users: User[] = [
  // Admins
  {
    id: "u-admin1",
    firstName: "Adam",
    lastName: "Admin",
    email: "admin@skola.cz",
    role: "ADMIN",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-admin2",
    firstName: "Alice",
    lastName: "Adminová",
    email: "alice.admin@skola.cz",
    role: "ADMIN",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-admin3",
    firstName: "Robert",
    lastName: "Ředitel",
    email: "reditel@skola.cz",
    role: "ADMIN",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },

  // Teachers
  {
    id: "u-teacher1",
    firstName: "Tereza",
    lastName: "Teacherová",
    email: "terezka@skola.cz",
    role: "TEACHER",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-teacher2",
    firstName: "Tomáš",
    lastName: "Programátor",
    email: "tomas.programator@skola.cz",
    role: "TEACHER",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-teacher3",
    firstName: "Veronika",
    lastName: "Dědičová",
    email: "veronika.dedicova@skola.cz",
    role: "TEACHER",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },

  // Students
  {
    id: "u-student1",
    firstName: "Samuel",
    lastName: "Student",
    email: "samuel@student.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-student2",
    firstName: "Petra",
    lastName: "Nováková",
    email: "petra@student.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-student3",
    firstName: "Martin",
    lastName: "Horák",
    email: "martin@student.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-student4",
    firstName: "Lucie",
    lastName: "Procházková",
    email: "lucie@student.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-student5",
    firstName: "Pavel",
    lastName: "Kovář",
    email: "pavel@student.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },

  // Guests
  {
    id: "u-guest1",
    firstName: "Gustav",
    lastName: "Guest",
    email: "guest@skola.cz",
    role: "GUEST",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "u-guest2",
    firstName: "Hana",
    lastName: "Hostová",
    email: "host@skola.cz",
    role: "GUEST",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
{
    id: "newu-admin1",
    firstName: "Petr",
    lastName: "Novák",
    email: "petr.novak@skola.cz",
    role: "ADMIN",
    isActive: true,
    createdAt: "2023-01-10T08:00:00Z",
    updatedAt: "2023-11-05T10:30:00Z",
  },
  {
    id: "newu-user3",
    firstName: "Jana",
    lastName: "Svobodová",
    email: "jana.svobodova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-02-15T10:30:15Z",
    updatedAt: "2023-10-20T14:00:00Z",
  },
  {
    id: "newu-user4",
    firstName: "Martin",
    lastName: "Dvořák",
    email: "martin.dvorak@skola.cz",
    role: "STUDENT",
    isActive: false,
    createdAt: "2023-03-01T11:00:00Z",
    updatedAt: "2023-09-01T11:00:00Z",
  },
  {
    id: "newu-user5",
    firstName: "Eva",
    lastName: "Černá",
    email: "eva.cerna@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-03-05T14:20:00Z",
    updatedAt: "2023-03-05T14:20:00Z",
  },
  {
    id: "newu-guest3",
    firstName: "Tomáš",
    lastName: "Procházka",
    email: "tomas.prochazka@skola.cz",
    role: "GUEST",
    isActive: true,
    createdAt: "2023-04-10T09:05:00Z",
    updatedAt: "2023-04-10T09:05:00Z",
  },
  {
    id: "newu-user6",
    firstName: "Lucie",
    lastName: "Kučerová",
    email: "lucie.kucerova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-04-22T16:00:00Z",
    updatedAt: "2023-11-01T12:15:00Z",
  },
  {
    id: "newu-user7",
    firstName: "Jakub",
    lastName: "Veselý",
    email: "jakub.vesely@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-05-02T07:30:00Z",
    updatedAt: "2023-05-02T07:30:00Z",
  },
  {
    id: "newu-user8",
    firstName: "Kateřina",
    lastName: "Horáková",
    email: "katerina.horakova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-05-15T13:00:00Z",
    updatedAt: "2023-05-15T13:00:00Z",
  },
  {
    id: "newu-guest4",
    firstName: "Pavel",
    lastName: "Němec",
    email: "pavel.nemec@skola.cz",
    role: "GUEST",
    isActive: false,
    createdAt: "2023-06-01T10:00:00Z",
    updatedAt: "2023-07-20T09:00:00Z",
  },
  {
    id: "newu-user9",
    firstName: "Veronika",
    lastName: "Marková",
    email: "veronika.markova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-06-10T11:45:00Z",
    updatedAt: "2023-10-30T18:00:00Z",
  },
  {
    id: "newu-user10",
    firstName: "Lukáš",
    lastName: "Novotný",
    email: "lukas.novotny@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-07-07T08:10:00Z",
    updatedAt: "2023-07-07T08:10:00Z",
  },
  {
    id: "newu-user11",
    firstName: "Anna",
    lastName: "Doležalová",
    email: "anna.dolezalova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-07-20T12:00:00Z",
    updatedAt: "2023-07-20T12:00:00Z",
  },
  {
    id: "newu-admin2",
    firstName: "Ondřej",
    lastName: "Krejčí",
    email: "ondrej.krejci@skola.cz",
    role: "ADMIN",
    isActive: true,
    createdAt: "2023-08-01T06:00:00Z",
    updatedAt: "2023-11-10T09:00:00Z",
  },
  {
    id: "newu-user12",
    firstName: "Barbora",
    lastName: "Čermáková",
    email: "barbora.cermakova@skola.cz",
    role: "STUDENT",
    isActive: false,
    createdAt: "2023-08-15T14:50:00Z",
    updatedAt: "2023-08-15T14:50:00Z",
  },
  {
    id: "newu-user13",
    firstName: "Marek",
    lastName: "Malý",
    email: "marek.maly@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-09-01T09:25:00Z",
    updatedAt: "2023-09-10T10:10:00Z",
  },
  {
    id: "newu-user14",
    firstName: "Tereza",
    lastName: "Kolářová",
    email: "tereza.kolarova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-09-10T10:00:00Z",
    updatedAt: "2023-09-10T10:00:00Z",
  },
  {
    id: "newu-guest5",
    firstName: "Michal",
    lastName: "Růžička",
    email: "michal.ruzicka@skola.cz",
    role: "GUEST",
    isActive: true,
    createdAt: "2023-10-01T11:11:00Z",
    updatedAt: "2023-10-01T11:11:00Z",
  },
  {
    id: "newu-user15",
    firstName: "Zuzana",
    lastName: "Fialová",
    email: "zuzana.fialova@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-10-15T17:00:00Z",
    updatedAt: "2023-11-02T13:20:00Z",
  },
  {
    id: "newu-user16",
    firstName: "David",
    lastName: "Jelínek",
    email: "david.jelinek@skola.cz",
    role: "STUDENT",
    isActive: true,
    createdAt: "2023-11-01T10:00:00Z",
    updatedAt: "2023-11-01T10:00:00Z",
  },
  {
    id: "newu-user17",
    firstName: "Nikola",
    lastName: "Benešová",
    email: "nikola.benesova@skola.cz",
    role: "STUDENT",
    isActive: false,
    createdAt: "2023-11-10T15:00:00Z",
    updatedAt: "2023-11-10T15:00:00Z",
  },


];

/* ---------------------- SUBJECTS ---------------------- */
export const subjects: Subject[] = [
  {
    id: "s-uml",
    name: "UML v praxi",
    code: "INF101",
    description: "Základy UML, příklady, cvičení.",
    syllabus: "<p>Základy UML, příklady, cvičení.</p>",
    createdById: "u-teacher1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-web",
    name: "Webové aplikace",
    code: "WEB201",
    description: "Frontend, backend, HTTP, REST API, React.",
    syllabus: "<p>Frontend, backend, HTTP, REST API, React.</p>",
    createdById: "u-teacher2",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-db",
    name: "Databázové systémy",
    code: "DB301",
    description: "SQL, relace, indexy, transakce.",
    syllabus: "<p>SQL, relace, indexy, transakce.</p>",
    createdById: "u-teacher3",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-ai",
    name: "Základy umělé inteligence",
    code: "AI401",
    description: "Vyhledávání, logika, neuronové sítě.",
    syllabus: "<p>Vyhledávání, logika, neuronové sítě.</p>",
    createdById: "u-teacher2",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-net",
    name: "Počítačové sítě",
    code: "NET202",
    description: "TCP/IP, směrování, síťové protokoly.",
    syllabus: "<p>TCP/IP, směrování, síťové protokoly.</p>",
    createdById: "u-teacher1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-secur",
    name: "Informační bezpečnost",
    code: "SEC301",
    description: "Kryptografie, autentizace, zabezpečení aplikací.",
    syllabus: "<p>Kryptografie, autentizace, zabezpečení aplikací.</p>",
    createdById: "u-teacher3",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-ml",
    name: "Machine Learning",
    code: "ML501",
    description: "Regrese, klasifikace, scikit-learn, TensorFlow.",
    syllabus: "<p>Regrese, klasifikace, scikit-learn, TensorFlow.</p>",
    createdById: "u-teacher2",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "s-pm",
    name: "Projektový management",
    code: "PM101",
    description: "Agilní řízení, Scrum, komunikace v týmu.",
    syllabus: "<p>Agilní řízení, Scrum, komunikace v týmu.</p>",
    createdById: "u-teacher1",
    createdAt: now,
    updatedAt: now,
  },
];

/* ---------------------- ENROLLMENT WINDOWS ---------------------- */
export const enrollmentWindows: EnrollmentWindow[] = [
  {
    id: "ew-ls-2025",
    name: "Zápis LS 2025",
    description: "Vyberte si jeden seminář v každém bloku.",
    status: "OPEN",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    visibleToStudents: true,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },  
  {
    id: "ew-ls-2024",
    name: "Zápis LS 2023",
    description: "Vyberte si jeden seminář v každém bloku.",
    status: "OPEN",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    visibleToStudents: true,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
    {
    id: "ew-ls-2023",
    name: "Zápis LS 2023",
    description: "Vyberte si jeden seminář v každém bloku.",
    status: "OPEN",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    visibleToStudents: true,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
];

/* ---------------------- BLOCKS ---------------------- */
export const blocks: Block[] = [
  {
    id: "b-1",
    name: "Blok 1 – povinné předměty",
    order: 1,
    description: "Blok 1 – povinné předměty",
    enrollmentWindowId: "ew-ls-2025",
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "b-2",
    name: "Blok 2 – volitelné předměty",
    order: 2,
    description: "Blok 2 – volitelné předměty",
    enrollmentWindowId: "ew-ls-2025",
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
   {
    id: "b-3",
    name: "Blok 2 – volitelné předměty",
    order: 2,
    description: "Blok 2 – volitelné předměty",
    enrollmentWindowId: "ew-ls-2024",
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
    {
    id: "b-4",
    name: "Blok 1 – povinné předměty",
    order: 1,
    description: "Blok 1 – povinné předměty",
    enrollmentWindowId: "ew-ls-2023",
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "b-5",
    name: "Blok 2 – volitelné předměty",
    order: 2,
    description: "Blok 2 – volitelné předměty",
    enrollmentWindowId: "ew-ls-2023",
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
   {
    id: "b-6",
    name: "Blok 2 – volitelné předměty",
    order: 2,
    description: "Blok 2 – volitelné předměty",
    enrollmentWindowId: "ew-ls-2023",
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
];

/* ---------------------- SUBJECT OCCURRENCES ---------------------- */
export const subjectOccurrences: SubjectOccurrence[] = [
  // Blok 1
  {
    id: "so-uml-A",
    subjectId: "s-uml",
    blockId: "b-1",
    teacherId: "u-teacher1",
    subCode: "A",
    capacity: 25,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-uml-B",
    subjectId: "s-uml",
    blockId: "b-2",
    teacherId: "u-teacher1",
    subCode: "B",
    capacity: 25,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-web-A",
    subjectId: "s-web",
    blockId: "b-1",
    teacherId: "u-teacher2",
    subCode: "A",
    capacity: 20,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-db-A",
    subjectId: "s-db",
    blockId: "b-1",
    teacherId: "u-teacher3",
    subCode: "A",
    capacity: 30,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },

  // Blok 2
  {
    id: "so-ai-A",
    subjectId: "s-ai",
    blockId: "b-2",
    teacherId: "u-teacher2",
    subCode: "A",
    capacity: 15,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-net-A",
    subjectId: "s-net",
    blockId: "b-2",
    teacherId: "u-teacher1",
    subCode: "A",
    capacity: 10,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-secur-A",
    subjectId: "s-secur",
    blockId: "b-2",
    teacherId: "u-teacher3",
    subCode: "A",
    capacity: 12,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-ml-A",
    subjectId: "s-ml",
    blockId: "b-2",
    teacherId: "u-teacher2",
    subCode: "A",
    capacity: 18,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "so-pm-A",
    subjectId: "s-pm",
    blockId: "b-2",
    teacherId: "u-teacher1",
    subCode: "A",
    capacity: 25,
    createdById: "u-admin1",
    createdAt: now,
    updatedAt: now,
  },
];

/* ---------------------- STUDENT ENROLLMENTS ---------------------- */
export const studentEnrollments: StudentEnrollment[] = [
  {
    id: "se-1",
    studentId: "u-student1",
    subjectOccurrenceId: "so-uml-A",
    createdById: "u-student1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "se-2",
    studentId: "u-student2",
    subjectOccurrenceId: "so-web-A",
    createdById: "u-student2",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "se-3",
    studentId: "u-student3",
    subjectOccurrenceId: "so-db-A",
    createdById: "u-student3",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "se-4",
    studentId: "u-student4",
    subjectOccurrenceId: "so-ai-A",
    createdById: "u-student4",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "se-5",
    studentId: "u-student5",
    subjectOccurrenceId: "so-net-A",
    createdById: "u-student5",
    createdAt: now,
    updatedAt: now,
  },
];
