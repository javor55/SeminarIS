"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  SubjectOccurrence,
  Block,
  EnrollmentWindowWithBlocks,
  User,
} from "@/lib/types";
import React from "react";

// typ řádku – univerzální, volitelná metadata
export type OccurrenceRow = SubjectOccurrence & {
  subject?: {
    id: string;
    name: string;
    code?: string | null;
  };

  blockName: string;
  block: Block & { occurrences: any[] };
  enrollmentWindow: EnrollmentWindowWithBlocks;
  enrollmentName: string;
  statusLabel: string;
  capacityText: string;
  hasStudents: boolean;  
  fullCode?: string;
  teacherName?: string;
  searchText?: string;
  /** doplňkové flagy pro zápis */
  isFull?: boolean;
  enrolledByMe?: boolean;
};

// props pro generování sloupců
export function getOccurrenceColumns(opts: {
  currentUser: User | null;
  onStudents: (row: OccurrenceRow) => void;
  onEdit: (row: OccurrenceRow) => void;
  onDelete: (row: OccurrenceRow) => void;
  onEnroll?: (row: OccurrenceRow) => void;
  onUnenroll?: (row: OccurrenceRow) => void;
  /** možnost skrýt některé sloupce podle kontextu */
  showEnrollmentName?: boolean;
  showStatus?: boolean;
  showBlockName?: boolean;
}): ColumnDef<OccurrenceRow>[] {
  const {
    currentUser,
    onStudents,
    onEdit,
    onDelete,
    onEnroll,
    onUnenroll,
    showEnrollmentName = true,
    showStatus = true,
    showBlockName = true,
  } = opts;

  const cols: ColumnDef<OccurrenceRow>[] = [];

  // PŘEDMĚT
  cols.push({
    id: "subject",
    header: "Předmět",
    cell: ({ row }) => {
      const occ = row.original;
      if (!occ.subject) return null;
      return (
        <a
          href={`/subjects/${occ.subject.id}`}
          className="font-medium hover:underline"
        >
          {occ.subject.name}
        </a>
      );
    },
  });

  // ZÁPIS
  if (showEnrollmentName) {
    cols.push({
      accessorKey: "enrollmentName",
      header: "Zápis",
      cell: ({ row }) => row.original.enrollmentName ?? "",
    });
  }

  // STAV
  if (showStatus) {
    cols.push({
      accessorKey: "statusLabel",
      header: "Stav",
      cell: ({ row }) =>
        row.original.statusLabel ? (
          <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {row.original.statusLabel}
          </span>
        ) : null,
    });
  }

  // BLOK
  if (showBlockName) {
    cols.push({
      accessorKey: "blockName",
      header: "Blok",
      cell: ({ row }) => row.original.blockName ?? "",
    });
  }

  // KÓD VÝSKYTU
  cols.push({
    accessorKey: "fullCode",
    header: "Kód výskytu",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-slate-700">
        {row.original.fullCode ?? ""}
      </span>
    ),
  });

  // UČITEL
  cols.push({
    accessorKey: "teacherName",
    header: "Učitel",
    cell: ({ row }) => row.original.teacherName ?? "",
  });

  // OBSAZENOST
  cols.push({
    accessorKey: "capacityText",
    header: "Obsaz.",
    cell: ({ row }) => (
      <span className="text-slate-600 text-center block">
        {row.original.capacityText ?? ""}
      </span>
    ),
  });

  // AKCE
  cols.push({
    id: "actions",
    header: "Akce",
    cell: ({ row }) => {
      const occ = row.original;
      const hasStudents = occ.hasStudents ?? false;
      const enrolledByMe = occ.enrolledByMe ?? false;
      const isFull = occ.isFull ?? false;

      return (
        <div className="flex gap-2 justify-end flex-wrap">
          {/* STUDENT – zápis / odepsání */}
          {currentUser?.role === "STUDENT" && (
            <>
              {enrolledByMe ? (
                onUnenroll && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onUnenroll(occ)}
                  >
                    Odepsat
                  </Button>
                )
              ) : (
                onEnroll && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isFull}
                    onClick={() => onEnroll(occ)}
                  >
                    Zapsat
                  </Button>
                )
              )}
            </>
          )}

          {/* ADMIN + TEACHER */}
          {(currentUser?.role === "ADMIN" ||
            currentUser?.role === "TEACHER") && (
            <Button size="sm" variant="outline" onClick={() => onStudents(occ)}>
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
  });

  return cols;
}
