import { prisma } from "@/lib/prisma";
import { getEmailEvent, type EmailEventId } from "@/lib/email/events";
import { loadEmailConfig, getEmailUsage } from "@/lib/email/settings";
import { renderTemplate } from "@/lib/email/template";
import { BATCH_SIZE, transportSend, type OutgoingEmail } from "@/lib/email/transport";
import { isImpersonating } from "@/lib/session";

// Jediná cesta, kudy aplikace posílá e-maily. Postupně kontroluje:
//   1. hlavní vypínač a zapnutí události (jinak SKIPPED_DISABLED),
//   2. odhlášení příjemce z nepovinných upozornění (SKIPPED_DISABLED),
//   3. denní a měsíční limit (co se nevejde, je SKIPPED_LIMIT),
// pak odešle (po dávkách max. 100 přes batch API Resendu) a každý pokus zapíše do EmailLog.
//
// Chyba odeslání NIKDY nevyhodí výjimku: zaloguje se a akce, která e-mail vyvolala, proběhne.
// Volejte až po commitu databázové transakce, ne uvnitř ní.

export type EmailRecipient = {
  email: string;
  // Id uživatele (kvůli odhlášení z nepovinných upozornění a záznamu v logu)
  userId?: string | null;
  // Hodnoty proměnných šablony; `jmeno` se doplní, pokud chybí
  vars: Record<string, string>;
};

export type SendSummary = {
  sent: number;
  failed: number;
  skippedLimit: number;
  skippedDisabled: number;
  // První chyba (pro zkušební e-mail v administraci)
  firstError: string | null;
};

const EMPTY: SendSummary = { sent: 0, failed: 0, skippedLimit: 0, skippedDisabled: 0, firstError: null };

type LogRow = {
  recipient: string;
  recipientUserId: string | null;
  event: string;
  subject: string;
  status: "SENT" | "FAILED" | "SKIPPED_LIMIT" | "SKIPPED_DISABLED";
  error: string | null;
  providerId: string | null;
};

async function writeLog(rows: LogRow[]) {
  if (rows.length === 0) return;
  try {
    await prisma.emailLog.createMany({ data: rows });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("EmailLog: zápis se nezdařil", e);
  }
}

export type SendOptions = {
  // Ruční akce admina (např. tlačítko „Poslat připomínku nezapsaným“) se nezastaví na vypnuté události;
  // hlavní vypínač, odhlášení příjemců i limity platí vždy.
  ignoreEventSwitch?: boolean;
};

export async function sendEventEmail(eventId: EmailEventId, recipients: EmailRecipient[], opts: SendOptions = {}): Promise<SendSummary> {
  try {
    return await doSend(eventId, recipients, opts);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Odeslání e-mailů selhalo:", e);
    return { ...EMPTY, failed: recipients.length, firstError: e instanceof Error ? e.message : "Neznámá chyba." };
  }
}

async function doSend(eventId: EmailEventId, input: EmailRecipient[], opts: SendOptions): Promise<SendSummary> {
  const def = getEmailEvent(eventId);
  if (!def) throw new Error(`Neznámá událost ${eventId}.`);

  // Režim „zobrazit jako“ je jen pro čtení – žádné e-maily
  if (await isImpersonating()) return { ...EMPTY };

  // Každou adresu max. jednou za volání
  const seen = new Set<string>();
  const recipients = input.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recipients.length === 0) return { ...EMPTY };

  const cfg = await loadEmailConfig();
  const eventCfg = cfg.events.get(eventId);
  const subjectTpl = eventCfg?.subject ?? def.defaultSubject;
  const bodyTpl = eventCfg?.body ?? def.defaultBody;
  const summary: SendSummary = { ...EMPTY };

  const render = (r: EmailRecipient): OutgoingEmail => {
    const vars = { jmeno: "", ...r.vars };
    return { to: r.email.trim(), subject: renderTemplate(subjectTpl, vars).trim(), text: renderTemplate(bodyTpl, vars) };
  };
  const logRow = (r: EmailRecipient, mail: OutgoingEmail, status: LogRow["status"], error: string | null = null, providerId: string | null = null): LogRow => ({
    recipient: mail.to,
    recipientUserId: r.userId ?? null,
    event: eventId,
    subject: mail.subject.slice(0, 300),
    status,
    error,
    providerId,
  });

  // Zkušební e-mail se posílá i při vypnutých upozorněních (jinak by nešlo ověřit nastavení)
  const isTest = eventId === "test";
  const rows: LogRow[] = [];
  let candidates: { r: EmailRecipient; mail: OutgoingEmail }[] = [];

  if (!isTest && (!cfg.settings.enabled || (!eventCfg?.enabled && !opts.ignoreEventSwitch))) {
    const reason = !cfg.settings.enabled ? "E-mailová upozornění jsou vypnutá." : "Toto upozornění je vypnuté.";
    for (const r of recipients) rows.push(logRow(r, render(r), "SKIPPED_DISABLED", reason));
    summary.skippedDisabled = rows.length;
    await writeLog(rows);
    return summary;
  }

  // Odhlášení z nepovinných upozornění
  let optedOut = new Set<string>();
  if (!def.mandatory) {
    const ids = recipients.map((r) => r.userId).filter((x): x is string => !!x);
    if (ids.length > 0) {
      const users = await prisma.user.findMany({ where: { id: { in: ids }, receiveOptionalEmails: false }, select: { id: true } });
      optedOut = new Set(users.map((u) => u.id));
    }
  }
  for (const r of recipients) {
    const mail = render(r);
    if (r.userId && optedOut.has(r.userId)) {
      rows.push(logRow(r, mail, "SKIPPED_DISABLED", "Příjemce nechce nepovinná upozornění."));
      summary.skippedDisabled++;
    } else {
      candidates.push({ r, mail });
    }
  }

  // Limity: počítají se odeslané e-maily dnes a tento měsíc (podle pásma školy)
  const usage = await getEmailUsage(cfg.settings);
  const dailyLeft = Math.max(0, usage.dailyLimit - usage.today);
  const monthlyLeft = Math.max(0, usage.monthlyLimit - usage.month);
  const room = Math.min(dailyLeft, monthlyLeft);
  if (candidates.length > room) {
    const reason =
      monthlyLeft <= dailyLeft
        ? `Dosažen měsíční limit e-mailů (${usage.monthlyLimit}).`
        : `Dosažen denní limit e-mailů (${usage.dailyLimit}).`;
    for (const { r, mail } of candidates.slice(room)) {
      rows.push(logRow(r, mail, "SKIPPED_LIMIT", reason));
      summary.skippedLimit++;
    }
    candidates = candidates.slice(0, room);
  }
  await writeLog(rows);

  // Odeslání po dávkách (1 zpráva = obyčejné volání, víc = batch API); log po každé dávce
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const chunk = candidates.slice(i, i + BATCH_SIZE);
    try {
      const results = await transportSend(
        cfg.status,
        chunk.map((c) => c.mail)
      );
      await writeLog(chunk.map((c, idx) => logRow(c.r, c.mail, "SENT", null, results[idx]?.id || null)));
      summary.sent += chunk.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Odeslání se nezdařilo.";
      await writeLog(chunk.map((c) => logRow(c.r, c.mail, "FAILED", message)));
      summary.failed += chunk.length;
      summary.firstError ??= message;
    }
  }
  if (summary.skippedLimit > 0) {
    summary.firstError ??= rows.find((x) => x.status === "SKIPPED_LIMIT")?.error ?? null;
  }
  return summary;
}
