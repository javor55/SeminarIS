import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
  return new PrismaClient({
    // Logování SQL jen lokálně a na vyžádání, v produkci jen chyby
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
    // Hash hesla se nikdy nevrací, pokud o něj dotaz výslovně nepožádá
    // (`omit: { passwordHash: false }`) – zabraňuje úniku do klienta.
    omit: { user: { passwordHash: true } },
  });
}

const globalForPrisma = global as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Klient uvnitř interaktivní transakce (`prisma.$transaction(async (tx) => …)`)
export type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
