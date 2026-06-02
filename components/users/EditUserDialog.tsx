"use client";

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
import { updateUserProfile } from "@/lib/data";
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
  const [cohort, setCohort] = useState(user.cohort ?? "");
  const [error, setError] = useState<string | null>(null);

  // Reset hodnot při otevření dialogu
  useEffect(() => {
    if (open) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setEmail(user.email ?? "");
      setCohort(user.cohort ?? "");
      setError(null);
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
      await updateUserProfile(user.id, {
        firstName,
        lastName,
        email,
        cohort: cohort || null,
      });
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
              <Label htmlFor="edit-cohort">Ročník</Label>
              <Input
                id="edit-cohort"
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
                placeholder="např. 2024/2025"
              />
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
