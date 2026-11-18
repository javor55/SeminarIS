"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { MobileCard, MobileCardField, ResponsiveView, MobileCardList } from "@/components/ui/mobile-card";
import { formatDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import type { EventListItem } from "@/modules/events/data";
import { EVENT_STATUS_FILTERS, EVENT_STATUS_LABEL, type EventStatusValue } from "@/modules/events/status";
import { CopyLinkButton } from "@/modules/events/components/CopyLinkButton";
import { EventStatusBadge } from "@/modules/events/components/EventStatusBadge";

function registrationPeriod(e: EventListItem): string {
  if (e.registrationOpensAt && e.registrationClosesAt) return `${formatDateTime(e.registrationOpensAt)} – ${formatDateTime(e.registrationClosesAt)}`;
  if (e.registrationOpensAt) return `od ${formatDateTime(e.registrationOpensAt)}`;
  if (e.registrationClosesAt) return `do ${formatDateTime(e.registrationClosesAt)}`;
  return "bez omezení";
}

const registrationsText = (n: number) => `${n} ${plural(n, "registrace", "registrace", "registrací")}`;

/** Seznam událostí jako karty (na mobilu `MobileCard`) s filtrem podle stavu. */
export function EventsList({ events, showAuthor }: { events: EventListItem[]; showAuthor: boolean }) {
  const [filter, setFilter] = useState<EventStatusValue | "ALL">("ALL");
  const visible = filter === "ALL" ? events : events.filter((e) => e.status === filter);
  const count = (s: EventStatusValue) => events.filter((e) => e.status === s).length;

  const actions = (e: EventListItem) => (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={`/events/${e.id}`} data-testid="edit-event">Upravit</Link>
      </Button>
      <CopyLinkButton slug={e.slug} />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" data-testid="event-filters">
        <Chip pressed={filter === "ALL"} data-filter="ALL" onClick={() => setFilter("ALL")}>
          Vše ({events.length})
        </Chip>
        {EVENT_STATUS_FILTERS.map((s) => (
          <Chip key={s} pressed={filter === s} data-filter={s} onClick={() => setFilter(s)}>
            {EVENT_STATUS_LABEL[s]} ({count(s)})
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="events-empty">
          {events.length === 0 ? "Zatím žádné události" : "V tomto stavu nejsou žádné události"}
        </div>
      ) : (
        <ResponsiveView
          desktop={
            <div className="space-y-3">
              {visible.map((e) => (
                <Card key={e.id} className="flex items-center justify-between gap-4 p-4" data-testid="event-card" data-event={e.id} data-slug={e.slug}>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/events/${e.id}`} className="font-medium hover:underline" data-testid="event-title">{e.title}</Link>
                      <EventStatusBadge status={e.status} />
                    </div>
                    {e.subtitle && <p className="text-sm text-muted-foreground">{e.subtitle}</p>}
                    <p className="text-sm text-muted-foreground">
                      Registrace: {registrationPeriod(e)} · <span data-testid="event-registrations">{registrationsText(e.registrations)}</span>
                      {showAuthor && <> · Autor: {e.authorName}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">{actions(e)}</div>
                </Card>
              ))}
            </div>
          }
          mobile={
            <MobileCardList>
              {visible.map((e) => (
                <MobileCard key={e.id} title={<Link href={`/events/${e.id}`} data-testid="event-title">{e.title}</Link>} badge={<EventStatusBadge status={e.status} />} actions={actions(e)} data-testid="event-card" data-event={e.id} data-slug={e.slug}>
                  {e.subtitle && <p className="text-sm text-muted-foreground">{e.subtitle}</p>}
                  <MobileCardField label="Registrace">{registrationPeriod(e)}</MobileCardField>
                  <MobileCardField label="Počet"><span data-testid="event-registrations">{registrationsText(e.registrations)}</span></MobileCardField>
                  {showAuthor && <MobileCardField label="Autor">{e.authorName}</MobileCardField>}
                </MobileCard>
              ))}
            </MobileCardList>
          }
        />
      )}
    </div>
  );
}
