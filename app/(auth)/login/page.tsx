"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; // 🔥 Přidán import pro Label

export default function LoginPage() {
  const { login, mockUsers } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // 🔥 Přidán stav pro heslo
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // 🔥 Upraveno volání - nyní posílá email i heslo
      await login(email, password);
    } catch (err: any) {
      setError(err.message ?? "Nepodařilo se přihlásit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Přihlášení</h1>
          <p className="text-sm text-muted-foreground">
            Zadejte svůj e-mail a heslo nebo klikněte na jednu z testovacích
            rolí.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {" "}
          {/* Zvýšena mezera pro lepší vzhled */}
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

          {/* 🔥 Nová sekce pro heslo */}
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

          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Přihlašuji..." : "Přihlásit se"}
          </Button>
        </form>

        <div>
          <p className="text-xs text-slate-500 mb-2">Nebo vyber:</p>
          <div className="flex flex-wrap gap-2">
            {(mockUsers ?? []).map((u) => (
              <Button
                key={u.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  setError(null);
                  try {
                    // 🔥 Upraveno volání - posílá email a "falešné" heslo
                    await login(u.email, "mockpass");
                  } catch (err: any) {
                    setError(err.message ?? "Nepodařilo se přihlásit.");
                  }
                }}
              >
                {u.role}: {u.email}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}