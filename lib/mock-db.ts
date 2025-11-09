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
