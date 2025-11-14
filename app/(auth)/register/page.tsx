"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
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
import { AlertCircle, CheckCircle } from "lucide-react"; // Přidána ikona pro úspěch

export default function RegisterPage() {
  const router = useRouter();
  // 🔥 Odstraněna 'register' z 'useAuth'
  const { user } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  
  // 🔥 Přidán stav pro zobrazení úspěchu
  const [isSuccess, setIsSuccess] = React.useState(false);

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
      // 🔥 Simulace mock registrace
      // Zde byste v reálné aplikaci volali např. API
      // await register({ email, password, firstName, lastName });
      
      // Pro účely mocku jen zalogujeme data a počkáme 1s
      console.log("Mock registrace:", { email, firstName, lastName });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Místo přesměrování zobrazíme úspěch
      setIsSuccess(true);

    } catch (err: any) {
      setError(err.message || "Registrace selhala. Zkuste to prosím znovu.");
    } finally {
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
          
          {/* 🔥 Zobrazení zprávy o úspěchu */}
          {isSuccess ? (
            <Alert variant="default" className="border-green-500 text-green-700">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                Registrace proběhla úspěšně. Nyní se můžete{" "}
                <Link href="/login" className="font-bold hover:underline">
                  přihlásit
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : (
            
            /* 🔥 Formulář se zobrazí, jen pokud 'isSuccess' je false */
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
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Vytváří se účet..." : "Vytvořit účet"}
              </Button>
            </form>
          )}
        </CardContent>
        
        {/* 🔥 Patička se zobrazí jen pokud *neběží* úspěch */}
        {!isSuccess && (
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
        )}
      </Card>
    </div>
  );
}