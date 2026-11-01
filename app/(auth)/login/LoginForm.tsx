"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { signIn } from "next-auth/react";

// Chyby, se kterými NextAuth / náš signIn callback vrací na /login?error=…
const ERROR_MESSAGES: Record<string, string> = {
  MicrosoftNotRegistered: "Váš školní účet zatím v systému není. Obraťte se na administrátora.",
  MicrosoftDisabled: "Přihlášení přes Microsoft 365 je momentálně vypnuté.",
  MicrosoftNoEmail: "Microsoft nevrátil e-mailovou adresu účtu. Obraťte se na administrátora.",
  AccountDisabled: "Tento účet byl deaktivován.",
  OAuthCallback: "Přihlášení přes Microsoft se nepodařilo dokončit. Zkuste to znovu.",
  OAuthSignin: "Přihlášení přes Microsoft se nepodařilo zahájit. Zkuste to znovu.",
  AccessDenied: "Přístup byl odepřen.",
};

type LoginFormProps = {
  // Zobrazit tlačítko „Přihlásit přes Microsoft 365“
  microsoftEnabled: boolean;
  // Heslo jen pro některé role (když je M365 zapnuté) – jen informační text
  passwordNote?: string | null;
  errorCode?: string | null;
};

export function LoginForm({ microsoftEnabled, passwordNote, errorCode }: LoginFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorCode ? ERROR_MESSAGES[errorCode] ?? "Přihlášení se nezdařilo." : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message ?? "Nepodařilo se přihlásit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Přihlášení</h1>
          <p className="text-sm text-muted-foreground">
            {microsoftEnabled
              ? "Přihlaste se školním účtem Microsoft 365, nebo e-mailem a heslem."
              : "Zadejte svůj e-mail a heslo pro přihlášení."}
          </p>
        </div>

        {microsoftEnabled && (
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              data-testid="microsoft-login"
              onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
            >
              {/* Logo Microsoftu (4 čtverce) */}
              <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Přihlásit přes Microsoft 365
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              nebo heslem
              <div className="h-px flex-1 bg-border" />
            </div>
            {passwordNote && <p className="text-xs text-muted-foreground">{passwordNote}</p>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="např. student@example.com"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">Heslo</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Přihlašuji..." : "Přihlásit se"}
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-2">
            Nemáte ještě účet?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Vytvořit účet
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}