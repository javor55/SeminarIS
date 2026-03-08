"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Settings2, X } from "lucide-react";
// Importy pro DateTimePicker
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { cs } from "date-fns/locale";
// Import pro popisky "Od:" / "Do:"
import { Label } from "@/components/ui/label";

type SelectFilterDef = {
  /** id sloupce (ColumnDef.accessorKey) pro filtrování */
  columnId: string;
  label: string;
  /** “Vše” se nastaví automaticky; zbytek zadej sem */
  options: { label: string; value: string }[];
};

type DateFilterDef<T> = {
  /** unikátní id filtru (např. "createdAt") */
  id: string;
  label: string;
  /** funkce která z řádku vrátí Date nebo null */
  getDate: (row: T) => Date | null;
};

export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T, any>[];
  /** placeholder pro hledání */
  searchPlaceholder?: string;
  /** pole klíčů, ve kterých se hledá (např. ['name','email']) */
  searchKeys?: (keyof T)[];
  /** selekt filtry (faceted) – delegováno na TanStack column filterFn */
  selectFilters?: SelectFilterDef[];
  /** datumové filtry – aplikují se *po* TanStack filtrech */
  dateFilters?: DateFilterDef<T>[];
  /** panel hromadných akcí v popoveru (vedle tlačítka Filtry) */
  bulkPopoverRender?: (args: {
    /** vyfiltrované řádky (po všech filtrech) */
    filteredRows: T[];
    /** callback pro rerender */
    forceRefresh: () => void;
  }) => React.ReactNode;
  /** init size */
  initialPageSize?: number;

  // 🔥 NOVÉ PROPS
  forceRefresh?: () => void;
  /** Skryje celý horní panel (hledání, filtry) */
  hideToolbar?: boolean;
  /** Skryje celý dolní panel (stránkování) */
  hideFooter?: boolean;
};

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Hledat…",
  searchKeys = [],
  selectFilters = [],
  dateFilters = [],
  bulkPopoverRender,
  initialPageSize = 10,
  // 🔥 NOVÉ PROPS
  hideToolbar = false,
  hideFooter = false,
  forceRefresh: externalForceRefresh,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<any>([]);
  const [, force] = React.useState(0);
  const forceRefresh = () => force((x) => x + 1);

  // vlastní stránkování (protože datumy filtrujeme ručně)
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  // TanStack table – bez pagination modelu
  const table = useReactTable({
    data,
    columns,
    state: { columnFilters, globalFilter },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      forceRefresh: () => {
        forceRefresh();
        if (externalForceRefresh) externalForceRefresh();
      },
    },
    // getPaginationRowModel() NEpoužíváme – stránkujeme ručně
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const q = String(filterValue).toLowerCase().trim();
      if (!q) return true;
      if (searchKeys.length === 0) return true; // nic neurčeno => nefiltrujeme
      const original: any = row.original;
      return searchKeys.some((k) => {
        const val = (original?.[k] ?? "") as string;
        return String(val).toLowerCase().includes(q);
      });
    },
  });

  // 1) řádky po tanstack (bez pagination)
  const tableRows = table.getPrePaginationRowModel().rows;

  // 2) datumové filtry – od/do držíme jako ISO stringy v mapě
  type DateState = { from?: string; to?: string };
  const [dateState, setDateState] = React.useState<Record<string, DateState>>(
    {}
  );

  const filteredRows = tableRows.filter((row) => {
    if (dateFilters.length === 0) return true;
    const r = row.original as T;

    for (const df of dateFilters) {
      const st = dateState[df.id] ?? {};
      const d = df.getDate(r);
      
      // Porovnáváme přesný čas
      if (st.from && d) {
        const from = new Date(st.from); // 'st.from' je ISO string
        if (d < from) return false;
      }
      if (st.to && d) {
        const to = new Date(st.to); // 'st.to' je ISO string
        if (d > to) return false;
      }
    }
    return true;
  });

  // 3) stránkování
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  
  // 🔥 ZMĚNA LOGIKY STRÁNKOVÁNÍ
  // Pokud je patička skrytá, zobrazíme všechny řádky. Jinak stránkujeme.
  const pageSlice = hideFooter
    ? filteredRows
    : filteredRows.slice(
        safePageIndex * pageSize,
        safePageIndex * pageSize + pageSize
      );
      
  // --- Logika pro RESET ---
  const handleResetFilters = () => {
    setGlobalFilter("");
    setColumnFilters([]);
    setDateState({});
    setPageIndex(0);
  };

  const handleResetPopoverFilters = () => {
    setColumnFilters([]);
    setDateState({});
    setPageIndex(0);
  };

  // Zjistí, zda je nějaký filtr aktivní
  const isFiltered =
    globalFilter !== "" ||
    columnFilters.length > 0 ||
    Object.keys(dateState).length > 0;

  return (
    <Card>
      <CardContent className="p-0">
      
        {/* 🔥 PODMÍNĚNÉ RENDEROVÁNÍ TOOLBARU */}
        {!hideToolbar && (
          <div className="flex items-center justify-between flex-wrap gap-2 p-2 border-b">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value);
                  setPageIndex(0);
                }}
                className="h-8 w-[240px]"
              />

              {/* Filtry */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filtry
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[500px] space-y-3" align="start">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Filtry
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleResetPopoverFilters}
                    >
                      Vymazat
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {/* SELECT filtry (faceted) */}
                    {selectFilters.map((sf) => {
                      const col = table.getColumn(sf.columnId);
                      const current = (col?.getFilterValue() as string[]) ?? [];
                      const currentVal = current[0] ?? "ALL";
                      return (
                        <div key={sf.columnId} className="space-y-1 text-left">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            {sf.label}
                          </label>
                          <Select
                            value={currentVal}
                            onValueChange={(v) => {
                              if (v === "ALL") col?.setFilterValue([]);
                              else col?.setFilterValue([v]);
                              setPageIndex(0);
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALL">Vše</SelectItem>
                              {sf.options.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}

                    {/* DATE RANGE filtry */}
                    {dateFilters.map((df) => {
                      const st = dateState[df.id] ?? {};
                      
                      return (
                        <div key={df.id} className="space-y-2 col-span-2 border-t pt-2 mt-2">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            {df.label}
                          </p>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {/* Vstup "OD" */}
                            <div className="flex flex-col gap-1 text-left">
                              <Label className="text-[10px] font-medium text-muted-foreground">Od:</Label>
                              <DateTimePicker
                                className="w-full h-8"
                                value={st.from ? new Date(st.from) : null}
                                onChange={(date) => {
                                  setDateState((p) => ({
                                    ...p,
                                    [df.id]: {
                                      ...p[df.id],
                                      from: date ? date.toISOString() : "",
                                    },
                                  }));
                                  setPageIndex(0);
                                }}
                              />
                            </div>
                            
                            {/* Vstup "DO" */}
                            <div className="flex flex-col gap-1 text-left">
                              <Label className="text-[10px] font-medium text-muted-foreground">Do:</Label>
                              <DateTimePicker
                                className="w-full h-8"
                                value={st.to ? new Date(st.to) : null}
                                onChange={(date) => {
                                  setDateState((p) => ({
                                    ...p,
                                    [df.id]: {
                                      ...p[df.id],
                                      to: date ? date.toISOString() : "",
                                    },
                                  }));
                                  setPageIndex(0);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {isFiltered && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={handleResetFilters}
                >
                  Reset
                  <X className="w-4 h-4" />
                </Button>
              )}

              {/* Hromadné akce */}
              {bulkPopoverRender && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Settings2 className="w-4 h-4" />
                      Hromadné akce
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    {bulkPopoverRender({
                      filteredRows: filteredRows.map((r) => r.original as T),
                      forceRefresh,
                    })}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        )}

        {/* Tabulka */}
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(
                            h.column.columnDef.header,
                            h.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {pageSlice.length ? (
                pageSlice.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    Nic nenalezeno.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* 🔥 PODMÍNĚNÉ RENDEROVÁNÍ FOOTERU */}
        {!hideFooter && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Řádků na stránku:
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
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
              Strana {safePageIndex + 1} z{" "}
              {Math.max(1, Math.ceil(totalRows / pageSize))} • {totalRows} záznamů
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
                onClick={() =>
                  setPageIndex((x) =>
                    Math.min(
                      Math.max(0, Math.ceil(totalRows / pageSize) - 1),
                      x + 1
                    )
                  )
                }
                disabled={
                  safePageIndex >= Math.max(0, Math.ceil(totalRows / pageSize) - 1)
                }
              >
                Další
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}