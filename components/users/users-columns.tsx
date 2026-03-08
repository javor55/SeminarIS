"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updateUserRole, toggleUserActive } from "@/lib/data";
import * as React from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "./ConfirmAction";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { UserDetailsDialog } from "./UserDetailsDialog";
import { Eye } from "lucide-react";

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
    accessorKey: "createdAt",
    header: "Registrace",
    cell: ({ row }) => {
      const val = row.original.createdAt;
      if (!val) return "—";
      return new Date(val).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    },
  },
  {
    accessorKey: "lastLoginAt",
    header: "Poslední přihlášení",
    cell: ({ row }) => {
      const val = row.original.lastLoginAt;
      if (!val) return "—";
      return new Date(val).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    },
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
    cell: ({ row, table }) => {
      const u = row.original;
      const { user: currentUser } = useAuth();
      const [loading, setLoading] = React.useState(false);
      // Maximální pojistka: kontrola přes ID i Email (case-insensitive)
      const isSelf = (currentUser?.id === u.id) || 
                     (currentUser?.email?.toLowerCase() === u.email?.toLowerCase());
      const meta = table.options.meta as any;

      const handleRoleChange = async (v: string) => {
        setLoading(true);
        try {
          await updateUserRole(u.id, v); 
          toast.success(`Role uživatele ${u.firstName} ${u.lastName} byla změněna na ${v}.`);
          meta?.forceRefresh?.();
        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <ConfirmAction
          title="Změnit roli?"
          description={`Opravdu chcete změnit roli uživatele ${u.firstName} ${u.lastName}?`}
          onConfirm={() => handleRoleChange(u.role)} // Note: We need a way to pass the new value to ConfirmAction or handle it inside Select
          trigger={
            /* We can't easily put ConfirmAction inside Select's onValueChange because Select is uncontrolled in this cell. 
               Alternatively, we can use the ConfirmAction to WRAP the Select, but that triggers on click. 
               Best approach: Use ConfirmAction to wrap the Select, but only trigger if a value is selected? 
               Actually, a better way for Select is to handle it via a controlled state or a custom trigger.
            */
            <Select
              defaultValue={u.role}
              disabled={loading || isSelf}
              onValueChange={async (v) => {
                // Opraveno: Předáváme nově zvolenou hodnotu 'v' místo 'u.role'
                if (window.confirm(`Opravdu chcete změnit roli uživatele ${u.firstName} ${u.lastName} na ${v}?`)) {
                   handleRoleChange(v);
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
          }
        />
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
    cell: ({ row, table }) => {
      const u = row.original;
      const { user: currentUser } = useAuth();
      const checked = u.isActive !== false;
      const [loading, setLoading] = React.useState(false);
      const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
      const meta = table.options.meta as any;

      const handleToggleActive = async () => {
        setLoading(true);
        try {
          await toggleUserActive(u.id); 
          toast.success(`Uživatel ${u.firstName} ${u.lastName} byl ${!checked ? "aktivován" : "deaktivován"}.`);
          meta?.forceRefresh?.();
        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <ConfirmAction
          title={checked ? "Deaktivovat uživatele?" : "Aktivovat uživatele?"}
          description={`Opravdu chcete ${checked ? "deaktivovat" : "aktivovat"} uživatele ${u.firstName} ${u.lastName}?`}
          onConfirm={handleToggleActive}
          trigger={
            <div className="flex items-center">
              <Switch
                checked={checked}
                disabled={loading || isSelf}
                className={cn(
                  "border border-slate-300 shadow-inner",
                  "data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200",
                  isSelf && "opacity-40 grayscale-[0.5]"
                )}
              />
              {isSelf && <span className="ml-2 text-[10px] text-muted-foreground italic">(Vy)</span>}
            </div>
          }
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
      const [showDetails, setShowDetails] = React.useState(false);
      
      return (
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0" 
            onClick={() => setShowDetails(true)}
          >
            <Eye className="w-4 h-4 text-emerald-600" />
          </Button>
          
          <UserDetailsDialog 
            user={u} 
            open={showDetails} 
            onOpenChange={setShowDetails} 
          />
          
          <ResetPasswordDialog userId={u.id} userName={`${u.firstName} ${u.lastName}`} />
        </div>
      );
    }
  }
];
