import { loadEventTextDefaults } from "@/modules/events/text-defaults";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Mail, TriangleAlert } from "lucide-react";
import { appUrl } from "@/lib/email";
import { isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { ConfirmationActions } from "@/modules/events/components/ConfirmationActions";
import { itemFullLabel } from "@/modules/events/format";
import { TOKEN_RE, hashToken } from "@/modules/events/registration-core";

// Potvrzení po registraci. Token je jen v adrese (`?t=`): stránka ho nikam neukládá ani nelogují, odpověď se nikdy nekešuje
// a prohlížeč neposílá adresu dál (viz hlavičky v next.config.mjs a `referrer` níže).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registrace potvrzena",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

export default async function RegistrationDonePage({ params, searchParams }: Params) {
  const [{ slug }, { t }] = await Promise.all([params, searchParams]);
  if (!(await isModuleEnabled("events"))) notFound();
  if (typeof t !== "string" || !TOKEN_RE.test(t)) notFound();

  const reg = await prisma.eventRegistration.findUnique({
    where: { tokenHash: hashToken(t) },
    include: {
      event: { select: { slug: true, title: true, place: true, contact: true, confirmChannel: true, confirmationText: true, fields: { select: { key: true, label: true } } } },
      items: { include: { item: true } },
    },
  });
  if (!reg || reg.event.slug !== slug) notFound();
  const event = reg.event;
  const confirmationText = event.confirmationText?.trim() || (await loadEventTextDefaults()).confirmationText;

  const link = appUrl(`/akce/${event.slug}/r/${t}`);
  const items = reg.items.map((r) => r.item).sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0) || a.order - b.order);
  const cancelled = reg.status === "CANCELLED";

  // Co účastník na obrazovce potřebuje: odkaz a kód, pokud nejdou e-mailem (nebo e-mail neodešel; důvod se mu neukazuje)
  const emailOnly = event.confirmChannel === "EMAIL_ONLY";
  const screenOnly = event.confirmChannel === "SCREEN_ONLY";
  const emailWentOut = !screenOnly && !reg.confirmEmailFailed;
  const showCredentials = !cancelled && (!emailOnly || reg.confirmEmailFailed);

  const answers = (reg.answers ?? {}) as Record<string, string | boolean>;
  const labels = new Map(event.fields.map((f) => [f.key, f.label]));
  const details: [string, string][] = [
    ["E-mail", reg.email],
    ...(reg.name ? ([["Jméno", reg.name]] as [string, string][]) : []),
    ...(reg.guests > 0 ? ([["Počet osob", String(1 + reg.guests)]] as [string, string][]) : []),
    ...Object.entries(answers).map(([k, v]) => [labels.get(k) ?? k, v === true ? "Ano" : String(v)] as [string, string]),
  ];

  const fileText = [
    `Potvrzení registrace: ${event.title}`,
    "",
    "Termíny:",
    ...items.map((i) => `- ${itemFullLabel(i)}`),
    ...(event.place ? ["", `Místo: ${event.place}`] : []),
    "",
    `Odkaz na správu registrace: ${link}`,
    `Kód registrace: ${reg.code}`,
    "",
    "Odkaz a kód si uschovejte. Kdo je má, může registraci zobrazit, změnit nebo zrušit.",
  ].join("\r\n");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-10 pt-4 md:pt-8" data-testid="registration-done" data-channel={event.confirmChannel}>
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          {cancelled ? (
            <TriangleAlert className="mt-1 h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-tight" data-testid="done-title">
              {cancelled ? "Registrace byla zrušena" : "Registrace je potvrzená"}
            </h1>
            <p className="break-words text-muted-foreground">{event.title}</p>
          </div>
        </div>
      </header>

      {!cancelled && confirmationText && (
        <p className="whitespace-pre-line break-words rounded-xl border bg-card p-4 text-sm" data-testid="confirmation-text">
          {confirmationText}
        </p>
      )}

      {!cancelled && screenOnly && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4" role="alert" data-testid="save-warning">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="font-semibold">Uložte si odkaz nebo kód – e-mailem nepřijde.</p>
        </div>
      )}
      {!cancelled && !screenOnly && !emailWentOut && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4" role="alert" data-testid="save-warning">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="font-semibold">Uložte si odkaz nebo kód, budete je potřebovat ke správě registrace.</p>
        </div>
      )}
      {!cancelled && emailWentOut && (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm" data-testid="email-sent">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            Potvrzení jsme poslali na <span className="break-all font-medium">{reg.email}</span>
            {emailOnly ? ". Najdete v něm odkaz na správu registrace a kód." : ". Najdete v něm stejný odkaz a kód jako níže."}
          </p>
        </div>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="done-terminy">
        <h2 id="done-terminy" className="text-lg font-semibold">{items.length === 1 ? "Váš termín" : "Vaše termíny"}</h2>
        <ul className="space-y-1" data-testid="done-items">
          {items.map((i) => (
            <li key={i.id} className="break-words font-medium" data-testid="done-item">{itemFullLabel(i)}</li>
          ))}
        </ul>
        {event.place && <p className="text-sm text-muted-foreground">Místo: <span className="text-foreground">{event.place}</span></p>}
        {event.contact && <p className="text-sm text-muted-foreground">Kontakt: <span className="text-foreground">{event.contact}</span></p>}
      </section>

      {showCredentials && (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="done-sprava">
          <h2 id="done-sprava" className="text-lg font-semibold">Správa registrace</h2>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Kód registrace</div>
            <div className="font-mono text-3xl font-bold tracking-widest" data-testid="reg-code">{reg.code}</div>
            <p className="text-xs text-muted-foreground">Když ztratíte odkaz, na stránce události zadejte tento kód a svůj e-mail.</p>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Odkaz na správu (změna termínu, zrušení)</div>
            <a href={link} className="block break-all text-sm text-primary underline" data-testid="manage-link">{link}</a>
          </div>
          <ConfirmationActions link={link} code={reg.code} icsHref={items.some((i) => i.startsAt) ? `/akce/${event.slug}/r/${t}/kalendar.ics` : null} fileText={fileText} fileName={`registrace-${reg.code}.txt`} />
        </section>
      )}

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="done-udaje">
        <h2 id="done-udaje" className="text-lg font-semibold">Vaše údaje</h2>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="done-details">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 whitespace-pre-line break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm">
        <Link href={`/akce/${event.slug}`} className="text-primary underline underline-offset-4" data-testid="back-to-event">Zpět na stránku události</Link>
      </p>
    </main>
  );
}
