"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updateUserRole, toggleUserActive } from "@/lib/data";
import * as React from "react";

export type UserRow = User & { 
  createdAt?: string; 
  lastLoginAt?: string;
  studentEnrollments?: any[]; // Přidáno pro zobrazení stavu zápisů
};

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
    accessorKey: "cohort",
    header: "Ročník",
    cell: ({ row }) => row.original.cohort || "—",
  },
  {
    id: "enrollmentStatus",
    header: "Zápisy",
    cell: ({ row }) => {
      const enrollments = row.original.studentEnrollments || [];
      if (enrollments.length === 0) return <span className="text-xs text-muted-foreground">Bez zápisů</span>;
      
      const hasActive = enrollments.some(e => e.subjectOccurrence?.block?.enrollmentWindow?.status === "OPEN");
      const hasUpcoming = enrollments.some(e => e.subjectOccurrence?.block?.enrollmentWindow?.status === "SCHEDULED");
      
      return (
        <div className="flex gap-1 flex-wrap">
          {hasActive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
              Aktivní
            </span>
          )}
          {hasUpcoming && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              Naplánovaný
            </span>
          )}
          {!hasActive && !hasUpcoming && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
              Historický
            </span>
          )}
        </div>
      );
    },
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      const enrollments = row.original.studentEnrollments || [];
      
      const hasActive = enrollments.some(e => e.subjectOccurrence?.block?.enrollmentWindow?.status === "OPEN");
      const hasUpcoming = enrollments.some(e => e.subjectOccurrence?.block?.enrollmentWindow?.status === "SCHEDULED");
      const hasAny = enrollments.length > 0;

      return value.some((v: string) => {
        if (v === "none") return !hasAny;
        if (v === "active") return hasActive;
        if (v === "scheduled") return hasUpcoming;
        if (v === "history") return hasAny && !hasActive && !hasUpcoming;
        return false;
      });
    },
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const u = row.original;
      const [loading, setLoading] = React.useState(false);
      return (
        <Select
          defaultValue={u.role}
          disabled={loading}
          onValueChange={async (v) => { 
            setLoading(true);
            try {
              await updateUserRole(u.id, v); 
            } finally {
              setLoading(false);
            }
          }}
        >
          <SelectTrigger className="w-[110px] h-8">
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
      const [loading, setLoading] = React.useState(false);
      return (
        <Switch
          checked={checked}
          disabled={loading}
          onCheckedChange={async () => { 
            setLoading(true);
            try {
              await toggleUserActive(u.id); 
            } finally {
              setLoading(false);
            }
          }}
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
    id: "actions",
    header: "Akce",
    cell: ({ row }) => {
      const u = row.original;
      return (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => {
            const newPass = window.prompt(`Zadejte nové heslo pro uživatele ${u.firstName} ${u.lastName}:`);
            if (newPass) {
              import("@/lib/data").then(m => m.resetUserPassword(u.id, newPass))
                .then(() => alert("Heslo bylo úspěšně změněno."))
                .catch(e => alert("Chyba při změně hesla: " + e.message));
            }
          }}
        >
          Reset hesla
        </Button>
      );
    }
  }
];
