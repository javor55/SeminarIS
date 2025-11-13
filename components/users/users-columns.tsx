"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { updateUserRole, toggleUserActive } from "@/lib/mock-db";
import * as React from "react";

export type UserRow = User & { createdAt?: string; lastLoginAt?: string };

export const usersColumns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "firstName",
    header: "Jméno",
    cell: ({ row }) => {
      const u = row.original;
      return <span>{u.firstName} {u.lastName}</span>;
    },
  },
  { accessorKey: "email", header: "E-mail" },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const u = row.original;
      const [, bump] = React.useState(0);
      return (
        <Select
          defaultValue={u.role}
          onValueChange={(v) => { updateUserRole(u.id, v); bump((x) => x + 1); }}
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
    },
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "isActive",
    header: "Aktivní",
    cell: ({ row }) => {
      const u = row.original;
      const checked = u.isActive !== false;
      const [, bump] = React.useState(0);
      return (
        <Switch
          checked={checked}
          onCheckedChange={() => { toggleUserActive(u.id); bump((x) => x + 1); }}
        />
      );
    },
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      const active = row.getValue(id) !== false;
      return value.includes(active ? "active" : "inactive");
    },
  },
  {
    accessorKey: "createdAt",
    header: "Vytvořen",
    cell: ({ row }) => row.original.createdAt ? new Date(row.original.createdAt).toLocaleString() : "—",
  },
  {
    accessorKey: "lastLoginAt",
    header: "Poslední přihlášení",
    cell: ({ row }) => row.original.lastLoginAt ? new Date(row.original.lastLoginAt).toLocaleString() : "—",
  },
];
