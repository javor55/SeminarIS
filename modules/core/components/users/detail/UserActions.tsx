"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { unwrap } from "@/lib/action-result";
import { ROLE_LABELS } from "@/lib/school";
import { deleteUserPermanently, toggleUserActive, updateUserRole } from "@/modules/core/actions/users";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { EditUserDialog } from "@/modules/core/components/users/EditUserDialog";
import { ResetPasswordDialog } from "@/modules/core/components/users/ResetPasswordDialog";
import { StudyStatusDialog } from "@/modules/core/components/users/StudyStatusDialog";
import type { UserListRow } from "@/modules/core/users-query";

const ROLES = ["STUDENT", "TEACHER", "ADMIN", "GUEST"] as const;

/** Akce nad uživatelem v detailu (správce): úprava, heslo, role, aktivita, studium, smazání („Zobrazit jako“ je v hlavičce stránky). */
export function UserActions({ user, isSelf }: { user: UserListRow; isSelf: boolean }) {
  const router = useRouter();
  const name = `${user.firstName} ${user.lastName}`;
  const [pendingRole, setPendingRole] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showDelete, setShowDelete] = React.useState(false);

  async function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      if (after) after();
      else router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Akce se nezdařila.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="user-actions">
      <div className="flex flex-wrap items-center gap-2">
        <EditUserDialog user={user} label="Upravit" />
        <ResetPasswordDialog userId={user.id} userName={name} label="Reset hesla" />
        {user.role === "STUDENT" && <StudyStatusDialog user={user} label />}
        {!isSelf && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-danger hover:text-danger"
            data-testid="user-delete"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="w-4 h-4" /> Trvale smazat
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-1">
          <Label htmlFor="detail-role">Role</Label>
          <NativeSelect
            id="detail-role"
            className="w-[160px]"
            compact
            value={user.role}
            disabled={busy || isSelf}
            title={isSelf ? "Vlastní roli měnit nelze" : undefined}
            onChange={(e) => setPendingRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="detail-active"
            checked={user.isActive}
            disabled={busy || isSelf}
            onCheckedChange={() =>
              run(async () => unwrap(await toggleUserActive(user.id)), `Uživatel ${name} byl ${user.isActive ? "deaktivován" : "aktivován"}.`)
            }
          />
          <Label htmlFor="detail-active">Účet je aktivní{isSelf ? " (vy)" : ""}</Label>
        </div>
      </div>

      <ConfirmAction
        open={!!pendingRole}
        onOpenChange={(o) => !o && setPendingRole(null)}
        title="Změnit roli?"
        description={`Opravdu chcete změnit roli uživatele ${name} na ${pendingRole ? ROLE_LABELS[pendingRole] : ""}?`}
        onConfirm={async () => {
          if (pendingRole) await run(async () => unwrap(await updateUserRole(user.id, pendingRole)), `Role uživatele ${name} byla změněna.`);
        }}
      />

      <ConfirmAction
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Trvale smazat uživatele?"
        description={`Opravdu chcete trvale a nevratně smazat uživatele ${name} (${user.email})? Všechny jeho zápisy budou smazány. Data, která vytvořil (předměty, zápisová okna apod.), zůstanou zachována.`}
        actionLabel="Trvale smazat"
        onConfirm={async () => {
          await run(async () => unwrap(await deleteUserPermanently(user.id)), `Uživatel ${name} byl trvale smazán.`, () => router.push("/users"));
        }}
      />
    </div>
  );
}
