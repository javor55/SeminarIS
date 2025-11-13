"use client";

import { useAuth } from "@/components/auth/auth-provider";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const { user } = useAuth();

  // 💥 Tohle zabrání pádu při buildu i za běhu
  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Nastavení</h1>
        <p className="text-sm text-muted-foreground">
          Pro zobrazení nastavení se prosím přihlaste.
        </p>
      </div>
    );
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nastavení</h1>
      <p className="text-sm text-muted-foreground">
        Přihlášený uživatel: {user.firstName} {user.lastName} ({user.email}) – role {user.role}
      </p>

      {isAdmin ? (
        <p className="text-sm">Tady můžeš mít admin nastavení…</p>
      ) : (
        <p className="text-sm">Tady můžeš mít uživatelské nastavení…</p>
      )}
    </div>
  );
}
