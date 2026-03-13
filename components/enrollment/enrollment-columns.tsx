"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { User, EnrollmentWindow, EnrollmentStatus } from "@/lib/types";
import { cn, computeEnrollmentStatus } from "@/lib/utils";
import Link from "next/link"; // Pro proklik z názvu
import { Badge } from "@/components/ui/badge"; // Pro badge stavu
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
  fullData: any;
};

// Odstraněno: getStatusBadgeVariant se logikou přesunul do computeEnrollmentStatus a renderování do buňky

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
              className="font-medium text-blue-600 hover:underline"
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
    { // Sloupec 2 (Stav)
      accessorKey: "status",
      header: "Stav",
      cell: ({ row }) => {
        const ew = row.original;
        const statusMeta = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
        // Vybereme variantu badge podle interního 'is' klíče z utilits
        let variant: "default" | "secondary" | "outline" | "destructive" = "outline";
        let xtraClass = "";
        if (statusMeta.is === "open" && ew.status !== "DRAFT") { variant = "default"; xtraClass = "bg-emerald-600 hover:bg-emerald-600 text-white"; }
        if (statusMeta.is === "planned" && ew.status !== "DRAFT") { variant = "default"; xtraClass = "bg-blue-600 hover:bg-blue-600 text-white"; }
        if (ew.status === "DRAFT") { variant = "secondary"; }

        return <Badge variant={variant} className={cn(xtraClass)}>{statusMeta.label}</Badge>;
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0) return true;
        return value.includes(row.getValue(id));
      },
    },

    // 🔥 ZMĚNA: Sloupec přesunut sem a upraven
    { 
      accessorKey: "visibleToStudents",
      header: "Viditelné pro studenty", // Přejmenováno
      cell: ({ row }) => {
        const isVisible = row.original.visibleToStudents;
        if (isVisible) {
          // Používáme stejný styl jako "Otevřeno"
          return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-white">Ano</Badge>;
        }
        // Používáme neutrální styl
        return <Badge variant="outline">Ne</Badge>;
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0) return true;
        const rowValue = row.getValue(id) ? "yes" : "no";
        return value.includes(rowValue);
      },
    },
    
    { // Sloupec 3 (Začátek)
      accessorKey: "startsAt",
      header: "Začátek",
      cell: ({ row }) => new Date(row.original.startsAt).toLocaleString(),
    },
    { // Sloupec 4 (Konec)
      accessorKey: "endsAt",
      header: "Konec",
      cell: ({ row }) => new Date(row.original.endsAt).toLocaleString(),
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
            {blocksWithCounts.map((b: any) => (
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