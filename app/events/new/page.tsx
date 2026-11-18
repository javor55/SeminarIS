import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/session";
import { listTeachers } from "@/modules/events/data";
import { EventSettingsForm, NEW_EVENT_VALUES } from "@/modules/events/components/EventSettingsForm";

export default async function NewEventPage() {
  const user = await requirePagePermission("events.manage.own");
  // Autor je organizátor sám, mezi spoluorganizátory se nenabízí
  const teachers = (await listTeachers()).filter((t) => t.id !== user.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Nová událost" description="Vyplňte základní nastavení. Termíny a formulář přidáte po založení." back={{ href: "/events", label: "Události" }} />
      <EventSettingsForm values={NEW_EVENT_VALUES} teachers={teachers} />
    </div>
  );
}
