"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { unwrap } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/school";
import { toggleUserActive, updateUserRole } from "@/modules/core/actions/users";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import type { UserListRow } from "@/modules/core/users-query";

// Rychlé akce v řádku seznamu uživatelů (role, aktivita). Ostatní se dělají v detailu uživatele.

const ROLES = ["ADMIN", "TEACHER", "STUDENT", "GUEST"] as const;

export function RoleCell({ user: u, canEdit }: { user: UserListRow; canEdit: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [pendingRole, setPendingRole] = React.useState<string | null>(null);

  async function change(role: string) {
    setLoading(true);
    try {
      unwrap(await updateUserRole(u.id, role));
      toast.success(`Role uživatele ${u.firstName} ${u.lastName} byla změněna na ${ROLE_LABELS[role] ?? role}.`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <NativeSelect
        compact
        className="w-[130px]"
        aria-label={`Role – ${u.firstName} ${u.lastName}`}
        data-testid="role-select"
        value={u.role}
        disabled={loading || !canEdit}
        onChange={(e) => setPendingRole(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </NativeSelect>
      <ConfirmAction
        open={!!pendingRole}
        onOpenChange={(o) => !o && setPendingRole(null)}
        title="Změnit roli?"
        description={`Opravdu chcete změnit roli uživatele ${u.firstName} ${u.lastName} na ${pendingRole ? ROLE_LABELS[pendingRole] : ""}?`}
        onConfirm={async () => {
          if (pendingRole) await change(pendingRole);
        }}
      />
    </>
  );
}

export function ActiveCell({ user: u, canEdit, isSelf }: { user: UserListRow; canEdit: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    setLoading(true);
    try {
      unwrap(await toggleUserActive(u.id));
      toast.success(`Uživatel ${u.firstName} ${u.lastName} byl ${u.isActive ? "deaktivován" : "aktivován"}.`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConfirmAction
      title={u.isActive ? "Deaktivovat uživatele?" : "Aktivovat uživatele?"}
      description={`Opravdu chcete ${u.isActive ? "deaktivovat" : "aktivovat"} uživatele ${u.firstName} ${u.lastName}?`}
      onConfirm={toggle}
      trigger={
        <div className="flex items-center">
          <Switch
            checked={u.isActive}
            disabled={loading || !canEdit}
            aria-label={`Aktivní – ${u.firstName} ${u.lastName}`}
            className={cn(
              "border border-slate-300 shadow-inner",
              "data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200",
              isSelf && "opacity-40 grayscale-[0.5]"
            )}
          />
          {isSelf && <span className="ml-2 text-[10px] italic text-muted-foreground">(Vy)</span>}
        </div>
      }
    />
  );
}
