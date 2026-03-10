"use client";

// Importy zůstávají stejné
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getUsersForFilters, getSubjects } from "@/lib/data";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      try {
        const [dbSubj, dbUser] = await Promise.all([getSubjects(), getUsersForFilters()]);
        setSubjects(dbSubj as unknown as SubjectRow[]);
        setUsers(dbUser);
      } catch (err) {
        console.error(err);
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, [user]);

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

        {/* 🔥 TLAČÍTKA */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button asChild size="sm">
            <Link href="/subjects/new/edit">Nový předmět</Link>
          </Button>
        </div>
      </div>

      {/* STATISTIKY */}
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
               {subjects.filter(s => s.isActive !== false).length}
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