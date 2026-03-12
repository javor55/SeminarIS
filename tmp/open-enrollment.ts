
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Otevírám naplánovaný zápis pro testování...");
  
  const window = await prisma.enrollmentWindow.findFirst({
    where: { status: "SCHEDULED" }
  });

  if (!window) {
    console.log("Žádný naplánovaný zápis (SCHEDULED) nenalezen.");
    return;
  }

  await prisma.enrollmentWindow.update({
    where: { id: window.id },
    data: { status: "OPEN" }
  });

  console.log(`Zápis '${window.name}' byl otevřen (status: OPEN).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
