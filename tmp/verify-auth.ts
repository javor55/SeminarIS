
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function testLogin(email: string, passwordRaw: string) {
  console.log(`--- Testování přihlášení pro: ${email} ---`);
  
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    console.log("CHYBA: Uživatel nenalezen v databázi.");
    return;
  }

  console.log(`Uživatel nalezen: ${user.firstName} ${user.lastName} (Role: ${user.role}, Aktivní: ${user.isActive})`);

  if (!user.passwordHash) {
    console.log("CHYBA: Uživatel nemá nastavené heslo (hash chybí).");
    return;
  }

  const isValid = await bcrypt.compare(passwordRaw, user.passwordHash);
  
  if (isValid) {
    console.log("OK: Heslo je správné.");
  } else {
    console.log("CHYBA: Heslo NENÍ správné.");
    // Zkusíme, co je v DB za hash (jen prvních pár znaků pro bezpečnost)
    console.log(`Hash v DB začíná na: ${user.passwordHash.substring(0, 10)}...`);
  }

  if (!user.isActive) {
    console.log("CHYBA: Uživatel není aktivní (isActive: false).");
  }
}

async function main() {
  await testLogin("student@test.cz", "123");
  await testLogin("ucitel@test.cz", "123");
  await testLogin("admin@test.cz", "123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
