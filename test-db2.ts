import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  console.log(`Total users: ${users.length}`)
  
  const admins = users.filter((u: any) => u.role === 'ADMIN')
  console.log(`Admins count: ${admins.length}`)
  if (admins.length > 0) {
    console.log('Admin emails:', admins.map((u: any) => u.email))
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
