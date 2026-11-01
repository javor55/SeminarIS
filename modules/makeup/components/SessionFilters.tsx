"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  SESSION_PERIODS,
  SESSION_PERIOD_LABELS,
  isDefaultSessionFilter,
  parseSessionFilter,
  sessionFilterToParams,
  type SessionFilter,
} from "@/modules/makeup/session-filter";

/** Filtry seznamu termínů; hodnoty jsou v adrese (?teacher=&subject=&period=&free=1), takže jdou sdílet. */
export function SessionFilters({
  teachers,
  subjects,
}: {
  teachers: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filter = parseSessionFilter(search);

  function update(patch: Partial<SessionFilter>) {
    const next = sessionFilterToParams({ ...filter, ...patch }).toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="session-filters">
      <div className="w-44 space-y-1">
        <Label htmlFor="filter-period" className="text-xs text-muted-foreground">Období</Label>
        <NativeSelect id="filter-period" value={filter.period} onChange={(e) => update({ period: e.target.value as SessionFilter["period"] })}>
          {SESSION_PERIODS.map((p) => (
            <option key={p} value={p}>{SESSION_PERIOD_LABELS[p]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="w-56 space-y-1">
        <Label htmlFor="filter-teacher" className="text-xs text-muted-foreground">Učitel (dozor)</Label>
        <NativeSelect id="filter-teacher" value={filter.teacher ?? ""} onChange={(e) => update({ teacher: e.target.value || undefined })}>
          <option value="">Všichni</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="w-56 space-y-1">
        <Label htmlFor="filter-subject" className="text-xs text-muted-foreground">Předmět</Label>
        <NativeSelect id="filter-subject" value={filter.subject ?? ""} onChange={(e) => update({ subject: e.target.value || undefined })}>
          <option value="">Všechny</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex h-9 items-center gap-2">
        <Switch id="filter-free" checked={filter.freeOnly} onCheckedChange={(v) => update({ freeOnly: v })} />
        <Label htmlFor="filter-free" className="text-sm">Jen s volnými místy</Label>
      </div>
      {!isDefaultSessionFilter(filter) && (
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.replace(pathname, { scroll: false })} data-testid="filters-reset">
          <X className="h-4 w-4" /> Zrušit filtry
        </Button>
      )}
    </div>
  );
}
