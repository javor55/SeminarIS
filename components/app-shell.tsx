// components/app-shell.tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import { Toaster } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { AppTopbar } from "@/components/app-topbar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { StudentBottomNav, StudentTopbar } from "@/components/student-nav";
import { cn } from "@/lib/utils";
import type { StudentNav } from "@/modules/core/student-nav";

export function AppShell({ children, studentNav }: { children: ReactNode; studentNav: StudentNav | null }) {
  const { user, isLoading } = useAuth();

  // Student má zjednodušenou navigaci (F12). Server ji vypočítal pro přihlášeného studenta; po odhlášení nebo přihlášení
  // jiného uživatele bez znovunačtení layoutu ji klient nepoužije (session už je jiná).
  const student = studentNav && (isLoading || user?.id === studentNav.userId) ? studentNav : null;
  const bottomNav = !!student && student.tabs.length >= 2;

  return (
    <>
      {user?.impersonatedBy && <ImpersonationBanner user={user} />}
      <header className="print:hidden">{student ? <StudentTopbar nav={student} /> : <AppTopbar user={user} />}</header>

      <main
        className={cn("flex-1 container mx-auto py-6", bottomNav && "pb-24 md:pb-6")}
        // spodní lišta studenta: lepivé prvky stránek se zarovnají nad ni
        style={{ "--bottom-nav": bottomNav ? "4rem" : "0px" } as CSSProperties}
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </main>

      {bottomNav && student && <StudentBottomNav nav={student} />}

      {/* případně */}
      <footer />
    </>
  );
}
