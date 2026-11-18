import { SCHOOL_TIME_ZONE, formatDate, schoolDayKey } from "@/lib/datetime";

// Popisky termínů (položek události). Čistá logika, použije ji i veřejná stránka.

export type ItemLike = { label: string | null; startsAt: Date | string | null; endsAt: Date | string | null };

const clock = new Intl.DateTimeFormat("cs-CZ", { timeZone: SCHOOL_TIME_ZONE, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
const dayNoYear = new Intl.DateTimeFormat("cs-CZ", { timeZone: SCHOOL_TIME_ZONE, weekday: "short", day: "numeric", month: "numeric" });

/** "9:00" (bez nuly na začátku) */
export function itemClock(d: Date | string): string {
  return clock.format(new Date(d));
}

/** "9:00–9:30", nebo jen "9:00", když termín nemá konec */
export function itemTimeRange(item: ItemLike): string {
  if (!item.startsAt) return "";
  return item.endsAt ? `${itemClock(item.startsAt)}–${itemClock(item.endsAt)}` : itemClock(item.startsAt);
}

/** Popisek termínu: s časem „po 12. 1. 9:00–9:30“, jinak jeho název. */
export function itemLabel(item: ItemLike): string {
  if (!item.startsAt) return item.label?.trim() || "Termín";
  return `${dayNoYear.format(new Date(item.startsAt))} ${itemTimeRange(item)}`;
}

export type ItemGroup<T> = { key: string; title: string; items: T[] };

/** Termíny seskupené po dnech (podle času), na konci skupina „Bez času“ (v pořadí `order`). */
export function groupItemsByDay<T extends ItemLike & { order: number }>(items: T[]): ItemGroup<T>[] {
  const timed = items
    .filter((i) => i.startsAt)
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime() || a.order - b.order);
  const groups: ItemGroup<T>[] = [];
  for (const item of timed) {
    const key = schoolDayKey(new Date(item.startsAt!));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, title: formatDate(item.startsAt!), items: [item] });
  }
  const untimed = items.filter((i) => !i.startsAt).sort((a, b) => a.order - b.order);
  if (untimed.length) groups.push({ key: "none", title: "Bez času", items: untimed });
  return groups;
}

/** Plný popisek termínu pro potvrzení a e-mail: „12. 1. 2027 9:00–9:30 · název“, jinak jeho název. */
export function itemFullLabel(item: ItemLike): string {
  if (!item.startsAt) return item.label?.trim() || "Termín";
  const label = item.label?.trim();
  return `${formatDate(item.startsAt)} ${itemTimeRange(item)}${label ? ` · ${label}` : ""}`;
}
