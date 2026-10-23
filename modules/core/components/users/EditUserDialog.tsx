"use client";

import { unwrap } from "@/lib/action-result";
import * as React from "react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserProfile } from "@/modules/core/actions/users";
import { getClassOptions, type ClassOption } from "@/modules/core/actions/school";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_CLASS = "__none";
import { toast } from "sonner";
import { UserRow } from "./users-columns";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

interface EditUserDialogProps {
  user: UserRow;
  onSuccess?: () => void;
}

export function EditUserDialog({ user, onSuccess }: EditUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [classGroupId, setClassGroupId] = useState(user.classGroupId ?? NO_CLASS);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset hodnot při otevření dialogu
  useEffect(() => {
    if (open) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setEmail(user.email ?? "");
      setClassGroupId(user.classGroupId ?? NO_CLASS);
      setError(null);
      getClassOptions()
        .then(setClassOptions)
        .catch(() => setClassOptions([]));
    }
  }, [open, user]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Jméno, příjmení a e-mail jsou povinné.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      unwrap(await updateUserProfile(user.id, {
        firstName,
        lastName,
        email,
        classGroupId: classGroupId === NO_CLASS ? null : classGroupId,
      }));
      toast.success(`Profil uživatele ${firstName} ${lastName} byl uložen.`);
      setOpen(false);
      router.refresh();
      onSuccess?.();
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || "Nepodařilo se uložit změny.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title="Upravit profil uživatele"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upravit uživatele</DialogTitle>
            <DialogDescription>
              Změny se okamžitě projeví. E-mail musí být unikátní v systému.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-firstName">Jméno</Label>
                <Input
                  id="edit-firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jan"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lastName">Příjmení</Label>
                <Input
                  id="edit-lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Novák"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan.novak@skola.cz"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-class">Třída</Label>
              <Select value={classGroupId} onValueChange={setClassGroupId}>
                <SelectTrigger id="edit-class">
                  <SelectValue placeholder="Bez třídy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLASS}>Bez třídy</SelectItem>
                  {classOptions
                    .filter((c) => c.status !== "graduated" || c.id === user.classGroupId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Ukládám..." : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
