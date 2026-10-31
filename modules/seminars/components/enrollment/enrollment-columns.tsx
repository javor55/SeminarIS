"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { User, EnrollmentWindow } from "@/lib/types";
import { windowPhase } from "@/modules/seminars/window-phase";
import Link from "next/link"; // Pro proklik z názvu
import { Badge } from "@/components/ui/badge"; // Pro badge stavu
import { formatDateTime } from "@/lib/datetime";
// 🔥 Ikony Check a X již nejsou potřeba
// import { Check, X } from "lucide-react";

// Definujeme si typ řádku, který budeme posílat do DataTable
export type EnrollmentRow = EnrollmentWindow & {
  uniqueStudentCount: number;
  fullyEnrolledCount: number;
  blocksWithCounts: {
    id: string;
    name: string;
    count: number;
  }[];
  fullData: unknown;
};

// Funkce pro generování sloupců
export function getEnrollmentColumns(opts: {
  currentUser: User | null;
  onEdit: (row: EnrollmentRow) => void;
}): ColumnDef<EnrollmentRow>[] {
  const { currentUser, onEdit } = opts;

  return [
    { // Sloupec 1 (Název)
      accessorKey: "name",
      header: "Název",
      cell: ({ row }) => {
        const { id, name, description } = row.original;
        return (
          <div className="max-w-xs">
            <Link
              href={`/enrollments/${id}`}
              className="font-medium text-info hover:underline"
            >
              {name}
            </Link>
            {description && (
              <p className="text-xs text-muted-foreground overflow-hidden text-ellipsis line-clamp-2">
                {description}
              </p>
            )}
          </div>
        );
      },
    },
    { // Sloupec 2 (Stav): koncept / naplánováno / otevřeno / uzavřeno, odvozeno z dat okna; koncept = studenti okno nevidí
      id: "phase",
      accessorFn: (ew) => windowPhase(ew).phase,
      header: "Stav",
      cell: ({ row }) => {
        const info = windowPhase(row.original);
        const variant = { DRAFT: "secondary", PLANNED: "infoSolid", OPEN: "successSolid", CLOSED: "outline" }[info.phase] as "outline" | "secondary" | "successSolid" | "infoSolid";
        return <Badge variant={variant}>{info.label}</Badge>;
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0) return true;
        return value.includes(row.getValue(id));
      },
    },

    {
      id: "audience",
      header: "Publikum",
      cell: ({ row }) => <span data-testid="window-audience-cell">{row.original.audienceView?.summary ?? "—"}</span>,
    },

    { // Sloupec 3 (Začátek)
      accessorKey: "startsAt",
      header: "Začátek",
      cell: ({ row }) => formatDateTime(row.original.startsAt),
    },
    { // Sloupec 4 (Konec)
      accessorKey: "endsAt",
      header: "Konec",
      cell: ({ row }) => formatDateTime(row.original.endsAt),
    },
    
    // 🔥 ZMĚNA: Sloupec "Viditelné" byl odsud přesunut
    
    { // Sloupec 5 (Bloky)
      accessorKey: "blocksWithCounts",
      header: "Bloky (předměty)",
      cell: ({ row }) => {
        const { blocksWithCounts } = row.original;
        return (
          <div className="flex flex-col gap-1">
            {blocksWithCounts.length === 0 && (
              <span className="text-xs text-muted-foreground">Žádné bloky</span>
            )}
            {blocksWithCounts.map((b: { id: string; name: string; count: number }) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1 text-xs text-foreground"
              >
                <span>{b.name}</span>
                <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {b.count}
                </span>
              </span>
            ))}
          </div>
        );
      },
    },
    { // Sloupec 6 (Zapsaní studenti)
      accessorKey: "uniqueStudentCount",
      header: "Zapsaní studenti",
      cell: ({ row }) => (
        <span className="text-center block font-medium text-foreground">
          {row.original.uniqueStudentCount}
        </span>
      ),
    },
    { // Sloupec 7 (Kompletně zapsaní)
      accessorKey: "fullyEnrolledCount",
      header: "Kompletně zapsaní",
      cell: ({ row }) => (
        <span className="text-center block font-medium text-foreground">
          {row.original.fullyEnrolledCount}
        </span>
      ),
    },
    { // Sloupec 8 (Akce)
      id: "actions",
      header: "Akce",
      cell: ({ row }) => {
        const enrollment = row.original;
        return (
          <div className="text-right space-x-2 whitespace-nowrap">
            {currentUser?.role === "ADMIN" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(enrollment)}
              >
                Upravit zápis
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}