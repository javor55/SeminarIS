"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { getAllUsers } from "@/lib/data";
import { getSubjectsFromMock } from "@/lib/mock-db";
import { DataTable } from "@/components/common/data-table";
import { subjectsColumns, SubjectRow } from "@/components/subjects/subjects-columns";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SubjectsPage() {
  const { user } = useAuth();
  const subjects = getSubjectsFromMock() as SubjectRow[];
  const users = getAllUsers();

  if (!user) {
    return <p className="text-sm text-muted-foreground">Načítám…</p>;
  }

  const userFilterOptions = users.map((u) => ({
    label: `${u.firstName} ${u.lastName}`,
    value: u.id,
  }));

  return (
    <div className="space-y-4">
      {/* HLAVIČKA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Předměty</h1>
          <p className="text-sm text-muted-foreground">Seznam předmětů a jejich kódů.</p>
        </div>

        {/* 🔥 TLAČÍTKO NOVÝ PŘEDMĚT */}
        <Button asChild>
          <Link href="/subjects/new/edit">
            Nový předmět
          </Link>
        </Button>
      </div>

      {/* TABULKA */}
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
    </div>
  );
}
