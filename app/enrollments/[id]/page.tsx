"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { getEnrollmentWindowByIdWithBlocks } from "@/lib/data"; // <-- Načítá podle ID
import { EnrollmentView } from "@/components/enrollment/EnrollmentView"; // <-- Naše nová komponenta

// Přijímá 'params' z URL
export default function EnrollmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = useAuth();

  // 1. Načtení dat pomocí ID
  const ew = getEnrollmentWindowByIdWithBlocks(params.id);

  if (!user) return null; // Čekání na přihlášení

  // 2. Ošetření, pokud zápis neexistuje
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

  // 3. Renderování naší znovupoužitelné komponenty
  return <EnrollmentView enrollmentWindow={ew} currentUser={user} />;
}