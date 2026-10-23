"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { subjectGradesLabel } from "@/lib/school";
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
          <Link href={`/subjects/${s.id}`} className="text-blue-600 hover:underline font-medium">
            {s.name}
          </Link>
          {!s.isActive && (
            <span className="bg-red-100 text-red-800 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm">Archiv</span>
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
    id: "inWindow",
    header: "V zápisu",
    accessorFn: (s) => (s.windows.length > 0 ? "yes" : "no"),
    cell: ({ row }) => {
      const windows = row.original.windows;
      if (windows.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1" data-testid="subject-windows">
          {windows.map((w) => (
            <span key={w.id} className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/30">
              v zápisu: {w.name}
            </span>
          ))}
        </div>
      );
    },
    filterFn: includesFilter,
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
        <span className="text-emerald-600 text-xs font-medium">Aktivní</span>
      ) : (
        <span className="text-red-600 text-xs font-medium">Archivováno</span>
      ),
    filterFn: includesFilter,
  },
];
