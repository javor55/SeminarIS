"use client";

import { SubjectRow, subjectsColumns } from "./subjects-columns";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { User } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { GRADES, subjectGradesLabel } from "@/lib/school";
import { can } from "@/modules/registry";

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csvContent = "﻿" + [headers, ...rows].map((e) => e.join(";")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.setAttribute("href", URL.createObjectURL(blob));
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function SubjectsClientView({ subjects, currentUser }: { subjects: SubjectRow[]; currentUser: User }) {
  const canEdit = can(currentUser.role, "core.subjects.edit");

  const handleExport = () => {
    downloadCsv(
      "export_predmetu",
      ["Předmět", "Zkratka", "Ročníky", "V zápisu", "Vyučující", "Stav"],
      subjects.map((s) => [
        quote(s.name),
        s.code || "",
        quote(subjectGradesLabel(s.grades)),
        quote(s.windows.map((w) => w.name).join(", ")),
        quote(s.teachers.join(", ")),
        s.isActive ? "Aktivní" : "Archivováno",
      ])
    );
    toast.success("Export dokončen.");
  };

  const handleExportSyllabus = () => {
    downloadCsv(
      "katalog_sylabu",
      ["Předmět", "Zkratka", "Sylabus / Popis"],
      subjects.map((s) => [quote(s.name), s.code || "", quote(s.syllabus || "")])
    );
    toast.success("Katalog sylabů byl exportován.");
  };

  const isEmpty = subjects.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Předměty"
        description={
          canEdit
            ? "Katalog předmětů: ročníky, ve kterých se vyučují, vyučující a zápisy, kde jsou nabízeny."
            : "Předměty vašeho ročníku a předměty nabízené ve vašich zápisech."
        }
        actions={
          canEdit ? (
            <>
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
                <Link href="/subjects/new/edit">
                  <Plus className="mr-2 h-4 w-4" />
                  Nový předmět
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>{canEdit ? "Zatím nebyly vytvořeny žádné předměty." : "Zatím tu nejsou žádné předměty."}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {canEdit && (
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
                  <CardTitle className="text-md">Aktivní</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-600">{subjects.filter((s) => s.isActive).length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md">Archivováno</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-500">{subjects.filter((s) => !s.isActive).length}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <DataTable<SubjectRow>
            data={subjects}
            columns={subjectsColumns}
            searchPlaceholder="Hledat podle názvu nebo zkratky…"
            searchKeys={["name", "code"]}
            selectFilters={[
              {
                columnId: "grades",
                label: "Ročník",
                options: GRADES.map((g) => ({ label: `${g}. ročník`, value: String(g) })),
              },
              {
                columnId: "inWindow",
                label: "V zápisu",
                options: [
                  { label: "Nabízené v zápisu", value: "yes" },
                  { label: "Mimo zápis", value: "no" },
                ],
              },
              ...(canEdit
                ? [
                    {
                      columnId: "status",
                      label: "Stav",
                      options: [
                        { label: "Aktivní", value: "active" },
                        { label: "Archivované", value: "archived" },
                      ],
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </div>
  );
}
