"use client";

import { SubjectRow, subjectsColumns } from "./subjects-columns";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { User } from "@/lib/types";

export function SubjectsClientView({
  subjects,
  users,
  currentUser,
}: {
  subjects: SubjectRow[];
  users: any[];
  currentUser: User;
}) {
  const isAllowed = currentUser.role === "ADMIN" || currentUser.role === "TEACHER";
  
  const userFilterOptions = users.map((u) => ({
    label: `${u.firstName} ${u.lastName}`,
    value: u.id,
  }));

  const handleExport = () => {
    const headers = ["Předmět", "Kód", "Garanti", "Vytvořil", "Vytvořeno", "Upraveno", "Má aktivní zápisy", "Stav"];
    const rows = subjects.map(s => {
      const teachers = Array.from(new Set((s.subjectOccurrences || []).map(o => o.teacher ? `${o.teacher.firstName} ${o.teacher.lastName}` : null).filter(Boolean))).join(", ");
      const hasActive = (s.subjectOccurrences || []).length > 0 ? "ANO" : "NE";
      
      const safeName = s.name ? s.name.replace(/"/g, '""') : "";
      const safeTeachers = teachers.replace(/"/g, '""');

      return [
        `"${safeName}"`,
        s.code || "",
        `"${safeTeachers}"`,
        `${s.createdBy?.firstName || ""} ${s.createdBy?.lastName || ""}`,
        s.createdAt ? new Date(s.createdAt).toLocaleDateString("cs-CZ") : "",
        s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("cs-CZ") : "",
        hasActive,
        s.isActive !== false ? "Aktivní" : "Archivováno"
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `export_predmetu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export dokončen.");
  };

  const handleExportSyllabus = () => {
    const headers = ["Předmět", "Kód", "Sylabus / Popis"];
    const rows = subjects.map(s => [
      `"${(s.name || "").replace(/"/g, '""')}"`,
      s.code || "",
      `"${(s.syllabus || "").replace(/"/g, '""')}"`
    ]);


    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `katalog_sylabu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Katalog sylabů byl exportován.");
  };

  const isEmpty = subjects.length === 0;

  return (
    <div className="space-y-4">
      {/* HLAVIČKA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Předměty</h1>
          <p className="text-sm text-muted-foreground">
            {isAllowed 
              ? "Seznam předmětů a jejich kódů." 
              : "Katalog seminářů nabízených v rámci vašich zápisů."}
          </p>
        </div>

        {/* 🔥 TLAČÍTKA - Viditelná jen pro ADMIN/TEACHER */}
        {isAllowed && (
          <div className="flex items-center gap-2">
            {!isEmpty && (
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            )}
            {!isEmpty && (
               <Button onClick={handleExportSyllabus} variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Katalog sylabů
               </Button>
            )}
            <Button asChild size="sm">
              <Link href="/subjects/new">
                <Plus className="mr-2 h-4 w-4" />
                Nový předmět
              </Link>
            </Button>
          </div>
        )}
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>Zatím nebyly vytvořeny žádné předměty.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isAllowed && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md">Celkem předmětů</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{subjects.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md">Aktivní katalog</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-600">
                    {subjects.filter((s) => s.isActive !== false).length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md">Archivováno</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-500">
                    {subjects.filter((s) => s.isActive === false).length}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <DataTable<SubjectRow>
            data={subjects}
            columns={subjectsColumns}
            searchPlaceholder="Hledat podle názvu nebo kódu…"
            searchKeys={["name", "code"]}
            selectFilters={[
              {
                columnId: "createdById",
                label: "Vytvořil",
                options: userFilterOptions,
              },
              {
                columnId: "updatedById",
                label: "Upravil",
                options: userFilterOptions,
              },
            ]}
            dateFilters={[
              {
                id: "createdAt",
                label: "Vytvořen",
                getDate: (s) => (s.createdAt ? new Date(s.createdAt) : null),
              },
              {
                id: "updatedAt",
                label: "Aktualizován",
                getDate: (s) => (s.updatedAt ? new Date(s.updatedAt) : null),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
