import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TabLinks } from "@/components/tab-links";
import { requirePagePermission } from "@/lib/session";
import { loadEvent, listTeachers } from "@/modules/events/data";
import { CopyLinkButton } from "@/modules/events/components/CopyLinkButton";
import { EventSettingsForm } from "@/modules/events/components/EventSettingsForm";
import { EventStatusActions } from "@/modules/events/components/EventStatusActions";
import { EventStatusBadge } from "@/modules/events/components/EventStatusBadge";

const TABS = [
  { id: "settings", label: "Nastavení" },
  { id: "items", label: "Termíny" },
  { id: "form", label: "Formulář" },
  { id: "registrations", label: "Registrace" },
];

const PLACEHOLDERS: Record<string, string> = {
  items: "Termíny, na které se účastníci registrují, přibudou v další verzi.",
  form: "Nastavení formuláře účastníka přibude v další verzi.",
  registrations: "Seznam registrací přibude v další verzi.",
};

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
          </>
        }
      />
      <TabLinks tabs={TABS} activeId={activeTab} baseHref={`/events/${event.id}`} testId="event-tabs" />
      {activeTab === "settings" ? (
        <EventSettingsForm
          key={event.slug}
          values={{ ...event, organizerIds: event.organizerIds }}
          teachers={teachers}
          canDelete={event.status === "DRAFT" && event.registrationCount === 0}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="tab-placeholder">
          {PLACEHOLDERS[activeTab]}
        </div>
      )}
    </div>
  );
}
