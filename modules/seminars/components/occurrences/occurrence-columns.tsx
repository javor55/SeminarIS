"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  SubjectOccurrence,
  SubjectOccurrenceWithRelations,
  Block,
  EnrollmentWindowWithBlocks,
  User,
  StudentEnrollment,
} from "@/lib/types";
import React from "react";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// typ řádku – univerzální, volitelná metadata
export type OccurrenceRow = SubjectOccurrence & {
  subject?: {
    id: string;
    name: string;
    code?: string | null;
  };

  blockName: string;
  block: Block & { occurrences?: SubjectOccurrenceWithRelations[] };
  enrollmentWindow?: EnrollmentWindowWithBlocks;
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
  enrollments?: StudentEnrollment[];
  isWindowOpen?: boolean;
  /** student smí teď odepsat / přepsat zápis (pravidla okna) a důvod, proč ne */
  canUnenroll?: boolean;
  unenrollBlockedReason?: string;
  /** okno ukazuje studentům jména zapsaných */
  canSeeNames?: boolean;
  /** omezení výskytu na ročníky / třídy jako text (jen pro učitele a adminy), nebo prázdné */
  restrictionLabel?: string;
};

// props pro generování sloupců
export function getOccurrenceColumns(opts: {
  currentUser: User | null;
  onStudents: (_: OccurrenceRow) => void;
  onEdit: (_: OccurrenceRow) => void;
  onDelete: (_: OccurrenceRow) => void;
  onEnroll?: (_: OccurrenceRow) => void;
  onUnenroll?: (_: OccurrenceRow) => void;
  onNames?: (_: OccurrenceRow) => void;
  /** možnost skrýt některé sloupce podle kontextu */
  showSubjectName?: boolean;
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
    onNames,
    showSubjectName = true,
    showEnrollmentName = true,
    showStatus = true,
    showBlockName = true,
  } = opts;

  const cols: ColumnDef<OccurrenceRow>[] = [];

  // PŘEDMĚT
  if (showSubjectName) {
    cols.push({
    id: "subject",
    header: "Předmět",
    cell: ({ row }) => {
      const occ = row.original;
      if (!occ.subject) return null;
      // Student nevidí sloupec kódu výskytu – skupinu (podkód) mu ukážeme u názvu, aby rozlišil např. Konverzace A/B
      const isStudentView = currentUser?.role === "STUDENT" || currentUser?.role === "GUEST";
      return (
        <span>
          <a
            href={`/subjects/${occ.subject.id}`}
            className="font-medium hover:underline"
          >
            {occ.subject.name}
          </a>
          {isStudentView && occ.subCode && (
            <span className="ml-1 text-muted-foreground" data-testid="occurrence-group">(skupina {occ.subCode})</span>
          )}
        </span>
      );
    },
  });
  }

  // ZÁPIS
  if (showEnrollmentName) {
    cols.push({
      accessorKey: "enrollmentName",
      header: "Zápis",
      cell: ({ row: _row }) => _row.original.enrollmentName ?? "",
    });
  }

  // STAV
  if (showStatus) {
    cols.push({
      accessorKey: "statusLabel",
      header: "Stav",
      cell: ({ row: _row }) =>
        _row.original.statusLabel ? (
          <span className="inline-flex rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {_row.original.statusLabel}
          </span>
        ) : null,
    });
  }

  // BLOK
  if (showBlockName) {
    cols.push({
      accessorKey: "blockName",
      header: "Blok",
      cell: ({ row: _row }) => _row.original.blockName ?? "",
    });
  }

  // KÓD VÝSKYTU (interní údaj: student ho nevidí, učitel a admin ano)
  if (currentUser?.role !== "STUDENT" && currentUser?.role !== "GUEST") cols.push({
    accessorKey: "fullCode",
    header: "Kód výskytu",
    cell: ({ row: _row }) => (
      <div>
        <span className="font-mono text-xs text-muted-foreground">
          {_row.original.fullCode ?? ""}
        </span>
        {_row.original.restrictionLabel && (
          <div className="text-[11px] text-warning" data-testid="occurrence-restriction-label">
            jen: {_row.original.restrictionLabel}
          </div>
        )}
      </div>
    ),
  });

  // UČITEL
  cols.push({
    accessorKey: "teacherName",
    header: "Učitel",
    cell: ({ row: _row }) => <span className="whitespace-nowrap">{_row.original.teacherName ?? ""}</span>,
  });

  // OBSAZENOST
  cols.push({
    accessorKey: "capacityText",
    header: "Obsaz.",
    cell: ({ row: _row }) => (
      <span className="text-muted-foreground text-center block">
        {_row.original.capacityText ?? ""}
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
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          {/* STUDENT – zápis / odepsání */}
          {currentUser?.role === "STUDENT" && (
            <>
              {enrolledByMe ? (
                onUnenroll && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={occ.isWindowOpen === false || occ.canUnenroll === false}
                    title={occ.canUnenroll === false ? occ.unenrollBlockedReason : undefined}
                    data-testid="unenroll-button"
                    onClick={() => onUnenroll(occ)}
                  >
                    Odepsat
                  </Button>
                )
              ) : (
                onEnroll && (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={isFull || occ.isWindowOpen === false}
                    data-testid="enroll-button"
                    onClick={() => onEnroll(occ)}
                  >
                    Zapsat
                  </Button>
                )
              )}
              {occ.canSeeNames && onNames && (
                <Button size="sm" variant="outline" data-testid="participants-button" onClick={() => onNames(occ)}>
                  Zapsaní
                </Button>
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

          {/* ADMIN pouze: další akce v menu, aby řádek zůstal nízký */}
          {currentUser?.role === "ADMIN" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Akce výskytu ${occ.subject?.name ?? ""}`} data-testid="occurrence-menu">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(occ)}>Upravit</DropdownMenuItem>
                <DropdownMenuItem className="text-danger" disabled={hasStudents} onSelect={() => onDelete(occ)}>
                  {hasStudents ? "Smazat (nejdřív odepište studenty)" : "Smazat"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      );
    },
  });

  return cols;
}
