// Nízká úroveň odesílání e-mailů přes Resend (REST API, bez SDK). Jen pro server – NENÍ
// "use server" soubor, aby se odesílání nedalo zavolat z klienta jako server action.
// Kontrolu zapnutí, limitů a odhlášení a zápis do EmailLog dělá `sendEventEmail` (send.ts);
// tuto vrstvu nevolejte přímo.
//
// Konfigurace (proměnné prostředí):
//   RESEND_API_KEY   klíč z Resendu (tajný, patří jen do env, nikdy do databáze)
//   EMAIL_FROM       výchozí odesílatel z ověřené domény, např. "Školní IS <noreply@skola.cz>"
//   EMAIL_REPLY_TO   volitelně adresa pro odpovědi
//   EMAIL_TRANSPORT  "log" = nic neposílat, jen vypsat do logu (testy, vývoj)
// Odesílatele a reply-to může přepsat administrace (prázdné pole = hodnota z env).

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

/** Nejvíc e-mailů v jednom volání batch API Resendu. */
export const BATCH_SIZE = 100;

export type EmailTransportName = "resend" | "log";

export type EmailStatus = {
  configured: boolean;
  transport: EmailTransportName;
  // Skutečný odesílatel (administrace > env) a odkud pochází
  from: string | null;
  fromSource: "admin" | "env" | null;
  replyTo: string | null;
  // Co chybí (pro hlášku v administraci)
  missing: string[];
};

export function getTransportName(): EmailTransportName {
  return process.env.EMAIL_TRANSPORT === "log" ? "log" : "resend";
}

/** Stav konfigurace; `override` jsou hodnoty z administrace (prázdné = použije se env). */
export function getEmailStatus(override?: { from?: string | null; replyTo?: string | null }): EmailStatus {
  const transport = getTransportName();
  const adminFrom = override?.from?.trim() || null;
  const envFrom = process.env.EMAIL_FROM?.trim() || null;
  const from = adminFrom ?? envFrom;
  const replyTo = override?.replyTo?.trim() || process.env.EMAIL_REPLY_TO?.trim() || null;
  const missing: string[] = [];
  if (transport === "resend" && !process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!from) missing.push("EMAIL_FROM");
  return {
    configured: missing.length === 0,
    transport,
    from,
    fromSource: adminFrom ? "admin" : envFrom ? "env" : null,
    replyTo,
    missing,
  };
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Prostý text → jednoduché HTML (odstavce a zalomení řádků). */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
};

/** Výsledek odeslání jedné zprávy: id u Resendu (u „log“ transportu "log"). */
export type TransportResult = { id: string };

function resendPayload(status: EmailStatus, email: OutgoingEmail) {
  return {
    from: status.from,
    to: [email.to],
    subject: email.subject,
    text: email.text,
    html: textToHtml(email.text),
    ...(status.replyTo ? { reply_to: status.replyTo } : {}),
  };
}

async function readBody(res: Response) {
  return (await res.json().catch(() => null)) as { id?: string; data?: { id?: string }[]; message?: string } | null;
}

/**
 * Odešle až BATCH_SIZE e-mailů najednou (jedna zpráva = obyčejné volání, víc = batch API).
 * Vrací id zpráv ve stejném pořadí. Při chybě vyhodí Error se srozumitelnou hláškou –
 * batch API Resendu je „vše nebo nic“, takže selže celá dávka.
 */
export async function transportSend(status: EmailStatus, emails: OutgoingEmail[]): Promise<TransportResult[]> {
  if (!status.configured) {
    throw new Error(`E-maily nejsou nastavené, chybí: ${status.missing.join(", ")}.`);
  }
  if (emails.length === 0) return [];
  if (emails.length > BATCH_SIZE) throw new Error(`Najednou lze odeslat nejvýš ${BATCH_SIZE} e-mailů.`);

  if (status.transport === "log") {
    for (const e of emails) {
      // eslint-disable-next-line no-console
      console.log(`[email:log] komu=${e.to} předmět=${JSON.stringify(e.subject)}`);
    }
    return emails.map(() => ({ id: "log" }));
  }

  const headers = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };

  if (emails.length === 1) {
    const res = await fetch(RESEND_URL, { method: "POST", headers, body: JSON.stringify(resendPayload(status, emails[0])) });
    const body = await readBody(res);
    if (!res.ok || !body?.id) {
      // eslint-disable-next-line no-console
      console.error("Resend:", res.status, body);
      throw new Error(`Resend e-mail odmítl (${res.status}): ${body?.message ?? "neznámá chyba"}`);
    }
    return [{ id: body.id }];
  }

  const res = await fetch(RESEND_BATCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(emails.map((e) => resendPayload(status, e))),
  });
  const body = await readBody(res);
  if (!res.ok || !Array.isArray(body?.data)) {
    // eslint-disable-next-line no-console
    console.error("Resend batch:", res.status, body);
    throw new Error(`Resend dávku odmítl (${res.status}): ${body?.message ?? "neznámá chyba"}`);
  }
  return emails.map((_, i) => ({ id: body.data?.[i]?.id ?? "" }));
}
