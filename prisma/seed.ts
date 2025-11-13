
import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

async function main() {
  // pevné ID, aby se nám to dobře propojovalo
  const adminId = "usr_admin";
  const teacherId = "usr_teacher";
  const student1Id = "usr_stud1";
  const student2Id = "usr_stud2";

  // 1) Users
  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        firstName: "Admin",
        lastName: "Systému",
        email: "admin@skola.cz",
        passwordHash: null,
        role: "ADMIN",
        isActive: true,
      },
      {
        id: teacherId,
        firstName: "Petr",
        lastName: "Učitel",
        email: "teacher@skola.cz",
        passwordHash: null,
        role: "TEACHER",
        isActive: true,
      },
      {
        id: student1Id,
        firstName: "Jan",
        lastName: "Student",
        email: "jan.student@skola.cz",
        passwordHash: null,
        role: "STUDENT",
        isActive: true,
      },
      {
        id: student2Id,
        firstName: "Eva",
        lastName: "Studentová",
        email: "eva.studentova@skola.cz",
        passwordHash: null,
        role: "STUDENT",
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  // 2) Subjects
  const subjProgId = "subj_prog";
  const subjAjId = "subj_aj";
  const subjIoTId = "subj_iot";

  await prisma.subject.createMany({
    data: [
      {
        id: subjProgId,
        name: "Programování mikrokontrolérů",
        code: "PMK",
        syllabus: "Základy programování MCU, periferie, komunikace.",
        createdById: adminId,
      },
      {
        id: subjAjId,
        name: "Angličtina pro techniky",
        code: "AJT",
        syllabus: "Technická angličtina, prezentace, e-maily.",
        createdById: adminId,
      },
      {
        id: subjIoTId,
        name: "Základy IoT",
        code: "IOT",
        syllabus: "Senzory, sběr dat, OPC UA návaznost.",
        createdById: adminId,
      },
    ],
    skipDuplicates: true,
  });

  // 3) Enrollment window (otevřený zápis)
  const enrollmentId = "enr_ls_2025";
  await prisma.enrollmentWindow.upsert({
    where: { id: enrollmentId },
    update: {},
    create: {
      id: enrollmentId,
      name: "Zápis LS 2025",
      description: "Zápis na semináře pro letní semestr 2025",
      status: "OPEN",
      startsAt: new Date(Date.now() - 1000 * 60 * 60), // hodinu zpět
      visibleToStudents: true,
      createdById: adminId,
    },
  });

  // 4) Blocks
  const block1Id = "blk_1";
  const block2Id = "blk_2";

  await prisma.block.createMany({
    data: [
      {
        id: block1Id,
        name: "Blok 1 – povinné",
        order: 1,
        description: "Vyber 1 předmět",
        enrollmentWindowId: enrollmentId,
        createdById: adminId,
      },
      {
        id: block2Id,
        name: "Blok 2 – volitelné",
        order: 2,
        description: "Vyber 1 předmět",
        enrollmentWindowId: enrollmentId,
        createdById: adminId,
      },
    ],
    skipDuplicates: true,
  });

  // 5) Subject occurrences
  const occ1Id = "occ_prog_b1";
  const occ2Id = "occ_aj_a_b1";
  const occ3Id = "occ_aj_b_b1";
  const occ4Id = "occ_iot_b2";

  await prisma.subjectOccurrence.createMany({
    data: [
      {
        id: occ1Id,
        subjectId: subjProgId,
        blockId: block1Id,
        teacherId: teacherId,
        subCode: "A",
        capacity: 20,
        createdById: adminId,
      },
      {
        id: occ2Id,
        subjectId: subjAjId,
        blockId: block1Id,
        teacherId: teacherId,
        subCode: "A",
        capacity: 15,
        createdById: adminId,
      },
      {
        id: occ3Id,
        subjectId: subjAjId,
        blockId: block1Id,
        teacherId: teacherId,
        subCode: "B",
        capacity: 15,
        createdById: adminId,
      },
      {
        id: occ4Id,
        subjectId: subjIoTId,
        blockId: block2Id,
        teacherId: teacherId,
        subCode: "A",
        capacity: null, // neomezená
        createdById: adminId,
      },
    ],
    skipDuplicates: true,
  });

  // 6) Student enrollments (ať je co vidět v UI)
  await prisma.studentEnrollment.createMany({
    data: [
      {
        id: "enroll_stud1_prog",
        studentId: student1Id,
        subjectOccurrenceId: occ1Id,
        createdById: student1Id,
      },
      {
        id: "enroll_stud2_aj",
        studentId: student2Id,
        subjectOccurrenceId: occ2Id,
        createdById: student2Id,
      },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Seed hotov.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
