"use server";

import { safeAction } from "@/lib/safe-action";
import { requirePermission } from "@/lib/session";
import { getEmailStatus, isValidEmail, sendEmail, type EmailStatus } from "@/lib/email";

export async function getEmailSettings(): Promise<EmailStatus> {
  await requirePermission("core.admin");
  return getEmailStatus();
}

/** Zkušební e-mail z administrace (adresát, předmět, text). */
export async function sendTestEmail(data: { to: string; subject: string; text: string }) {
  return safeAction(async () => {
    await requirePermission("core.admin");
    const to = data.to.trim();
    const subject = data.subject.trim();
    const text = data.text.trim();
    if (!isValidEmail(to)) throw new Error("Zadejte platnou e-mailovou adresu adresáta.");
    if (!subject) throw new Error("Vyplňte předmět.");
    if (subject.length > 200) throw new Error("Předmět je příliš dlouhý (max. 200 znaků).");
    if (!text) throw new Error("Vyplňte text e-mailu.");
    if (text.length > 10_000) throw new Error("Text je příliš dlouhý (max. 10 000 znaků).");
    return await sendEmail({ to, subject, text });
  });
}
