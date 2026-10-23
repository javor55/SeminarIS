"use client";

import { unwrap, unwrapAsync } from "@/lib/action-result";
import * as React from "react";
import { updateUserRole, toggleUserActive, setUsersClass, deleteUserPermanently } from "@/modules/core/actions/users";
import { getClassOptions, type ClassOption } from "@/modules/core/actions/school";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { usersColumns, UserRow } from "@/modules/core/components/users/users-columns";
import { ImportUsersDialog } from "@/modules/core/components/users/ImportUsersDialog";
import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "@/lib/types";

const NO_CLASS = "__none";

export function UsersClientView({
  users,
  currentUser,
}: {
  users: UserRow[];
  currentUser: User;
}) {
  const router = useRouter();
  const [showImport, setShowImport] = React.useState(false);
  // Removed unused loading state

  const handleExport = () => {
    const headers = ["Jméno", "Příjmení", "Email", "Třída", "Stav studia", "Registrace", "Poslední přihlášení", "Aktivní", "Role", "Zápisy"];
    const rows = users.map(u => {
      const enrollments = u.studentEnrollments
        ?.map((e: { subjectOccurrence?: { subject?: { name: string } } }) => e.subjectOccurrence?.subject?.name)
        .filter(Boolean)
        .join(", ") || "";

      return [
        u.firstName,
        u.lastName,
        u.email,
        u.classLabel ?? "",
        u.studyLabel ?? "",
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

  const classFilterOptions = [
    ...Array.from(new Set(users.map(u => u.classLabel).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b), "cs"))
      .map(c => ({ label: String(c), value: String(c) })),
    { label: "Bez třídy", value: NO_CLASS },
  ];

  // Studenti, kteří právě studují (ne absolventi / ukončení)
  const studying = users.filter(u => u.role === "STUDENT" && u.isActive !== false && !u.studyLabel);

  function BulkActionsPanel({ filteredRows, forceRefresh }: { filteredRows: UserRow[], forceRefresh: () => void }) {
    const router = useRouter(); // Moved router here
    const [selectedRole, setSelectedRole] = React.useState<string | null>(null);
    const [selectedClass, setSelectedClass] = React.useState<string>("");
    const [classOptions, setClassOptions] = React.useState<ClassOption[]>([]);
    React.useEffect(() => {
      getClassOptions().then(setClassOptions).catch(() => setClassOptions([]));
    }, []);
    const [loading, setLoading] = React.useState(false); // New loading state for bulk actions

    const handleBulkSetRole = async () => {
      if (!selectedRole) return;
      setLoading(true);
      try {
        await Promise.all(filteredRows.map(u => unwrapAsync(updateUserRole(u.id, selectedRole))));
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

    const handleBulkSetClass = async () => {
      if (!selectedClass) return;
      setLoading(true);
      try {
        unwrap(await setUsersClass(filteredRows.map(u => u.id), selectedClass === NO_CLASS ? null : selectedClass));
        toast.success(`Třída byla změněna pro ${filteredRows.length} uživatelů.`);
        router.refresh();
        forceRefresh();
      } catch (e: unknown) {
        const error = e as Error;
        toast.error("Chyba při hromadné změně třídy: " + error.message);
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
            if (currentState !== setActive) unwrap(await toggleUserActive(u.id));
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

    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = React.useState(false);

    const usersToDelete = filteredRows.filter(
      (u) => u.id !== currentUser.id && u.email !== currentUser.email
    );

    const handleBulkDelete = async () => {
      setLoading(true);
      let deleted = 0;
      let errors = 0;
      try {
        for (const u of usersToDelete) {
          try {
            unwrap(await deleteUserPermanently(u.id));
            deleted++;
          } catch {
            errors++;
          }
        }
        if (deleted > 0) toast.success(`Trvale smazáno ${deleted} uživatelů.`);
        if (errors > 0) toast.error(`${errors} uživatelů se nepodařilo smazat.`);
        router.refresh();
        forceRefresh();
      } finally {
        setLoading(false);
        setShowBulkDeleteConfirm(false);
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
            <Label className="text-xs">Přeřadit do třídy</Label>
            <div className="flex gap-2">
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Třída..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLASS}>Bez třídy</SelectItem>
                  {classOptions.filter(c => c.status !== "graduated").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 shadow-none" onClick={handleBulkSetClass} disabled={!selectedClass || loading}>OK</Button>
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

        <Separator />

        <div className="space-y-2">
          <Label className="text-xs text-destructive">Nebezpečná zóna</Label>
          <Button
            size="sm"
            variant="destructive"
            className="w-full h-8"
            disabled={loading || usersToDelete.length === 0}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            Trvale smazat ({usersToDelete.length})
          </Button>
        </div>

        <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Trvale smazat {usersToDelete.length} uživatelů?</AlertDialogTitle>
              <AlertDialogDescription>
                Opravdu chcete <strong>trvale a nevratně smazat</strong> {usersToDelete.length} vybraných uživatelů?<br />
                Všechny jejich zápisy budou odstraněny. Tato akce je nevratná.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={loading}
                onClick={handleBulkDelete}
              >
                {loading ? "Mažu..." : `Smazat ${usersToDelete.length} uživatelů`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Správa uživatelů</h1>
          <p className="text-sm text-muted-foreground">Správa rolí, tříd, stavu studia a zápisů.</p>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-md">Statistiky a přehled</CardTitle>
        </CardHeader>
        <CardContent>
           <div className="flex gap-8 text-center items-center h-full pt-2 overflow-x-auto no-scrollbar">
              <div className="flex-shrink-0">
                <p className="text-2xl font-bold">{studying.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Studujících</p>
              </div>
              <div className="border-l pl-8 flex-shrink-0">
                <p className="text-2xl font-bold text-amber-600">{studying.filter(u => !u.classLabel).length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Bez třídy</p>
              </div>
              <div className="border-l pl-8 flex-shrink-0">
                <p className="text-2xl font-bold text-orange-600">
                  {users.filter(u => u.role === "GUEST" && u.isActive !== false).length}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Čeká na schválení</p>
              </div>
              <div className="border-l pl-8 flex-shrink-0">
                <p className="text-2xl font-bold text-emerald-600">
                  {studying.filter(u => (u.studentEnrollments?.length ?? 0) > 0).length}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Se zápisem</p>
              </div>
              <div className="border-l pl-8 flex-shrink-0">
                <p className="text-2xl font-bold text-rose-600">
                  {studying.filter(u => (u.studentEnrollments?.length ?? 0) === 0).length}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 text-balance">Bez zápisu</p>
              </div>
           </div>
        </CardContent>
      </Card>

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
              columnId: "classLabel",
              label: "Třída",
              options: classFilterOptions,
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
