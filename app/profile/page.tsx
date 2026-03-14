"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { changeOwnPassword } from "@/lib/data";

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error("Nová hesla se neshodují.");
    }
    if (newPassword.length < 6) {
      return toast.error("Nové heslo musí mít aspoň 6 znaků.");
    }

    setIsChanging(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success("Heslo bylo úspěšně změněno.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Chyba při změně hesla.");
    } finally {
      setIsChanging(false);
    }
  }

  if (isLoading || !user) return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="h-9 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-72 bg-muted animate-pulse rounded mt-2" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
        </div>
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          <div className="h-10 w-full bg-muted animate-pulse rounded" />
          <div className="h-10 w-full bg-muted animate-pulse rounded" />
          <div className="h-10 w-full bg-muted animate-pulse rounded" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-outfit">Můj profil</h1>
        <p className="text-muted-foreground mt-1">
          Správa osobních údajů a zabezpečení účtu.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* INFO KARTA */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <UserIcon className="w-6 h-6 text-slate-600" />
            </div>
            <CardTitle>{user.firstName} {user.lastName}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Role:</div>
                <div className="font-medium text-slate-800">{user.role}</div>
                <div className="text-muted-foreground">Ročník:</div>
                <div className="font-medium text-slate-800">{user.cohort ?? "—"}</div>
                <div className="text-muted-foreground">ID systému:</div>
                <div className="font-mono text-[10px] text-slate-400 truncate">{user.id}</div>
            </div>
          </CardContent>
          <CardFooter className="pt-0">
             <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Účet je aktivní
             </div>
          </CardFooter>
        </Card>

        {/* ZMĚNA HESLA */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-500" />
              Změna hesla
            </CardTitle>
            <CardDescription>
              Pro změnu hesla je nutné zadat současné heslo.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordChange}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Současné heslo</Label>
                <Input 
                  id="current" 
                  type="password" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required 
                />
              </div>
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="new">Nové heslo</Label>
                <Input 
                  id="new" 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required 
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Potvrzení nového hesla</Label>
                <Input 
                  id="confirm" 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required 
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isChanging}>
                {isChanging ? "Měním heslo..." : "Aktualizovat heslo"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
