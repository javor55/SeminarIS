"use client";

// Importy pro ověření a přesměrování
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Načtení stavu přihlášení, 'isLoading' a routeru
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // "Auth Guard" (Hlídač přihlášení)
  useEffect(() => {
    // Přesměrujeme, jen pokud načítání skončilo A uživatel není
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  // "Loading Guard"
  // Zobrazí zprávu o načítání, dokud se ověřuje sezení
  if (isLoading || !user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Nastavení</h1>
        <p className="text-sm text-muted-foreground">
          Načítám...
        </p>
      </div>
    );
  }

  // "Authorization Guard" (Hlídač oprávnění)
  // Kontrola, zda je uživatel ADMIN (jak bylo požadováno)
  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }

  // Kód níže se provede POUZE pokud je uživatel ADMIN
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nastavení (Admin)</h1>
      <p className="text-sm text-muted-foreground">
        Přihlášený uživatel: {user.firstName} {user.lastName} ({user.email}) – role {user.role}
      </p> {/* <-- ZDE BYLA CHYBA (bylo </pre>) */}

      <p className="text-sm">Tady můžeš mít admin nastavení…</p>
    </div>
  );
}