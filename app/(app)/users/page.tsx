"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { getAllUsers } from "@/lib/data";
import { getSubjectsFromMock, createSubject } from "@/lib/mock-db";
import { DataTable } from "@/components/common/data-table";
import { subjectsColumns, SubjectRow } from "@/components/subjects/subjects-columns";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SubjectsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const subjects = getSubjectsFromMock() as SubjectRow[];
  const users = getAllUsers();

  if (!user) return <p>Načítám…</p>;

  const userFilterOptions = users.map((u) => ({
    label: `${u.firstName} ${u.lastName}`,
    value: u.id,
  }));

  function handleCreateSubject() {
    const newSubject = createSubject({
      name: "",
      code: "",
      description: "",
      syllabus: "",
      createdById: user.id,
      updatedById: user.id,
    });

    router.push(`/subjects/${newSubject.id}/edit`);
  }

  return (
    <div className="space-y-4">
      {/* HLAVIČKA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Předměty</h1>
          <p className="text-sm text-muted-foreground">Seznam předmětů.</p>
        </div>

        {/* 🔥 Nový předmět */}
        <Button onClick={handleCreateSubject}>
          Nový předmět
        </Button>
      </div>

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
