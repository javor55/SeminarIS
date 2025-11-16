// components/app-shell.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { AppTopbar } from "@/components/app-topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  const isPublicPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register";

  const content =
    user && !isPublicPage ? (
      <div className="min-h-screen flex flex-col bg-background">
        <AppTopbar user={user} />
        <main className="flex-1 container mx-auto py-6">{children}</main>
      </div>
    ) : (
      <>{children}</>
    );

  return (
    <>
      {content}
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
