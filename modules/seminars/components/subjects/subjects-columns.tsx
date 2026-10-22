"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

export type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  syllabus: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string | null;
  createdBy: { firstName: string; lastName: string; email: string };
  updatedBy: { firstName: string; lastName: string; email: string } | null;
  subjectOccurrences: {
    teacher: { id: string; firstName: string; lastName: string; email: string };
  }[];
};

export const subjectsColumns: ColumnDef<SubjectRow>[] = [
  {
    accessorKey: "name",
    header: "Předmět",
    cell: ({ row }) => {
      const s = row.original;
      return (
        <div className="flex items-center gap-2">
          <Link
            href={`/subjects/${s.id}`}
            className="text-blue-600 hover:underline font-medium"
          >
            {s.name}
          </Link>
          {!s.isActive && (
            <span className="bg-red-100 text-red-800 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm">
              Archiv
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "code",
    header: "Kód",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.code ?? "—"}</span>,
  },
  {
    id: "teachers",
    header: "Garant / Učitelé",
    cell: ({ row }) => {
      const occs = row.original.subjectOccurrences || [];
      const teachersMap = new Map();
      occs.forEach(occ => {
        if (occ.teacher) {
          teachersMap.set(occ.teacher.id, `${occ.teacher.firstName} ${occ.teacher.lastName}`);
        }
      });
      
      const uniqueTeachers = Array.from(teachersMap.values());
      
      if (uniqueTeachers.length === 0) return <span className="text-muted-foreground">—</span>;
      
      return (
        <div className="flex flex-wrap gap-1">
          {uniqueTeachers.map((t, idx) => (
             <span key={idx} className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full border">
                {t}
             </span>
          ))}
        </div>
      );
    }
  },
  {
    accessorKey: "createdById",
    header: "Vytvořil",
    cell: ({ row }) => {
      const user = row.original.createdBy;
      return user ? <span className="text-sm">{user.firstName} {user.lastName}</span> : "—";
    },
  },
  {
    accessorKey: "createdAt",
    header: "Vytvořen",
    cell: ({ row }) =>
      row.original.createdAt
        ? new Date(row.original.createdAt).toLocaleDateString("cs-CZ")
        : "—",
  },
  {
    accessorKey: "updatedById",
    header: "Upravil",
    cell: ({ row }) => {
       const user = row.original.updatedBy;
       return user ? <span className="text-sm">{user.firstName} {user.lastName}</span> : "—";
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Aktualizován",
    cell: ({ row }) =>
      row.original.updatedAt
        ? new Date(row.original.updatedAt).toLocaleDateString("cs-CZ")
        : "—",
  },
];
