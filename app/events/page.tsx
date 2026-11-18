import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/session";
import { can } from "@/modules/registry";
import { listEvents } from "@/modules/events/data";
import { EventsList } from "@/modules/events/components/EventsList";

// Seznam událostí: učitel vidí svoje a ty, kde je spoluorganizátor; admin všechny.
export default async function EventsPage() {
  const user = await requirePagePermission("events.view");
  const events = await listEvents(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Události"
        description="Registrace veřejnosti na akce školy."
        actions={
          can(user.role, "events.manage.own") && (
            <Button asChild>
              <Link href="/events/new" data-testid="new-event"><Plus className="mr-1.5 h-4 w-4" /> Nová událost</Link>
            </Button>
          )
        }
      />
      <EventsList events={events} showAuthor={can(user.role, "events.manage.all")} />
    </div>
  );
}
