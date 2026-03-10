import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log("Starting query...");
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        studentEnrollments: {
          where: { deletedAt: null },
          include: {
            subjectOccurrence: {
              include: {
                subject: true,
                block: {
                  include: {
                    enrollmentWindow: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    console.log(`Success! Found ${users.length} users.`);
    console.log("Checking for serialization errors...");
    const str = JSON.stringify(users);
    console.log(`Serialization ok. Output length: ${str.length}`);
  } catch (err: any) {
    console.error("Prisma error:", err.message);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
