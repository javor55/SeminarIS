"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  getSortedRowModel,
} from "@tanstack/react-table";
import { columns, UserRow } from "./columns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Filter, Settings2 } from "lucide-react";
import { updateUserRole, toggleUserActive } from "@/lib/mock-db";

export function UsersDataTable({ data }: { data: UserRow[] }) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<any>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [dateFilters, setDateFilters] = React.useState<{
    createdFrom?: string;
    createdTo?: string;
    lastLoginFrom?: string;
    lastLoginTo?: string;
  }>({});

  // hromadné akce (popup)
  const [bulkRole, setBulkRole] = React.useState<
    "ADMIN" | "TEACHER" | "STUDENT" | "GUEST" | ""
  >("");
  const [bulkStatus, setBulkStatus] = React.useState<"ACTIVE" | "INACTIVE" | "">("");

  // ruční stránkování nad už odfiltrovanými řádky
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
      columnFilters,
      globalFilter,
    },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    //getPaginationRowModel: getPaginationRowModel(),
  });

  // 1) necháme TanStack odfiltrovat základ
  //const tableRows = table.getRowModel().rows;
  const tableRows = table.getPrePaginationRowModel().rows;

  // 2) my ještě omezíme datumy
  const filteredRows = tableRows.filter((row) => {  
    const r = row.original;
    const cf = dateFilters.createdFrom ? new Date(dateFilters.createdFrom) : null;
    const ct = dateFilters.createdTo ? new Date(dateFilters.createdTo) : null;
    const lf = dateFilters.lastLoginFrom ? new Date(dateFilters.lastLoginFrom) : null;
    const lt = dateFilters.lastLoginTo ? new Date(dateFilters.lastLoginTo) : null;

    if (cf && r.createdAt && new Date(r.createdAt) < cf) return false;
    if (ct && r.createdAt && new Date(r.createdAt) > ct) return false;
    if (lf && r.lastLoginAt && new Date(r.lastLoginAt) < lf) return false;
    if (lt && r.lastLoginAt && new Date(r.lastLoginAt) > lt) return false;

    return true;
  });

  // 3) stránkování nad filteredRows
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const paginatedRows = filteredRows.slice(
    safePageIndex * pageSize,
    safePageIndex * pageSize + pageSize
  );

  function applyBulk() {
    filteredRows.forEach((row) => {
      const u = row.original;
      if (bulkRole) {
        updateUserRole(u.id, bulkRole);
      }
      if (bulkStatus) {
        const desiredActive = bulkStatus === "ACTIVE";
        const currentActive = u.isActive !== false;
        if (currentActive !== desiredActive) {
          toggleUserActive(u.id);
        }
      }
    });
    setBulkRole("");
    setBulkStatus("");
    table.resetRowSelection();
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* toolbar */}
        
        <div className="flex items-center justify-between flex-wrap gap-2 p-2 border-b">
          <div className="flex flex-wrap items-center gap-2">
            {/* Hledání */}
            <Input
              placeholder="Hledat jméno nebo e-mail..."
              value={globalFilter ?? ""}
              onChange={(event) => {
                setGlobalFilter(event.target.value);
                setPageIndex(0);
              }}
              className="h-8 w-[220px]"
            />

            {/* FILTRY */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filtry
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3" align="start">
                <p className="text-xs font-medium text-muted-foreground">Filtry</p>

                {/* role */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Role</label>
                  <Select
                    value={
                      ((table.getColumn("role")?.getFilterValue() as string[])?.[0] ??
                        "ALL") as string
                    }
                    onValueChange={(v) => {
                      if (v === "ALL") {
                        table.getColumn("role")?.setFilterValue([]);
                      } else {
                        table.getColumn("role")?.setFilterValue([v]);
                      }
                      setPageIndex(0);
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Vše</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                      <SelectItem value="TEACHER">TEACHER</SelectItem>
                      <SelectItem value="STUDENT">STUDENT</SelectItem>
                      <SelectItem value="GUEST">GUEST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* stav */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Stav</label>
                  <Select
                    value={
                      ((table.getColumn("isActive")?.getFilterValue() as string[])?.[0] ??
                        "ALL") as string
                    }
                    onValueChange={(v) => {
                      if (v === "ALL") {
                        table.getColumn("isActive")?.setFilterValue([]);
                      } else {
                        table.getColumn("isActive")?.setFilterValue([v]);
                      }
                      setPageIndex(0);
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Vše</SelectItem>
                      <SelectItem value="active">Aktivní</SelectItem>
                      <SelectItem value="inactive">Neaktivní</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* datové filtry */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Vytvořen</p>
                  <Input
                    type="datetime-local"
                    className="h-8"
                    value={dateFilters.createdFrom ?? ""}
                    onChange={(e) =>
                      setDateFilters((p) => ({ ...p, createdFrom: e.target.value }))
                    }
                  />
                  <Input
                    type="datetime-local"
                    className="h-8"
                    value={dateFilters.createdTo ?? ""}
                    onChange={(e) =>
                      setDateFilters((p) => ({ ...p, createdTo: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Poslední přihlášení
                  </p>
                  <Input
                    type="datetime-local"
                    className="h-8"
                    value={dateFilters.lastLoginFrom ?? ""}
                    onChange={(e) =>
                      setDateFilters((p) => ({ ...p, lastLoginFrom: e.target.value }))
                    }
                  />
                  <Input
                    type="datetime-local"
                    className="h-8"
                    value={dateFilters.lastLoginTo ?? ""}
                    onChange={(e) =>
                      setDateFilters((p) => ({ ...p, lastLoginTo: e.target.value }))
                    }
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* HROMADNÉ AKCE */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="w-4 h-4" />
                  Hromadné akce
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-2" align="start">
                <p className="text-xs font-medium text-muted-foreground">
                  Aplikovat na vyfiltrované ({filteredRows.length})
                </p>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Nastavit roli</label>
                  <Select value={bulkRole} onValueChange={(v: any) => setBulkRole(v)}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Nevybráno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                      <SelectItem value="TEACHER">TEACHER</SelectItem>
                      <SelectItem value="STUDENT">STUDENT</SelectItem>
                      <SelectItem value="GUEST">GUEST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Nastavit stav</label>
                  <Select value={bulkStatus} onValueChange={(v: any) => setBulkStatus(v)}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Nevybráno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Aktivní</SelectItem>
                      <SelectItem value="INACTIVE">Neaktivní</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={applyBulk}
                  className="w-full"
                  disabled={filteredRows.length === 0 || (!bulkRole && !bulkStatus)}
                >
                  Nastavit
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>


        {/* tabulka */}
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {paginatedRows.length ? (
                paginatedRows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    Nic nenalezeno.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* pagination footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Řádků na stránku:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const newSize = Number(v);
                setPageSize(newSize);
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            Strana {safePageIndex + 1} z {totalPages} • {totalRows} záznamů
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((x) => Math.max(0, x - 1))}
              disabled={safePageIndex === 0}
            >
              Předchozí
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((x) => Math.min(totalPages - 1, x + 1))}
              disabled={safePageIndex >= totalPages - 1}
            >
              Další
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
