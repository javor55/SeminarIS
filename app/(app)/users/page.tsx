"use client";

import * as React from "react"; // Potřeba pro useState
import { getAllUsers } from "@/lib/data";
import { DataTable } from "@/components/common/data-table";
import { usersColumns, UserRow } from "@/components/users/users-columns";
import { updateUserRole, toggleUserActive } from "@/lib/mock-db"; // Import funkcí z mock-db

// Importy pro UI komponenty v popoveru
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

    // Hromadně nastaví roli všem vyfiltrovaným uživatelům
    const handleBulkSetRole = () => {
      if (!selectedRole) return;
      
      filteredRows.forEach((user) => {
        // Voláme funkci z mock-db
        updateUserRole(user.id, selectedRole);
      });
      forceRefresh(); // Obnoví tabulku, aby se změny projevily
    };

    // Hromadně nastaví stav (aktivní / neaktivní)
    const handleBulkSetActive = (setActive: boolean) => {
      filteredRows.forEach((user) => {
        // Zkontrolujeme aktuální stav (dle logiky z users-columns.tsx)
        const currentState = user.isActive !== false;
        
        // Zavoláme toggle jen pokud je potřeba změna
        if (currentState !== setActive) {
          toggleUserActive(user.id);
        }
      });
      forceRefresh(); // Obnoví tabulku
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
                {/* Role odpovídají těm v users-columns.tsx */}
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