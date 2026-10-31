"use client";

import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { subjectGradesLabel } from "@/lib/school";
import { SubjectBadgeChip } from "@/modules/core/components/subjects/SubjectBadgeChip";
import type { SubjectListItem } from "@/modules/core/actions/subjects";

export type SubjectRow = SubjectListItem;

const includesFilter = (row: { getValue: (_: string) => unknown }, id: string, value: string[]) => {
  if (!value || value.length === 0) return true;
  return value.includes(row.getValue(id) as string);
};

export const subjectsColumns: ColumnDef<SubjectRow>[] = [
  {
    accessorKey: "name",
    header: "Předmět",
    cell: ({ row }) => {
      const s = row.original;
      return (
        <div className="flex items-center gap-2">
          <Link href={`/subjects/${s.id}`} className="text-info hover:underline font-medium">
            {s.name}
          </Link>
          {!s.isActive && (
            <Badge variant="danger" className="rounded-sm px-1.5 py-0.5 text-[10px] uppercase font-bold">Archiv</Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "code",
    header: "Zkratka",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.code ?? "—"}</span>,
  },
  {
    // filtr podle ročníku: prázdné `grades` = předmět se vyučuje ve všech ročnících
    id: "grades",
    header: "Ročníky",
    accessorFn: (s) => s.grades,
    cell: ({ row }) => <span className="whitespace-nowrap">{subjectGradesLabel(row.original.grades)}</span>,
    filterFn: (row, _id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const grades = row.original.grades;
      return grades.length === 0 || grades.includes(Number(value[0]));
    },
  },
  {
    // štítky z modulů (např. „v zápisu“); filtr má tvar `<klíč>:yes|no`, viz SubjectsClientView
    id: "badges",
    header: "Štítky",
    accessorFn: (s) => s.badges.map((b) => b.label).join(", "),
    cell: ({ row }) => {
      const badges = row.original.badges;
      if (badges.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1" data-testid="subject-badges">
          {badges.map((b) => (
            <SubjectBadgeChip key={b.id} badge={b} />
          ))}
        </div>
      );
    },
    filterFn: (row, _id, value: string[]) => {
      if (!value || value.length === 0) return true;
      const [key, state] = value[0].split(":");
      const has = row.original.badges.some((b) => b.filter?.key === key);
      return state === "yes" ? has : !has;
    },
  },
  {
    id: "teachers",
    header: "Vyučující",
    accessorFn: (s) => s.teachers.join(", "),
    cell: ({ row }) => {
      const teachers = row.original.teachers;
      if (teachers.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {teachers.map((t) => (
            <span key={t} className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full border">
              {t}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Stav",
    accessorFn: (s) => (s.isActive ? "active" : "archived"),
    cell: ({ row }) =>
      row.original.isActive ? (
        <span className="text-success text-xs font-medium">Aktivní</span>
      ) : (
        <span className="text-danger text-xs font-medium">Archivováno</span>
      ),
    filterFn: includesFilter,
  },
];
