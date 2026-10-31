"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinutes, formatTimeRange } from "@/lib/datetime";
import type { MakeupSessionItem } from "@/modules/makeup/types";

/** Text uzávěrky: "zápis/odhlášení do 30 min před začátkem" */
export function deadlineText(minutes: number) {
  return minutes > 0 ? `${formatMinutes(minutes)} před začátkem` : "do začátku";
}

export function isPastDeadline(s: MakeupSessionItem) {
  return new Date() > new Date(s.changeDeadline);
}

export function SubjectBadges({ subjects, highlight }: { subjects: { id: string; name: string }[]; highlight?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {subjects.map((s) => (
        <Badge key={s.id} variant={highlight?.includes(s.id) ? "default" : "secondary"} className="font-normal">
          {s.name}
        </Badge>
      ))}
    </div>
  );
}

export function CapacityBadge({ s }: { s: MakeupSessionItem }) {
  const full = s.registeredCount >= s.capacity;
  return (
    <span className={full ? "text-danger font-medium" : ""} data-testid="capacity">
      {s.registeredCount}/{s.capacity}
    </span>
  );
}

/** Tabulka termínů; poslední sloupec vykreslí `action`. */
export function SessionsTable({
  sessions,
  action,
  highlightSubjects,
  empty = "Žádné termíny.",
}: {
  sessions: MakeupSessionItem[];
   
  action?: (s: MakeupSessionItem) => ReactNode;
  highlightSubjects?: string[];
  empty?: string;
}) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kdy</TableHead>
          <TableHead>Učebna</TableHead>
          <TableHead>Dozor</TableHead>
          <TableHead>Předměty</TableHead>
          <TableHead>Obsazeno</TableHead>
          <TableHead>Uzávěrka změn</TableHead>
          {action && <TableHead className="text-right" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s.id} data-session={s.id} className={s.cancelledAt ? "opacity-60" : ""}>
            <TableCell className="whitespace-nowrap font-medium">
              {formatTimeRange(s.startsAt, s.endsAt)}
              {s.cancelledAt && <Badge variant="destructive" className="ml-2">zrušeno</Badge>}
              {s.note && <div className="text-xs text-muted-foreground font-normal">{s.note}</div>}
            </TableCell>
            <TableCell>{s.room}</TableCell>
            <TableCell className="whitespace-nowrap">{s.teacherName}</TableCell>
            <TableCell><SubjectBadges subjects={s.subjects} highlight={highlightSubjects} /></TableCell>
            <TableCell><CapacityBadge s={s} /></TableCell>
            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{deadlineText(s.changeDeadlineMinutes)}</TableCell>
            {action && <TableCell className="text-right whitespace-nowrap">{action(s)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
