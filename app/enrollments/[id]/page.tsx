// app/enrollments/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getEnrollmentWindowByIdWithBlocks } from "@/lib/data";
import { EnrollmentView } from "@/components/enrollment/EnrollmentView";

export default function EnrollmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // ZMĚNA 1: Načítáme 'user' a 'isLoading'
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [ew, setEw] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // --- Začátek úpravy "Auth Guard" ---

  // ZMĚNA 2: "Auth Guard" (Hlídač přihlášení)
  // Reaguje na 'isLoading', aby se zabránilo chybnému přesměrování
  useEffect(() => {
    // Přesměrujeme, POUZE POKUD:
    // 1. Načítání skončilo (isLoading === false)
    // 2. A ZÁROVEŇ uživatel neexistuje (user === null)
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]); // Sledujeme obě proměnné

  useEffect(() => {
    async function load() {
       setEw(await getEnrollmentWindowByIdWithBlocks(params.id));
       setLoading(false);
    }
    load();
  }, [params.id]);

  // ZMĚNA 3: "Loading Guard"
  // Zobrazí "nic" (null), dokud probíhá ověření NEBO pokud není uživatel
  if (isLoading || !user) {
    return null; // Čekáme na načtení nebo přesměrování
  }

  // ZMĚNA 4: "Authorization Guard" (Hlídač oprávnění)
  // V tomto bodě víme, že 'user' je přihlášen.
  // Povolíme přístup jen ADMINovi a TEACHERovi
  const isAllowed = user.role === "ADMIN" || user.role === "TEACHER";

  if (!isAllowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }

  // --- Konec úpravy ---

  if (loading) return <p className="mt-8 text-center text-muted-foreground">Načítám záznamy...</p>;

  if (!ew) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Zápis nenalezen</h1>
        <p className="text-muted-foreground">
          Hledané zápisové období neexistuje nebo k němu nemáte přístup.
        </p>
      </div>
    );
  }

  // 'user' je zde již 100% přihlášen a má oprávnění
  return <EnrollmentView enrollmentWindow={ew} currentUser={user} />;
}