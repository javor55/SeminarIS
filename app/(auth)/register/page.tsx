"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";
import { AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");

  const [classGroupId, setClassGroupId] = React.useState("");
  // Výběr třídy při registraci nastavuje admin (vypnuto / volitelný / povinný)
  const [classMode, setClassMode] = React.useState<"off" | "optional" | "required">("off");
  const [classes, setClasses] = React.useState<{ id: string; label: string }[]>([]);

  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/auth/register")
      .then((res) => res.json())
      .then((data) => {
        setClassMode(data.classMode ?? "off");
        setClasses(data.classes ?? []);
      })
      .catch(() => {});
  }, []);
  
  // Efekt pro přesměrování již přihlášených uživatelů
  React.useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. Zavoláme registrační API
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName, classGroupId: classGroupId || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registrace selhala.");
      }
      
      // 2. Automatické přihlášení
      const loginRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        // Pokud přihlášení selže, musíme aspoň informovat, že účet už existuje
        throw new Error("Účet byl vytvořen, ale nepodařilo se automatické přihlášení. Zkuste se prosím přihlásit ručně.");
      }

      // 3. Přesměrujeme na dashboard a vynutíme refresh session
      router.replace("/dashboard");
      router.refresh();

    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Registrace selhala. Zkuste to prosím znovu.");
      setIsLoading(false);
    }
  };
  
  if (user) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Vytvořit nový účet</CardTitle>
          <CardDescription>
            Zadejte své údaje pro registraci do systému.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Jméno</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Příjmení</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="vase@adresa.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            {classMode !== "off" && classes.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="classGroupId">Třída{classMode === "required" ? "" : " (nepovinné)"}</Label>
                <NativeSelect
                  id="classGroupId"
                  value={classGroupId}
                  onChange={(e) => setClassGroupId(e.target.value)}
                  required={classMode === "required"}
                >
                  <option value="">— vyberte třídu —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </NativeSelect>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Přihlašuji..." : "Vytvořit účet"}
            </Button>
          </form>
        </CardContent>
        
        <CardFooter className="text-sm text-muted-foreground justify-center">
          <p>
            Máte již účet?{" "}
            <Link
              href="/login"
              className="text-primary hover:underline font-medium"
            >
              Přihlaste se
            </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}