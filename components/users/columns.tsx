"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User } from "@/lib/types";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { updateUserRole, toggleUserActive } from "@/lib/data";
import { useState } from "react";

export type UserRow = User & {
  createdAt?: string;
  lastLoginAt?: string;
};

// Vytvoříme samostatné komponenty pro buňky s hooky
function RoleCell({ user }: { user: UserRow }) {
  const [role, setRole] = useState(user.role);
  
  return (
    <Select
      value={role}
      onValueChange={async (value) => {
        await updateUserRole(user.id, value);
        setRole(value as User["role"]);
      }}
    >
      <SelectTrigger className="w-[130px] h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ADMIN">ADMIN</SelectItem>
        <SelectItem value="TEACHER">TEACHER</SelectItem>
        <SelectItem value="STUDENT">STUDENT</SelectItem>
        <SelectItem value="GUEST">GUEST</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ActiveCell({ user }: { user: UserRow }) {
  const [active, setActive] = useState(user.isActive !== false);
  
  return (
    <Switch
      checked={active}
      onCheckedChange={async () => {
        await toggleUserActive(user.id);
        setActive(!active);
      }}
    />
  );
}

export const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "firstName",
    header: "Jméno",
    cell: ({ row }) => {
      const u = row.original;
      return (
        <span>
          {u.firstName} {u.lastName}
        </span>
      );
    },
  },
  {
    accessorKey: "email",
    header: "E-mail",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <RoleCell user={row.original} />,
    // umožní faceted filter podle role
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "isActive",
    header: "Aktivní",
    cell: ({ row }) => <ActiveCell user={row.original} />,
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      const active = row.getValue(id) !== false;
      return value.includes(active ? "active" : "inactive");
    },
  },
  {
    accessorKey: "createdAt",
    header: "Vytvořen",
    cell: ({ row }) => {
      const v = row.original.createdAt;
      return v ? new Date(v).toLocaleString() : "—";
    },
  },
  {
    accessorKey: "lastLoginAt",
    header: "Poslední přihlášení",
    cell: ({ row }) => {
      const v = row.original.lastLoginAt;
      return v ? new Date(v).toLocaleString() : "—";
    },
  },
];
