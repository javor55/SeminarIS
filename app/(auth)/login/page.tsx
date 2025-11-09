"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const { login, mockUsers } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email);
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
            Zadejte svůj e-mail nebo klikněte na jednu z testovacích rolí.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="email">
              E-mail
            </label>
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
                    await login(u.email);
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
