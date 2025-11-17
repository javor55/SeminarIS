"use client";

// ZMĚNA 1: Přidání 'useEffect'
import * as React from "react"; // Potřeba pro useState, useEffect
import { useRouter } from "next/navigation"; // ZMĚNA 2: Import routeru
import { useAuth } from "@/components/auth/auth-provider"; // ZMĚNA 3: Import useAuth

import { getAllUsers } from "@/lib/data";
import { DataTable } from "@/components/ui/data-table";
import { usersColumns, UserRow } from "@/components/users/users-columns";
import { updateUserRole, toggleUserActive } from "@/lib/mock-db";

// ... (všechny ostatní importy UI komponent zůstávají stejné)
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function UsersPage() {
  // ZMĚNA 4: Načtení 'user', 'isLoading' a inicializace 'router'
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // ZMĚNA 5: "Auth Guard" (Hlídač přihlášení)
  React.useEffect(() => {
    // Pokud načítání skončilo A uživatel není přihlášen, přesměruj
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  // ZMĚNA 6: Zobrazení "Načítám..." dokud probíhá ověření
  if (isLoading || !user) {
    // Čekáme, dokud se 'isLoading' nevypne a 'user' nenačte
    return null; // Nebo <p>Načítám...</p>
  }

  // ZMĚNA 7: "Authorization Guard" (Hlídač oprávnění)
  // V tomto bodě víme, že 'user' je přihlášen.
  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }
  
  // --- Konec změn ---
  // Zbytek kódu se vykoná POUZE pokud je uživatel ADMIN

  // 1. Načtení dat
  const users = (getAllUsers() ?? []) as UserRow[];

  // 2. Definice voleb pro filtry
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

  // 3. 🔥 Funkce pro renderování hromadných akcí
  const renderBulkActions = ({
    filteredRows,
    forceRefresh,
  }: {
    filteredRows: UserRow[];
    forceRefresh: () => void;
  }) => {
    const [selectedRole, setSelectedRole] = React.useState<string | null>(null);

    // Hromadně nastaví roli
    const handleBulkSetRole = () => {
      if (!selectedRole) return;
      filteredRows.forEach((user) => {
        updateUserRole(user.id, selectedRole);
      });
      forceRefresh();
    };

    // Hromadně nastaví stav
    const handleBulkSetActive = (setActive: boolean) => {
      filteredRows.forEach((user) => {
        const currentState = user.isActive !== false;
        if (currentState !== setActive) {
          toggleUserActive(user.id);
        }
      });
      forceRefresh();
    };

    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">
          Akce pro {filteredRows.length} vyfiltrovaných uživatelů
        </p>

        {/* --- Nastavení role --- */}
        <div className="space-y-2">
          <Label className="text-xs">Nastavit roli</Label>
          <div className="flex gap-2">
            <Select
              value={selectedRole ?? ""}
              onValueChange={setSelectedRole}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Vyberte roli..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="TEACHER">TEACHER</SelectItem>
                <SelectItem value="STUDENT">STUDENT</SelectItem>
                <SelectItem value="GUEST">GUEST</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleBulkSetRole}
              disabled={!selectedRole}
            >
              Nastavit
            </Button>
          </div>
        </div>

        <Separator />

        {/* --- Nastavení stavu --- */}
        <div className="space-y-2">
          <Label className="text-xs">Nastavit stav</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkSetActive(true)}
            >
              Aktivovat
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkSetActive(false)}
            >
              Deaktivovat
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* HLAVIČKA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Uživatelé</h1>
          <p className="text-sm text-muted-foreground">
            Správa uživatelů v systému.
          </p>
        </div>
      </div>

      {/* TABULKA */}
      <DataTable<UserRow>
        data={users}
        columns={usersColumns}
        searchPlaceholder="Hledat podle jména nebo e-mailu…"
        searchKeys={["firstName", "lastName", "email"]}
        selectFilters={[
          {
            columnId: "role",
            label: "Role",
            options: roleFilterOptions,
          },
          {
            columnId: "isActive",
            label: "Stav",
            options: activeFilterOptions,
          },
        ]}
        dateFilters={[
          {
            id: "createdAt",
            label: "Vytvořen",
            getDate: (u) => (u.createdAt ? new Date(u.createdAt) : null),
          },
          {
            id: "lastLoginAt",
            label: "Poslední přihlášení",
            getDate: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt) : null),
          },
        ]}
        
        
        bulkPopoverRender={renderBulkActions}
      />
    </div>
  );
}