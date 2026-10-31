"use client";

import { unwrap } from "@/lib/action-result";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { changeOwnPassword, getMyPreferences, setReceiveOptionalEmails } from "@/modules/core/actions/profile";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  // Nepovinná e-mailová upozornění (připomínky, souhrny); null = ještě se načítá
  const [optionalEmails, setOptionalEmails] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyPreferences()
      .then((p) => setOptionalEmails(p.receiveOptionalEmails))
      .catch(() => undefined);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeOptionalEmails(value: boolean) {
    try {
      unwrap(await setReceiveOptionalEmails(value));
      setOptionalEmails(value);
      toast.success(value ? "Nepovinná upozornění zapnuta." : "Nepovinná upozornění vypnuta.");
    } catch (err) {
      toast.error((err as Error).message || "Nastavení se nepodařilo uložit.");
    }
  }

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
      unwrap(await changeOwnPassword(currentPassword, newPassword));
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
    <div className="space-y-6">
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
    <div className="space-y-6">
      <PageHeader title="Můj profil" description="Správa osobních údajů a zabezpečení účtu." />

      <div className="grid gap-6 md:grid-cols-2">
        {/* INFO KARTA */}
        <Card className="shadow-sm border-border">
          <CardHeader>
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                <UserIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>{user.firstName} {user.lastName}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Role:</div>
                <div className="font-medium text-foreground">{user.role}</div>
                <div className="text-muted-foreground">ID systému:</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">{user.id}</div>
            </div>
          </CardContent>
          <CardFooter className="pt-0">
             <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 px-2.5 py-1 rounded-full font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Účet je aktivní
             </div>
          </CardFooter>
        </Card>

        {/* ZMĚNA HESLA */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-info" />
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

      {/* E-MAILOVÁ UPOZORNĚNÍ */}
      <Card className="shadow-sm" data-testid="notification-prefs">
        <CardHeader>
          <CardTitle>E-mailová upozornění</CardTitle>
          <CardDescription>
            Důležité zprávy (zrušení nebo změna termínu, schválení účtu) chodí vždy. Připomínky a denní souhrny si můžete vypnout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="optional-emails">Dostávat nepovinná upozornění</Label>
            <Switch
              id="optional-emails"
              checked={optionalEmails ?? true}
              disabled={optionalEmails === null}
              onCheckedChange={changeOptionalEmails}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
