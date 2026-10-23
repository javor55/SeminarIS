// app/page.tsx
"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";

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
    <div className="mx-auto max-w-3xl text-center py-20">
      <h1 className="text-4xl font-bold mb-2">{APP_NAME}</h1>
      <p className="text-muted-foreground mb-8">{APP_DESCRIPTION}</p>
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
          Po přihlášení uvidíte své zápisy, termíny a další agendu.
        </p>
      </div>
    </div>
  );
}