"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetUserPassword } from "@/lib/data";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

interface ResetPasswordDialogProps {
  userId: string;
  userName: string;
}

export function ResetPasswordDialog({ userId, userName }: ResetPasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    try {
      await resetUserPassword(userId, password);
      toast.success(`Heslo pro uživatele ${userName} bylo změněno.`);
      setOpen(false);
      setPassword("");
    } catch (e: any) {
      toast.error("Chyba při změně hesla: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Reset hesla">
          <KeyRound className="w-4 h-4 text-orange-600" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleReset}>
          <DialogHeader>
            <DialogTitle>Resetovat heslo</DialogTitle>
            <DialogDescription>
              Zadejte nové heslo pro uživatele <strong>{userName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Nové heslo
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="col-span-3"
                required
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={loading || !password}>
              {loading ? "Ukládání..." : "Změnit heslo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
