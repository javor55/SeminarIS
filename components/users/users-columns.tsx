"use client";

import { ColumnDef, Row, Table } from "@tanstack/react-table";
import { User } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updateUserRole, toggleUserActive } from "@/lib/data";
import * as React from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { cn, computeEnrollmentStatus } from "@/lib/utils";
import { ConfirmAction } from "./ConfirmAction";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { UserDetailsDialog } from "./UserDetailsDialog";

export type UserRow = User & { 
  createdAt?: string; 
  lastLoginAt?: string;
  studentEnrollments?: Array<{
    id: string;
    createdAt: Date | string;
    deletedAt?: Date | string | null;
    subjectOccurrence: {
      id: string;
      subCode?: string | null;
      subject: { name: string; code?: string | null };
      block: { id: string; name: string; enrollmentWindow: { id: string; name: string; status: string; startsAt: string | Date; endsAt: string | Date } };
    };
  }>;
};

// Pomocný typ pro meta v tabulce
interface TableMeta {
  forceRefresh?: () => void;
}

const RoleCell = ({ row, table }: { row: Row<UserRow>, table: Table<UserRow> }) => {
  const u = row.original;
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const isAdmin = currentUser?.role === "ADMIN";
  const isSelf = (currentUser?.id === u.id) || 
                 (currentUser?.email?.toLowerCase() === u.email?.toLowerCase());
  const canEdit = isAdmin && !isSelf;
  const meta = table.options.meta as TableMeta | undefined;

  const handleRoleChange = async (v: string) => {
    setLoading(true);
    try {
      await updateUserRole(u.id, v); 
      toast.success(`Role uživatele ${u.firstName} ${u.lastName} byla změněna na ${v}.`);
      meta?.forceRefresh?.();
    } catch (e: unknown) {
      const error = e as Error;
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmAction
      title="Změnit roli?"
      description={`Opravdu chcete změnit roli uživatele ${u.firstName} ${u.lastName}?`}
      onConfirm={() => {}} 
      trigger={
        <Select
          defaultValue={u.role}
          disabled={loading || !canEdit}
          onValueChange={async (v) => {
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
};

const ActiveCell = ({ row, table }: { row: Row<UserRow>, table: Table<UserRow> }) => {
  const u = row.original;
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
  const checked = u.isActive !== false;
  const [loading, setLoading] = React.useState(false);
  const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
  const canEdit = isAdmin && !isSelf;
  const meta = table.options.meta as TableMeta | undefined;

  const handleToggleActive = async () => {
    setLoading(true);
    try {
      await toggleUserActive(u.id); 
      toast.success(`Uživatel ${u.firstName} ${u.lastName} byl ${!checked ? "aktivován" : "deaktivován"}.`);
      meta?.forceRefresh?.();
    } catch (e: unknown) {
      const error = e as Error;
      toast.error(error.message);
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
            disabled={loading || !canEdit}
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
};

const ActionsCell = ({ row }: { row: Row<UserRow> }) => {
  const u = row.original;
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
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
      
      {isAdmin && (
        <ResetPasswordDialog userId={u.id} userName={`${u.firstName} ${u.lastName}`} />
      )}
    </div>
  );
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
      const enrollments = row.original.studentEnrollments?.filter(e => !e.deletedAt) ?? [];
      if (enrollments.length === 0) {
        return <span className="text-[10px] text-muted-foreground italic">Nikdy nezapsán</span>;
      }
      
      const windowStats = new Map<string, { name: string, startsAt: string, count: number }>();
      
      for (const enr of enrollments) {
        const ew = enr.subjectOccurrence?.block?.enrollmentWindow;
        if (!ew) continue;
        
        if (!windowStats.has(ew.id)) {
          windowStats.set(ew.id, { name: ew.name, startsAt: ew.startsAt.toString(), count: 0 });
        }
        windowStats.get(ew.id)!.count++;
      }

      const latest = Array.from(windowStats.values()).sort((a, b) => 
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      )[0];

      if (!latest) {
        return <span className="text-[10px] text-muted-foreground italic">Nikdy nezapsán</span>;
      }

      const getSubjectCountLabel = (count: number) => {
        if (count === 1) return "předmět";
        if (count >= 2 && count <= 4) return "předměty";
        return "předmětů";
      };
      
      return (
        <span className="text-xs text-muted-foreground leading-tight">
          Zapsán na <strong>{latest.count}</strong> {getSubjectCountLabel(latest.count)} v{" "}
          <span className="text-blue-600 font-medium">{latest.name}</span>
        </span>
      );
    },
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      const enrollments = row.original.studentEnrollments?.filter(e => !e.deletedAt) ?? [];
      
      let currentIs: "none" | "active" | "scheduled" | "history" = "none";
      if (enrollments.length > 0) {
        currentIs = "history";
        for (const enr of enrollments) {
          const ew = enr.subjectOccurrence?.block?.enrollmentWindow;
          if (!ew) continue;
          const statusMeta = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
          if (statusMeta.is === "open") {
            currentIs = "active";
            break;
          }
          if (statusMeta.is === "planned") {
            currentIs = "scheduled";
          }
        }
      }

      return value.includes(currentIs);
    },
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: RoleCell,
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "isActive",
    header: "Aktivní",
    cell: ActiveCell,
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      const active = row.getValue(id) !== false;
      return value.includes(active ? "active" : "inactive");
    },
  },
  {
    id: "actions",
    header: "Akce",
    cell: ActionsCell,
  }
];
