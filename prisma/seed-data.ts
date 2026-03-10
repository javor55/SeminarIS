import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding test data...");

  // 1. Vyčistíme stávající data
  await prisma.studentEnrollment.deleteMany();
  await prisma.subjectOccurrence.deleteMany();
  await prisma.block.deleteMany();
  await prisma.enrollmentWindow.deleteMany();
  await prisma.subject.deleteMany();
  
  // Nesmažeme admina, abychom ho nemigrovali a nerozbili přihlášení, ale smažeme vygenerované
  await prisma.user.deleteMany({
    where: { NOT: { role: "ADMIN" } }
  });

  // Necháme si prvního admina
  let admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        firstName: "Admin",
        lastName: "Správce",
        email: "admin@test.cz",
        passwordHash: await bcrypt.hash("admin", 10),
        role: "ADMIN",
        isActive: true,
      }
    });
  }

  // 2. Vytvoříme uživatele (Učitelé)
  console.log(" - Učitelé");
  const t1 = await prisma.user.create({ data: { firstName: "Jan", lastName: "Novák", email: "jan.novak@skola.cz", passwordHash: await bcrypt.hash("1234", 10), role: "TEACHER" } });
  const t2 = await prisma.user.create({ data: { firstName: "Petra", lastName: "Svobodová", email: "petra.svobodova@skola.cz", passwordHash: await bcrypt.hash("1234", 10), role: "TEACHER" } });
  const t3 = await prisma.user.create({ data: { firstName: "Jiří", lastName: "Kovář", email: "jiri.kovar@skola.cz", passwordHash: await bcrypt.hash("1234", 10), role: "TEACHER" } });

  // 3. Vytvoříme uživatele (Studenti)
  console.log(" - Studenti");
  const students = [];
  const jmena = ["Tomáš", "Michal", "Pavel", "Lucie", "Klára", "Tereza", "Matěj", "Ondřej", "Adéla", "Barbora"];
  const prijmeni = ["Dvořák", "Černý", "Procházka", "Kučerová", "Veselá", "Krejčí", "Horák", "Němec", "Pokorná", "Marková"];
  
  for(let i=0; i<30; i++) {
    const s = await prisma.user.create({
      data: {
        firstName: jmena[Math.floor(Math.random() * jmena.length)],
        lastName: prijmeni[Math.floor(Math.random() * prijmeni.length)],
        email: `student${i}@skola.cz`,
        passwordHash: await bcrypt.hash("heslo", 10),
        role: "STUDENT",
        cohort: "2024/2025"
      }
    });
    students.push(s);
  }

  // 4. Vytvoříme předměty
  console.log(" - Předměty");
  const sub1 = await prisma.subject.create({
    data: {
      name: "Základy programování v Pythonu",
      code: "INF/PRI",
      description: "Úvod do automatizace a skriptování v populárním jazyce.",
      syllabus: "<h2>Osnova</h2><ul><li>Proměnné a datové typy</li><li>Cykly a podmínky</li><li>Funkce a moduly</li></ul>",
      createdById: admin.id
    }
  });

  const sub2 = await prisma.subject.create({
    data: {
      name: "Konverzační angličtina",
      code: "AJ/KON",
      description: "Příprava na zkoušky B2/C1 formou praktických dialogů.",
      syllabus: "<h2>Témata</h2><ul><li>Cestování a kultura</li><li>Pracovní pohovory</li><li>Moderní technologie</li></ul>",
      createdById: admin.id
    }
  });

  const sub3 = await prisma.subject.create({
    data: {
      name: "Matematický seminář",
      code: "MAT/SEM",
      description: "Rozšiřující učivo analytické geometrie a funkcí.",
      syllabus: "<h2>Probíraná látka</h2><p>Vektory, kuželosečky, goniometrie.</p>",
      createdById: admin.id
    }
  });

  const sub4 = await prisma.subject.create({
    data: {
      name: "Psychologie pro každý den",
      code: "HV/PSY",
      description: "Základy mezilidské komunikace a psychohygieny.",
      syllabus: "<p>Porozumění emocím, asertivita a prevence stresu.</p>",
      createdById: admin.id
    }
  });

  // 5. Vytvoříme Zápisové Okno
  console.log(" - Zápisová okna");
  const window1 = await prisma.enrollmentWindow.create({
    data: {
      name: "Zápis do seminářů 2024/2025 (Zimní semestr)",
      description: "Aktivní okno pro zápis. Můžete si vybrat max 2 semináře.",
      status: "OPEN",
      startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // Přesně před 2 dny
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),   // Za týden
      visibleToStudents: true,
      createdById: admin.id
    }
  });

  const window2 = await prisma.enrollmentWindow.create({
    data: {
      name: "Zápis do povinně volitelných předmětů (Letní semestr)",
      description: "Zatím pouze naplánováno, okno pro letní volby.",
      status: "SCHEDULED",
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 40),
      visibleToStudents: true,
      createdById: admin.id
    }
  });

  // 6. Bloky
  console.log(" - Bloky");
  const block1 = await prisma.block.create({ data: { name: "Blok A - Odborné předměty", order: 1, enrollmentWindowId: window1.id, createdById: admin.id } });
  const block2 = await prisma.block.create({ data: { name: "Blok B - Společenskovědní", order: 2, enrollmentWindowId: window1.id, createdById: admin.id } });
  
  const block3 = await prisma.block.create({ data: { name: "Hlavní nabídka - LS", order: 1, enrollmentWindowId: window2.id, createdById: admin.id } });

  // 7. Výskyty předmětů v blocích
  console.log(" - Výskyty předmětů");
  const occ1 = await prisma.subjectOccurrence.create({
    data: { subjectId: sub1.id, blockId: block1.id, teacherId: t1.id, capacity: 15, subCode: "Pondělí", createdById: admin.id }
  });
  const occ2 = await prisma.subjectOccurrence.create({
    data: { subjectId: sub1.id, blockId: block1.id, teacherId: t3.id, capacity: 15, subCode: "Pátek", createdById: admin.id }
  });
  
  const occ3 = await prisma.subjectOccurrence.create({
    data: { subjectId: sub3.id, blockId: block1.id, teacherId: t1.id, capacity: null, subCode: "Společný", createdById: admin.id }
  });

  const occ4 = await prisma.subjectOccurrence.create({
    data: { subjectId: sub2.id, blockId: block2.id, teacherId: t2.id, capacity: 20, subCode: "Skupina 1", createdById: admin.id }
  });
  const occ5 = await prisma.subjectOccurrence.create({
    data: { subjectId: sub4.id, blockId: block2.id, teacherId: t2.id, capacity: 12, subCode: "Malá sk.", createdById: admin.id }
  });

  // Skedyulovany výskyt do letniho okna
  await prisma.subjectOccurrence.create({
    data: { subjectId: sub1.id, blockId: block3.id, teacherId: t3.id, capacity: 25, subCode: "Opakovací", createdById: admin.id }
  });

  // 8. Testovací zápisy studentů (Rozházíme jim předměty)
  console.log(" - Zápisy studentů");
  for (const s of students) {
    // Každý student si zvolí nějaký předmět z bloku 1 a něco z bloku 2
    const occsToEnrollTo = [];
    if (Math.random() > 0.3) occsToEnrollTo.push(occ1); else occsToEnrollTo.push(occ3);
    if (Math.random() > 0.5) occsToEnrollTo.push(occ4); else occsToEnrollTo.push(occ5);
    
    for (const o of occsToEnrollTo) {
      await prisma.studentEnrollment.create({
        data: {
          studentId: s.id,
          subjectOccurrenceId: o.id,
          createdById: s.id
        }
      });
    }
  }

  // 9. Nastavit systémový ročník (global cohort)
  await prisma.systemSetting.upsert({
    where: { key: "current_cohort" },
    update: { value: "2024/2025" },
    create: { key: "current_cohort", value: "2024/2025" }
  });

  console.log("Seeding kompletní!");
  console.log("Vytvořeno celkem 3 učitelé, 30 studentů, 4 předměty, 2 zápisová okna, 3 bloky, 6 výskytů.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
