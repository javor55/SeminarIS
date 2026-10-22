"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/session";

export async function changeOwnPassword(currentPasswordRaw: string, newPasswordRaw: string) {
  const userFromSession = await requireAuth();
  
  // Znovu vytáhneme uživatele z DB, abychom měli hash hesla
  const user = await prisma.user.findUnique({
    where: { id: userFromSession.id },
    omit: { passwordHash: false },
  });
  
  if (!user) throw new Error("Uživatel nenalezen.");

  // Ošetření uživatelů bez nastaveného hesla (např. importovaní bez hesla)
  if (!user.passwordHash) {
    throw new Error("Pro tento účet není nastaveno heslo. Kontaktujte administrátora.");
  }

  // Ověření starého hesla
  const isValid = await bcrypt.compare(currentPasswordRaw, user.passwordHash);
  if (!isValid) throw new Error("Současné heslo je nesprávné.");

  // Hashování a uložení nového hesla
  const hashedPassword = await bcrypt.hash(newPasswordRaw, 10);
  return await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashedPassword },
  });
}
