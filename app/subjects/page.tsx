"use client";

// Importy zůstávají stejné
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getAllUsers, getSubjects } from "@/lib/data";
import { DataTable } from "@/components/ui/data-table";
import {
  subjectsColumns,
  SubjectRow,
} from "@/components/subjects/subjects-columns";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SubjectsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setDataLoading(true);
      const [dbSubj, dbUser] = await Promise.all([getSubjects(), getAllUsers()]);
      setSubjects(dbSubj as unknown as SubjectRow[]);
      setUsers(dbUser);
      setDataLoading(false);
    }
    loadData();
  }, [user]);

  // --- Začátek úpravy "Auth Guard" ---

  // ZMĚNA 2: "Auth Guard" (Hlídač přihlášení)
  // Reaguje na 'isLoading', aby se zabránilo chybnému přesměrování
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  if (authLoading || dataLoading || !user) {
    return <p className="text-sm text-muted-foreground">Načítám…</p>;
  }

  // ZMĚNA 4: "Authorization Guard" (Hlídač oprávnění)
  // V tomto bodě víme, že 'user' je přihlášen.
  const isAllowed = user.role === "ADMIN" || user.role === "TEACHER";

  if (!isAllowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }

  // --- Konec úpravy ---

  // Zbytek komponenty se vykoná, jen pokud je 'user' ADMIN nebo TEACHER
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
          <p className="text-sm text-muted-foreground">
            Seznam předmětů a jejich kódů.
          </p>
        </div>

        {/* 🔥 TLAČÍTKO NOVÝ PŘEDMĚT */}
        <Button asChild>
          <Link href="/subjects/new/edit">Nový předmět</Link>
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