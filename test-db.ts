import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const users = await prisma.user.findMany()
    console.log('Successfully connected to the database!')
    console.log(`Found ${users.length} users.`)
    console.log(users)
  } catch (error) {
    console.error('Error connecting to database:', error)
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
