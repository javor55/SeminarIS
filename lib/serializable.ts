import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";

/**
 * Serializable transakce. Při souběhu ji databáze může odmítnout (P2034); pak se zkusí znovu (nejvýš 4×)
 * a nová kontrola už vidí výsledek souběžné změny (např. obsazené poslední místo).
 */
export async function serializable<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      if (attempt < 4 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") continue;
      throw e;
    }
  }
}
