"use server";

import { safeAction } from "@/lib/safe-action";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function changeOwnPassword(currentPasswordRaw: string, newPasswordRaw: string) {
  return safeAction(async () => {
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
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: hashedPassword },
      });
      await audit(tx, userFromSession, {
        action: "users.password.change",
        entityType: "user",
        entityId: user.id,
        summary: `Uživatel ${user.firstName} ${user.lastName} si změnil heslo`,
      });
      return updated;
    });
  });
}

/** Nastavení profilu přihlášeného uživatele. */
export async function getMyPreferences(): Promise<{ receiveOptionalEmails: boolean }> {
  const user = await requireAuth();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { receiveOptionalEmails: true } });
  return { receiveOptionalEmails: me?.receiveOptionalEmails ?? true };
}

/** „Dostávat nepovinná upozornění“ (připomínky, souhrny). Povinná chodí vždy. */
export async function setReceiveOptionalEmails(value: boolean) {
  return safeAction(async () => {
    const user = await requireAuth();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { receiveOptionalEmails: !!value } });
      await audit(tx, user, {
        action: "users.preferences",
        entityType: "user",
        entityId: user.id,
        summary: `Uživatel ${user.firstName} ${user.lastName} ${value ? "zapnul" : "vypnul"} nepovinná e-mailová upozornění`,
        data: { receiveOptionalEmails: !!value },
      });
    });
  });
}
