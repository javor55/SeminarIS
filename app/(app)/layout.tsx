"use client";

import { ReactNode } from "react";
import { AppTopbar } from "@/components/app-topbar";
import { useAuth } from "@/components/auth/auth-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppTopbar user={user ?? undefined} />
      <main className="flex-1 container mx-auto py-6">{children}</main>
    </div>
  );
}
