import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EVENT_STATUS_LABEL, type EventStatusValue } from "@/modules/events/status";

const VARIANT: Record<EventStatusValue, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "muted",
  PUBLISHED: "success",
  CLOSED: "warning",
  ARCHIVED: "outline",
};

/** Pilulka stavu události (Koncept / Zveřejněno / Registrace uzavřena / Archiv). */
export function EventStatusBadge({ status }: { status: EventStatusValue }) {
  return (
    <Badge variant={VARIANT[status]} data-testid="event-status" data-status={status}>
      {EVENT_STATUS_LABEL[status]}
    </Badge>
  );
}
