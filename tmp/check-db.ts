import { prisma } from "../lib/prisma";

async function main() {
  const users = await prisma.user.findMany();
  console.log("Total users:", users.length);
  const settings = await prisma.systemSetting.findMany();
  console.log("Settings:", JSON.stringify(settings, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
