import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TabLinks } from "@/components/tab-links";
import { isImpersonating, requirePagePermission } from "@/lib/session";
import { loadEventTextDefaults } from "@/modules/events/text-defaults";
import { loadEvent, loadEventFields, loadEventItems, listTeachers } from "@/modules/events/data";
import { RegistrationsTab } from "@/modules/events/components/RegistrationsTab";
import { loadRegistrations } from "@/modules/events/registrations-data";
import { DuplicateEventButton } from "@/modules/events/components/DuplicateEventButton";
import { CopyLinkButton } from "@/modules/events/components/CopyLinkButton";
import { EventSettingsForm } from "@/modules/events/components/EventSettingsForm";
import { EventFormTab } from "@/modules/events/components/EventFormTab";
import { EventItemsTab } from "@/modules/events/components/EventItemsTab";
import { EventStatusActions } from "@/modules/events/components/EventStatusActions";
import { EventStatusBadge } from "@/modules/events/components/EventStatusBadge";

const TABS = [
  { id: "settings", label: "Nastavení" },
  { id: "items", label: "Termíny" },
  { id: "form", label: "Formulář" },
  { id: "registrations", label: "Registrace" },
];

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const user = await requirePagePermission("events.manage.own");
  const event = await loadEvent(user, id);
  // Cizí událost se tváří, že neexistuje
  if (!event) notFound();
  const activeTab = TABS.some((t) => t.id === tab) ? tab! : "settings";
  const teachers = (await listTeachers()).filter((t) => t.id !== event.createdById);

  return (
    <div className="space-y-6">
      <PageHeader
        title={event.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={event.status} />
            <span>Odkaz: <span className="font-mono">/akce/{event.slug}</span></span>
            <span>· Autor: {event.authorName}</span>
          </span>
        }
        back={{ href: "/events", label: "Události" }}
        actions={
          <>
            <EventStatusActions eventId={event.id} status={event.status} />
            <CopyLinkButton slug={event.slug} />
            {!(await isImpersonating()) && <DuplicateEventButton eventId={event.id} title={event.title} />}
          </>
        }
      />
      {event.emailFailedCount > 0 && (
        <div className="rounded-lg border border-banner-border bg-banner px-3 py-2 text-sm text-banner-foreground" role="status" data-testid="email-failed-warning">
          U {event.emailFailedCount} {event.emailFailedCount === 1 ? "registrace" : "registrací"} se nepodařilo odeslat potvrzovací e-mail (vyčerpaný limit, vypnuté e-maily nebo chyba odesílání). Účastníci dostali odkaz a kód na obrazovce. Limity a zapnutí e-mailů najdete v Administraci, Upozornění.
        </div>
      )}
      <TabLinks tabs={TABS} activeId={activeTab} baseHref={`/events/${event.id}`} testId="event-tabs" />
      {activeTab === "settings" ? (
        <EventSettingsForm
          key={event.slug}
          values={{ ...event, organizerIds: event.organizerIds }}
          teachers={teachers}
          canDelete={event.status === "DRAFT" && event.registrationCount === 0}
        />
      ) : activeTab === "items" ? (
        <EventItemsTab eventId={event.id} items={await loadEventItems(event.id)} readOnly={event.status === "ARCHIVED"} />
      ) : activeTab === "form" ? (
        <EventFormTab
          eventId={event.id}
          fields={await loadEventFields(event.id)}
          allowGuests={event.allowGuests}
          maxGuests={event.maxGuests}
          consentText={event.consentText || (await loadEventTextDefaults()).consentText}
          readOnly={event.status === "ARCHIVED"}
        />
      ) : (
        <RegistrationsTab data={(await loadRegistrations(user, event.id))!} readOnly={event.status === "ARCHIVED" || (await isImpersonating())} />
      )}
    </div>
  );
}
