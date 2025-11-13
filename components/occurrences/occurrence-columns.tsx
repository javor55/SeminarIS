"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { SubjectOccurrence, Block, EnrollmentWindowWithBlocks, User } from "@/lib/types";
import React from "react";

// typ řádku (OccurrenceRow z předchozí verze)
export type OccurrenceRow = SubjectOccurrence & {
  blockName: string;
  block: Block & { occurrences: any[] };
  enrollmentWindow: EnrollmentWindowWithBlocks;
  enrollmentName: string;
  statusLabel: string;
  capacityText: string;
  hasStudents: boolean;
  fullCode: string;
  teacherName: string;
  searchText: string;
};

// props pro generování sloupců
export function getOccurrenceColumns(opts: {
  currentUser: User | null;
  onStudents: (row: OccurrenceRow) => void;
  onEdit: (row: OccurrenceRow) => void;
  onDelete: (row: OccurrenceRow) => void;
  onEnroll?: (row: OccurrenceRow) => void;
}): ColumnDef<OccurrenceRow>[] {
  const { currentUser, onStudents, onEdit, onDelete, onEnroll } = opts;

  return [
    {
      accessorKey: "enrollmentName",
      header: "Zápis",
    },
    {
      accessorKey: "statusLabel",
      header: "Stav",
      cell: ({ row }) => (
        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {row.original.statusLabel}
        </span>
      ),
    },
    {
      accessorKey: "blockName",
      header: "Blok",
    },
    {
      accessorKey: "fullCode",
      header: "Kód výskytu",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-700">
          {row.original.fullCode}
        </span>
      ),
    },
    {
      accessorKey: "teacherName",
      header: "Učitel",
    },
    {
      accessorKey: "capacityText",
      header: "Obsaz.",
      cell: ({ row }) => (
        <span className="text-slate-600 text-center block">
          {row.original.capacityText}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Akce",
      cell: ({ row }) => {
        const occ = row.original;
        const hasStudents = occ.hasStudents;

        return (
          <div className="flex gap-2 justify-end flex-wrap">
            {/* STUDENT může zapsat */}
            {currentUser?.role === "STUDENT" && onEnroll && (
              <Button size="sm" variant="outline" onClick={() => onEnroll(occ)}>
                Zapsat
              </Button>
            )}

            {/* ADMIN + TEACHER */}
            {(currentUser?.role === "ADMIN" ||
              currentUser?.role === "TEACHER") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onStudents(occ)}
              >
                Studenti
              </Button>
            )}

            {/* ADMIN pouze */}
            {currentUser?.role === "ADMIN" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(occ)}
                >
                  Upravit
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  disabled={hasStudents}
                  onClick={() => onDelete(occ)}
                >
                  Smazat
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];
}
