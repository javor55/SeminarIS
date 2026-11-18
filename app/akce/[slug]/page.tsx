import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Lock, Mail, MapPin, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeRichHtml } from "@/lib/html";
import { formatDateTime } from "@/lib/datetime";
import { isModuleEnabled } from "@/lib/modules";
import { formatName } from "@/lib/names";
import { getCurrentUser } from "@/lib/session";
import { canManageEvent } from "@/modules/events/access";
import { canUserRegister } from "@/modules/events/audience-roles";
import { loadPublicEvent, loadStudentAudienceInfo } from "@/modules/events/public-data";
import { registrationPhase } from "@/modules/events/public-state";
import { PublicRegistration } from "@/modules/events/components/PublicRegistration";

// Veřejná stránka události (bez přihlášení; u viditelnosti „jen pro přihlášené“ se přihlášení vyžaduje až pro registraci).
// Stav registrace se počítá z aktuálního času, proto se stránka nikdy neukládá do cache.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ nahled?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const event = (await isModuleEnabled("events")) ? await loadPublicEvent(slug) : null;
  // Koncept se nikde neprozrazuje, ani v náhledu odkazu
  if (!event || event.status === "DRAFT") return { title: "Událost" };
  const image = event.imageId ? [{ url: `/api/events/images/${event.imageId}`, alt: event.imageAlt ?? event.title }] : undefined;
  return {
    title: event.title,
    description: event.subtitle ?? undefined,
    openGraph: { title: event.title, description: event.subtitle ?? undefined, type: "website", images: image },
    twitter: { card: image ? "summary_large_image" : "summary", title: event.title, description: event.subtitle ?? undefined },
  };
}

export default async function PublicEventPage({ params, searchParams }: Params) {
  const [{ slug }, { nahled }] = await Promise.all([params, searchParams]);
  if (!(await isModuleEnabled("events"))) notFound();
  const event = await loadPublicEvent(slug);
  if (!event) notFound();

  const user = await getCurrentUser();
  const isManager = !!user && canManageEvent(user, { createdById: event.createdById, organizers: event.organizers });
  const preview = event.status === "DRAFT" && isManager && nahled === "1";
  // Koncept vidí jen organizátor s náhledem; ostatním se tváří, že neexistuje
  if (event.status === "DRAFT" && !preview) notFound();

  // V náhledu konceptu se registrace ukazuje otevřená, i když by podle stavu a termínů ještě nebyla
  const phase = preview ? "OPEN" : registrationPhase(event);
  const inAudience = event.visibility === "USERS" && user ? preview || canUserRegister(event, user, await loadStudentAudienceInfo(user)) : false;
  const description = event.descriptionHtml.trim() ? sanitizeRichHtml(event.descriptionHtml) : "";

  return (
    <article className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-10 pt-4 md:pt-8" data-testid="public-event" data-phase={phase}>
      {preview && (
        <div className="flex items-center gap-2 rounded-lg border border-banner-border bg-banner px-3 py-2 text-sm font-medium text-banner-foreground" data-testid="preview-bar">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Náhled – událost není zveřejněná
        </div>
      )}

      {event.imageId && (
        <div className="aspect-video overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/events/images/${event.imageId}`} alt={event.imageAlt ?? ""} className="h-full w-full object-cover" data-testid="event-image" />
        </div>
      )}

      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl" data-testid="event-title">{event.title}</h1>
          {event.subtitle && <p className="text-base text-muted-foreground md:text-lg" data-testid="event-subtitle">{event.subtitle}</p>}
        </div>
        {(event.place || event.contact) && (
          <ul className="space-y-1.5 text-sm">
            {event.place && (
              <li className="flex items-start gap-2" data-testid="event-place">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">{event.place}</span>
              </li>
            )}
            {event.contact && (
              <li className="flex items-start gap-2" data-testid="event-contact">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">{event.contact}</span>
              </li>
            )}
          </ul>
        )}
        {phase === "OPEN" && (
          <Button asChild className="h-11 w-full md:h-9 md:w-auto" data-testid="jump-to-registration">
            <a href="#registrace">Přejít na registraci</a>
          </Button>
        )}
      </header>

      {description && (
        <div
          className="max-w-none text-base leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
          data-testid="event-description"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      )}

      <section id="registrace" className="scroll-mt-4 rounded-xl border bg-card p-4 shadow-sm md:p-6" data-testid="registration-block" aria-label="Registrace">
        {phase === "NOT_OPEN" && (
          <Notice icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />} testId="notice-not-open" title={`Registrace se otevře ${formatDateTime(event.registrationOpensAt!)}`} text="Vraťte se na tuto stránku, až bude registrace otevřená." />
        )}
        {phase === "ENDED" && <Notice icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />} testId="notice-ended" title="Registrace skončila" text="Na tuto událost se už nedá registrovat." />}
        {phase === "OPEN" && event.visibility === "USERS" && !user && (
          <Notice
            icon={<Lock className="h-5 w-5" aria-hidden="true" />}
            testId="notice-login"
            title="Registrace je jen pro přihlášené"
            text="Přihlaste se svým účtem ve školním systému a vraťte se zpět na tuto stránku."
            action={
              <Button asChild className="h-11 w-full md:h-9 md:w-auto">
                <Link href={`/login?next=${encodeURIComponent(`/akce/${event.slug}`)}`} data-testid="login-button">Přihlásit</Link>
              </Button>
            }
          />
        )}
        {phase === "OPEN" && event.visibility === "USERS" && user && !inAudience && (
          <Notice icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />} testId="notice-denied" title="Tato událost pro vás není určena" text="Registrace je vyhrazena jiné skupině uživatelů." />
        )}
        {phase === "OPEN" && (event.visibility === "PUBLIC" || (user && inAudience)) && (
          <div className="space-y-4">
            {event.registrationClosesAt && !preview && (
              <p className="text-sm text-muted-foreground" data-testid="closes-at">Registrace je otevřená do {formatDateTime(event.registrationClosesAt)}.</p>
            )}
            <PublicRegistration
              items={event.items}
              maxItems={event.maxItemsPerRegistration}
              allowGuests={event.allowGuests}
              maxGuests={event.maxGuests}
              fields={event.fields}
              consentText={event.consentText}
              prefill={{ email: user?.email ?? "", name: user ? formatName(user) : "" }}
            />
          </div>
        )}
      </section>
    </article>
  );
}

function Notice({ icon, title, text, action, testId }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode; testId: string }) {
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-snug">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
