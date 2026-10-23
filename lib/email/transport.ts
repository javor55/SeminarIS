// Odesílání e-mailů přes Resend (REST API). Jen pro server – NENÍ "use server" soubor,
// aby se odesílání nedalo zavolat z klienta jako server action.
//
// Konfigurace (proměnné prostředí):
//   RESEND_API_KEY   klíč z Resendu (tajný, patří jen do env)
//   EMAIL_FROM       odesílatel z ověřené domény, např. "Školní IS <noreply@skola.cz>"
//   EMAIL_REPLY_TO   volitelně adresa pro odpovědi
//   EMAIL_TRANSPORT  "log" = nic neposílat, jen vypsat do logu (testy, vývoj)

const RESEND_URL = "https://api.resend.com/emails";

export type EmailStatus = {
  configured: boolean;
  transport: "resend" | "log";
  from: string | null;
  replyTo: string | null;
  // Co chybí (pro hlášku v administraci)
  missing: string[];
};

export function getEmailStatus(): EmailStatus {
  const transport = process.env.EMAIL_TRANSPORT === "log" ? "log" : "resend";
  const from = process.env.EMAIL_FROM?.trim() || null;
  const missing: string[] = [];
  if (transport === "resend" && !process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!from) missing.push("EMAIL_FROM");
  return {
    configured: missing.length === 0,
    transport,
    from,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
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

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
};

/** Odešle e-mail. Vrací id zprávy u Resendu; při chybě vyhodí Error se srozumitelnou hláškou. */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const status = getEmailStatus();
  if (!status.configured) {
    throw new Error(`E-maily nejsou nastavené, chybí proměnné prostředí: ${status.missing.join(", ")}.`);
  }
  const to = Array.isArray(input.to) ? input.to : [input.to];

  if (status.transport === "log") {
    // eslint-disable-next-line no-console
    console.log(`[email:log] komu=${to.join(", ")} předmět=${JSON.stringify(input.subject)}`);
    return { id: "log" };
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: status.from,
      to,
      subject: input.subject,
      text: input.text,
      html: textToHtml(input.text),
      ...(status.replyTo ? { reply_to: status.replyTo } : {}),
    }),
  });

  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !body?.id) {
    // eslint-disable-next-line no-console
    console.error("Resend:", res.status, body);
    throw new Error(`Resend e-mail odmítl (${res.status}): ${body?.message ?? "neznámá chyba"}`);
  }
  return { id: body.id };
}
