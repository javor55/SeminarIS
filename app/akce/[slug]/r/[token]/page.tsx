import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Hourglass, Info, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { appUrl } from "@/lib/email";
import { isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { canManageEvent } from "@/modules/events/access";
import { MarkArrival } from "@/modules/events/components/MarkArrival";
import { ConfirmationActions } from "@/modules/events/components/ConfirmationActions";
import { ManageRegistration, type ManageItem } from "@/modules/events/components/ManageRegistration";
import { effectiveFields } from "@/modules/events/form";
import { itemFullLabel } from "@/modules/events/format";
import { changeWindow } from "@/modules/events/manage-core";
import { loadTakenByItem, mergeFields } from "@/modules/events/public-data";
import { placesOf } from "@/modules/events/public-state";
import { TOKEN_RE, hashToken } from "@/modules/events/registration-core";

// Správa registrace účastníkem. Token je v adrese: stránka ho nikam nezapisuje ani nelogují, odpověď se nikdy nekešuje (hlavičky
// v next.config.mjs), vyhledávače ji nesmí indexovat a prohlížeč neposílá adresu dál (`referrer` níže).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Správa registrace",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

type Params = { params: Promise<{ slug: string; token: string }> };

export default async function ManageRegistrationPage({ params }: Params) {
  const { slug, token } = await params;
  if (!(await isModuleEnabled("events"))) notFound();
  if (typeof token !== "string" || !TOKEN_RE.test(token)) notFound();

  const reg = await prisma.eventRegistration.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { event: { include: { items: { orderBy: [{ order: "asc" }, { startsAt: "asc" }] }, fields: true, organizers: { select: { userId: true } } } }, items: true },
  });
  if (!reg || reg.event.slug !== slug || reg.event.status === "DRAFT") notFound();
  const event = reg.event;
  const cancelled = reg.status === "CANCELLED";
  const waiting = reg.status === "WAITLIST";
  // Organizátor (přihlášený, smí událost spravovat), který načetl QR kód z potvrzení, může označit příchod
  const viewer = await getCurrentUser();
  const canMark = !!viewer && !cancelled && event.status !== "ARCHIVED" && canManageEvent(viewer, event);

  const ownIds = new Set(reg.items.map((i) => i.itemId));
  const mine = event.items.filter((i) => ownIds.has(i.id)).sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0) || a.order - b.order);
  const window = changeWindow(event, mine.map((i) => i.startsAt));
  const link = appUrl(`/akce/${event.slug}/r/${token}`);

  const fields = effectiveFields(mergeFields(event.fields), event.allowGuests).filter((f) => f.mode !== "HIDDEN");
  const answers = (reg.answers ?? {}) as Record<string, string | boolean>;
  const values: Record<string, string | boolean> = { ...(reg.name ? { name: reg.name } : {}), ...(event.allowGuests ? { guests: String(reg.guests) } : {}), ...answers };
  const details: [string, string][] = [
    ["E-mail", reg.email],
    ...(reg.name ? ([["Jméno", reg.name]] as [string, string][]) : []),
    ...(reg.guests > 0 ? ([["Počet osob", String(placesOf(reg.guests))]] as [string, string][]) : []),
    ...fields.filter((f) => f.key in answers && !["name", "guests"].includes(f.key)).map((f) => [f.label, answers[f.key] === true ? "Ano" : String(answers[f.key])] as [string, string]),
  ];

  // Podklady pro změnu termínu: jen když ji účastník smí udělat (jinak se nic nenačítá)
  let items: ManageItem[] = [];
  if (!cancelled && window.open) {
    const taken = await loadTakenByItem(event.id);
    items = event.items
      .filter((i) => !i.cancelledAt || ownIds.has(i.id))
      .map((i) => ({
        id: i.id,
        label: i.label,
        startsAt: i.startsAt?.toISOString() ?? null,
        endsAt: i.endsAt?.toISOString() ?? null,
        note: i.note,
        order: i.order,
        capacity: i.capacity,
        taken: taken.get(i.id) ?? 0,
        own: ownIds.has(i.id),
        locked: !ownIds.has(i.id) && !changeWindow(event, [i.startsAt]).open,
      }));
  }

  const fileText = [
    `Registrace: ${event.title}`,
    "",
    "Termíny:",
    ...mine.map((i) => `- ${itemFullLabel(i)}`),
    ...(event.place ? ["", `Místo: ${event.place}`] : []),
    "",
    `Odkaz na správu registrace: ${link}`,
    `Kód registrace: ${reg.code}`,
  ].join("\r\n");
  const hasTime = !waiting && mine.some((i) => i.startsAt);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-10 pt-4 md:pt-8" data-testid="manage-page" data-state={cancelled ? "cancelled" : window.open ? "open" : "locked"}>
      <header className="flex items-start gap-3">
        {cancelled ? <TriangleAlert className="mt-1 h-6 w-6 shrink-0 text-warning" aria-hidden="true" /> : waiting ? <Hourglass className="mt-1 h-6 w-6 shrink-0 text-info" aria-hidden="true" /> : <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-success" aria-hidden="true" />}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight" data-testid="manage-title">{cancelled ? "Registrace byla zrušena" : waiting ? "Jste na čekací listině" : "Vaše registrace"}</h1>
          <p className="break-words text-muted-foreground">{event.title}</p>
        </div>
      </header>

      {canMark && (
        <MarkArrival slug={event.slug} token={token} code={reg.code} name={reg.name ?? reg.email} guests={placesOf(reg.guests)} status={reg.status} attendedAt={reg.attendedAt?.toISOString() ?? null} />
      )}

      {waiting && (
        <p className="rounded-xl border bg-card p-4 text-sm" data-testid="waitlist-info">
          Termín je zatím plný, proto jste na čekací listině. Místo vám nedržíme; jakmile se nějaké uvolní, registrace se potvrdí automaticky a pošleme vám e-mail. Do té doby můžete registraci upravit nebo zrušit.
        </p>
      )}

      {cancelled && (
        <p className="rounded-xl border bg-card p-4 text-sm" data-testid="cancelled-info">
          Tato registrace je zrušená{reg.cancelledAt ? ` (${formatDateTime(reg.cancelledAt)})` : ""}. Na stránce události se můžete zaregistrovat znovu, pokud bude volno.
        </p>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="manage-terminy">
        <h2 id="manage-terminy" className="text-lg font-semibold">{mine.length === 1 ? "Váš termín" : "Vaše termíny"}</h2>
        <ul className="space-y-1" data-testid="manage-items">
          {mine.map((i) => (
            <li key={i.id} className={`break-words font-medium ${cancelled ? "text-muted-foreground line-through" : ""}`} data-testid="manage-item">
              {itemFullLabel(i)}
              {i.cancelledAt && <span className="ml-2 text-sm font-normal text-danger no-underline">termín byl zrušen</span>}
            </li>
          ))}
        </ul>
        {event.place && <p className="text-sm text-muted-foreground">Místo: <span className="text-foreground">{event.place}</span></p>}
        {event.contact && <p className="text-sm text-muted-foreground">Kontakt: <span className="text-foreground">{event.contact}</span></p>}
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="manage-udaje">
        <h2 id="manage-udaje" className="text-lg font-semibold">Vaše údaje</h2>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="manage-details">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 whitespace-pre-line break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {!cancelled && (
        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="manage-zmeny">
          <h2 id="manage-zmeny" className="text-lg font-semibold">Změny</h2>
          {window.open ? (
            <>
              {window.deadline && <p className="text-sm text-muted-foreground" data-testid="deadline-info">Změnit nebo zrušit registraci jde do {formatDateTime(window.deadline)}.</p>}
              <ManageRegistration
                slug={event.slug}
                token={token}
                items={items}
                maxItems={event.maxItemsPerRegistration}
                places={placesOf(reg.guests)}
                fields={fields.filter((f) => f.key !== "email")}
                values={values}
                email={reg.email}
                allowGuests={event.allowGuests}
                maxGuests={event.maxGuests}
              />
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="locked-info">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>Změny už nejsou možné, kontaktujte {event.contact ? <span className="font-medium">{event.contact}</span> : "organizátora události"}.</span>
            </p>
          )}
        </section>
      )}

      {!cancelled && (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-labelledby="manage-kod">
          <h2 id="manage-kod" className="text-lg font-semibold">Odkaz a kód</h2>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Kód registrace</div>
            <div className="font-mono text-2xl font-bold tracking-widest" data-testid="reg-code">{reg.code}</div>
          </div>
          <p className="text-sm text-muted-foreground">Tento odkaz si uložte. Kdo ho má, může registraci změnit nebo zrušit. Když ho ztratíte, na stránce události zadejte kód a e-mail (vystaví se nový odkaz a starý přestane platit).</p>
          <ConfirmationActions link={link} code={reg.code} icsHref={hasTime ? `/akce/${event.slug}/r/${token}/kalendar.ics` : null} fileText={fileText} fileName={`registrace-${reg.code}.txt`} />
        </section>
      )}

      <p className="text-sm">
        <Link href={`/akce/${event.slug}`} className="text-primary underline underline-offset-4" data-testid="back-to-event">Zpět na stránku události</Link>
      </p>
    </main>
  );
}
