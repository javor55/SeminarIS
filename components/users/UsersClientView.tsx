"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { 
  updateUserRole, 
  toggleUserActive, 
  setGlobalCohort,
  updateUsersCohort
} from "@/lib/data";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { usersColumns, UserRow } from "@/components/users/users-columns";
import { ImportUsersDialog } from "@/components/users/ImportUsersDialog";
import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "@/lib/types";

export function UsersClientView({
  users,
  globalCohortInitial,
  currentUser,
}: {
  users: UserRow[];
  globalCohortInitial: string;
  currentUser: User;
}) {
  const router = useRouter();
  const [globalCohort, setGlobalCohortState] = React.useState(globalCohortInitial);
  const [showImport, setShowImport] = React.useState(false);
  // Removed unused loading state

  const handleExport = () => {
    const headers = ["Jméno", "Příjmení", "Email", "Registrace", "Poslední přihlášení", "Aktivní", "Role", "Zápisy"];
    const rows = users.map(u => {
      const enrollments = u.studentEnrollments
        ?.map((e: { subjectOccurrence?: { subject?: { name: string } } }) => e.subjectOccurrence?.subject?.name)
        .filter(Boolean)
        .join(", ") || "";

      return [
        u.firstName,
        u.lastName,
        u.email,
        u.createdAt ? new Date(u.createdAt).toLocaleString("cs-CZ") : "",
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("cs-CZ") : "nikdy",
        u.isActive ? "ANO" : "NE",
        u.role,
        `"${enrollments}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `export_uzivatelu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export dokončen.");
  };

  const handleUpdateGlobalCohort = async () => {
    try {
      await setGlobalCohort(globalCohort);
      toast.success("Výchozí ročník byl uložen.");
      router.refresh();
    } catch (e: unknown) {
      const error = e as Error;
      toast.error("Chyba při ukládání: " + error.message);
    }
  };

  const roleFilterOptions = [
    { label: "Admin", value: "ADMIN" },
    { label: "Učitel", value: "TEACHER" },
    { label: "Student", value: "STUDENT" },
    { label: "Host", value: "GUEST" },
  ];

  const activeFilterOptions = [
    { label: "Aktivní", value: "active" },
    { label: "Neaktivní", value: "inactive" },
  ];

  const cohortOptions = Array.from(new Set(users.map(u => u.cohort).filter(Boolean)))
    .sort()
    .map(c => ({ label: String(c), value: String(c) }));

  function BulkActionsPanel({ filteredRows, forceRefresh }: { filteredRows: UserRow[], forceRefresh: () => void }) {
    const router = useRouter(); // Moved router here
    const [selectedRole, setSelectedRole] = React.useState<string | null>(null);
    const [selectedCohort, setSelectedCohort] = React.useState("");
    const [loading, setLoading] = React.useState(false); // New loading state for bulk actions

    const handleBulkSetRole = async () => {
      if (!selectedRole) return;
      setLoading(true);
      try {
        await Promise.all(filteredRows.map(u => updateUserRole(u.id, selectedRole)));
        toast.success(`Role byla změněna pro ${filteredRows.length} uživatelů.`);
        router.refresh();
        forceRefresh();
      } catch (e: unknown) {
        const error = e as Error;
        toast.error("Chyba při hromadné změně role: " + error.message);
      } finally {
        setLoading(false);
      }
    };

    const handleBulkSetCohort = async () => {
      if (!selectedCohort) return;
      setLoading(true);
      try {
        await Promise.all(filteredRows.map(u => updateUsersCohort([u.id], selectedCohort)));
        toast.success(`Ročník byl změněn pro ${filteredRows.length} uživatelů.`);
        router.refresh();
        forceRefresh();
      } catch (e: unknown) {
        const error = e as Error;
        toast.error("Chyba při hromadné změně ročníku: " + error.message);
      } finally {
        setLoading(false);
      }
    };

    const handleBulkSetActive = async (setActive: boolean) => {
      const action = setActive ? "Aktivace" : "Deaktivace";
      setLoading(true);
      try {
        await Promise.all(
          filteredRows.map(async (u) => {
            const currentState = u.isActive !== false;
            const isSelf = u.id === currentUser.id || u.email === currentUser.email;
            if (isSelf && !setActive) return;
            if (currentState !== setActive) await toggleUserActive(u.id);
          })
        );
        toast.success(`Stav byl změněn pro ${filteredRows.length} uživatelů.`);
        router.refresh();
        forceRefresh();
      } catch (e: unknown) {
        const error = e as Error;
        toast.error(`Chyba při hromadné akci (${action}): ` + error.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="space-y-4 p-2 min-w-[200px]">
        <p className="text-sm font-medium text-muted-foreground border-b pb-2">
          Akce pro {filteredRows.length} uživatelů
        </p>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Hromadná změna role</Label>
            <div className="flex gap-2">
              <Select value={selectedRole ?? ""} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Role..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                  <SelectItem value="TEACHER">TEACHER</SelectItem>
                  <SelectItem value="STUDENT">STUDENT</SelectItem>
                  <SelectItem value="GUEST">GUEST</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 shadow-none" onClick={handleBulkSetRole} disabled={!selectedRole || loading}>OK</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Hromadná změna ročníku</Label>
            <div className="flex gap-2">
              <Input
                className="h-8"
                placeholder="2024/25"
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value)}
              />
              <Button size="sm" className="h-8 shadow-none" onClick={handleBulkSetCohort} disabled={!selectedCohort || loading}>OK</Button>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-xs">Změna aktivního stavu</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkSetActive(true)} disabled={loading}>Aktivovat</Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkSetActive(false)} disabled={loading}>Deaktivovat</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Správa uživatelů</h1>
          <p className="text-sm text-muted-foreground">Komplexní správa rolí, ročníků a stavů zápisů.</p>
        </div>

        <div className="flex items-center gap-2">
          {currentUser.role === "ADMIN" && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              Import uživatelů
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" />
            Export do CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {currentUser.role === "ADMIN" && (
          <Card className="md:col-span-1 border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-md">Systémový ročník</CardTitle>
              <CardDescription className="text-xs text-balance">Výchozí hodnota pro nově registrované uživatele.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="cohort"
                  placeholder="např. 2024/2025"
                  value={globalCohort}
                  onChange={(e) => setGlobalCohortState(e.target.value)}
                  className="bg-background"
                />
              </div>
              <Button className="w-full" size="sm" onClick={handleUpdateGlobalCohort}>Aktualizovat globálně</Button>
            </CardContent>
          </Card>
        )}

        <Card className={cn("md:col-span-2", currentUser.role !== "ADMIN" && "md:col-span-3")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-md">Statistiky a přehled</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex gap-8 text-center items-center h-full pt-2 overflow-x-auto no-scrollbar">
                <div className="flex-shrink-0">
                  <p className="text-2xl font-bold">
                    {users.filter(u => u.role === "STUDENT" && u.cohort === globalCohort && u.isActive !== false).length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Studentů v ročníku</p>
                </div>
                <div className="border-l pl-8 flex-shrink-0">
                  <p className="text-2xl font-bold text-orange-600">
                    {users.filter(u => u.role === "GUEST" && u.cohort === globalCohort && u.isActive !== false).length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Čeká na schválení</p>
                </div>
                <div className="border-l pl-8 flex-shrink-0">
                  <p className="text-2xl font-bold text-emerald-600">
                    {users.filter(u => u.role === "STUDENT" && u.cohort === globalCohort && u.isActive !== false && (u.studentEnrollments?.length ?? 0) > 0).length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Zapsaní v ročníku</p>
                </div>
                <div className="border-l pl-8 flex-shrink-0">
                  <p className="text-2xl font-bold text-rose-600">
                    {users.filter(u => u.role === "STUDENT" && u.cohort === globalCohort && u.isActive !== false && (u.studentEnrollments?.length ?? 0) === 0).length}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Nezapsaní v ročníku</p>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>

      <ImportUsersDialog
        open={showImport}
        onOpenChange={setShowImport}
        onSuccess={() => router.refresh()}
      />

      {users.length <= 1 ? (
        <Card className="border-dashed py-12">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Upload className="w-6 h-6 text-slate-400" />
            </div>
            <div className="max-w-[400px]">
              <h3 className="text-lg font-semibold">Zatím žádní další uživatelé</h3>
              <p className="text-sm text-muted-foreground">
                V systému jste zatím jen vy. Chcete-li pokračovat, importujte seznam studentů
                ze souboru CSV nebo nechte studenty, aby se registrovali sami.
              </p>
            </div>
            <Button onClick={() => setShowImport(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              Importovat první studenty
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DataTable<UserRow>
          data={users}
          columns={usersColumns}
          searchPlaceholder="Hledat podle jména nebo e-mailu…"
          searchKeys = {["firstName", "lastName", "email"]}
          selectFilters={[
            {
              columnId: "role",
              label: "Role",
              options: roleFilterOptions,
            },
            {
              columnId: "isActive",
              label: "Stav účtu",
              options: activeFilterOptions,
            },
            {
              columnId: "cohort",
              label: "Ročník",
              options: cohortOptions,
            },
            {
              columnId: "enrollmentStatus",
              label: "Stav zápisů",
              options: [
                { label: "S aktivním zápisem", value: "active" },
                { label: "S naplánovaným zápisem", value: "scheduled" },
                { label: "Pouze historie", value: "history" },
                { label: "Bez zápisů", value: "none" },
              ],
            }
          ]}
          dateFilters={[
            {
              id: "createdAt",
              label: "Datum registrace",
              getDate: (u) => u.createdAt ? new Date(u.createdAt) : null,
            },
            {
              id: "lastLoginAt",
              label: "Poslední přihlášení",
              getDate: (u) => u.lastLoginAt ? new Date(u.lastLoginAt) : null,
            },
          ]}
          forceRefresh={() => router.refresh()}
          bulkPopoverRender={currentUser.role === "ADMIN" ? (args) => <BulkActionsPanel {...args} /> : undefined}
        />
      )}
    </div>
  );
}
