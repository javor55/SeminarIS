// app/page.tsx
"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PublicHomePage() {
  const { user } = useAuth();
  const router = useRouter();

  // 🔥 Tento efekt automaticky přesměruje přihlášené uživatele
  // z veřejné domovské stránky rovnou na jejich dashboard.
  useEffect(() => {
    if (user) {
      router.replace("/dashboard"); // Přesměrujeme na dashboard
    }
  }, [user, router]);

  // Pokud se `user` stále načítá, nebo pokud je přihlášen
  // (a čeká na přesměrování), zobrazíme prázdnou stránku.
  if (user) {
    return null; // Nebo <LoadingSpinner />
  }

  // 🔥 Toto uvidí pouze nepřihlášení uživatelé
  return (
    <div className="container mx-auto max-w-3xl text-center py-20">
      <h1 className="text-4xl font-bold mb-4">Zápis seminářů pro 4. ročníky</h1>
      <div className="flex justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/login">Přihlásit se</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/register">Vytvořit účet</Link>
        </Button>
      </div>
      <div className="mt-12 text-sm text-muted-foreground">
        <p>
          Po přihlášení zde naleznete přehled všech předmětů k zapsání.
        </p>
      </div>
    </div>
  );
}