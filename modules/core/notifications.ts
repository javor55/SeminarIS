import { prisma } from "@/lib/prisma";
import { sendEventEmail, appUrl } from "@/lib/email";
import { isEmailEventActive, loadEmailConfig } from "@/lib/email/settings";
import { getAuditRetentionYears } from "@/lib/audit-settings";
import { audit } from "@/lib/audit";
import { ROLE_LABELS, classLabel } from "@/lib/school";
import type { EmailEventId } from "@/lib/email/events";
import type { DailyJobStep } from "@/modules/server-types";

// E-maily a úklid jádra. Odesílání volejte po commitu transakce.

/** Účty schváleny: uživatelům přijde e-mail s rolí a třídou. */
export async function notifyAccountsApproved(userIds: string[]) {
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, include: { classGroup: true } });
  await sendEventEmail(
    "account.approved",
    users.map((u) => ({
      email: u.email,
      userId: u.id,
      vars: {
        jmeno: u.firstName,
        role: ROLE_LABELS[u.role] ?? u.role,
        trida: u.role === "STUDENT" && u.classGroup ? `, třída ${classLabel(u.classGroup)}` : "",
        odkaz: appUrl("/dashboard"),
      },
    }))
  );
}

async function pendingAccounts() {
  return prisma.user.count({ where: { role: "GUEST", isActive: true } });
}

export async function getCoreEmailEstimates(): Promise<Partial<Record<EmailEventId, number>>> {
  const pending = await pendingAccounts();
  const admins = pending > 0 ? await prisma.user.count({ where: { role: "ADMIN", isActive: true } }) : 0;
  return { "account.pending.digest": admins };
}

/** Denní úloha jádra: souhrn čekajících účtů adminům a mazání starých záznamů. */
export async function runCoreDailyJob(now: Date): Promise<DailyJobStep[]> {
  const steps: DailyJobStep[] = [];

  try {
    if (!(await isEmailEventActive("account.pending.digest"))) {
      steps.push({ task: "account.pending.digest", ok: true, detail: "Vypnuto." });
    } else {
      const pending = await pendingAccounts();
      if (pending === 0) {
        steps.push({ task: "account.pending.digest", ok: true, detail: "Nikdo nečeká na schválení." });
      } else {
        const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true, email: true, firstName: true } });
        const res = await sendEventEmail(
          "account.pending.digest",
          admins.map((a) => ({
            email: a.email,
            userId: a.id,
            vars: { jmeno: a.firstName, pocet: String(pending), odkaz: appUrl("/users?tab=approvals") },
          }))
        );
        steps.push({ task: "account.pending.digest", ok: true, detail: `Čeká ${pending}, odesláno ${res.sent}, přeskočeno ${res.skippedLimit + res.skippedDisabled}.` });
      }
    }
  } catch (e) {
    steps.push({ task: "account.pending.digest", ok: false, detail: e instanceof Error ? e.message : "Chyba." });
  }

  try {
    const years = await getAuditRetentionYears();
    const auditBefore = new Date(now);
    auditBefore.setFullYear(auditBefore.getFullYear() - years);
    const cfg = await loadEmailConfig();
    const emailBefore = new Date(now.getTime() - cfg.settings.logRetentionDays * 24 * 3600_000);
    const [audits, emails] = await Promise.all([
      prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditBefore } } }),
      prisma.emailLog.deleteMany({ where: { createdAt: { lt: emailBefore } } }),
    ]);
    if (audits.count > 0 || emails.count > 0) {
      await audit(prisma, null, {
        action: "system.cleanup",
        entityType: "system",
        summary: `Automaticky smazáno ${audits.count} záznamů historie (starší než ${years} r.) a ${emails.count} záznamů o e-mailech`,
        data: { audit: audits.count, email: emails.count },
      });
    }
    steps.push({ task: "cleanup", ok: true, detail: `Smazáno ${audits.count} záznamů historie (starší než ${years} r.) a ${emails.count} záznamů o e-mailech.` });
  } catch (e) {
    steps.push({ task: "cleanup", ok: false, detail: e instanceof Error ? e.message : "Chyba." });
  }
  return steps;
}
