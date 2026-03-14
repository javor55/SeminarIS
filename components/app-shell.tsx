// components/app-shell.tsx
"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { AppTopbar } from "@/components/app-topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();


  return (
  <>
    <header>
      <AppTopbar user={user} />
    </header>

    <main className="flex-1 container mx-auto py-6">
      {children}
      <Toaster position="top-right" richColors closeButton />
    </main>

    {/* případně */}
    <footer />
  </>
);
}
