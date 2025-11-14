// app/layout.tsx
"use client"; // 🔥 Musíme z toho udělat klienta, abychom mohli použít 'usePathname'

import "./globals.css";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { AppTopbar } from "@/components/app-topbar";
import { usePathname } from "next/navigation"; // 🔥 Importujeme 'usePathname'

/**
 * 🔥 Vytvoříme vnitřní layout, který má přístup k 'useAuth'
 * a rozhodne, zda zobrazit Topbar.
 */
function AppContent({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Seznam stránek, které NEPOUŽÍVAJÍ hlavní layout (AppTopbar)
  // Např. veřejná / a přihlašovací stránky
  const isPublicPage = pathname === "/" || pathname === "/login" || pathname === "/register";

  // Pokud je uživatel přihlášen A NENÍ na veřejné stránce,
  // zobrazíme layout s horní lištou.
  if (user && !isPublicPage) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <AppTopbar user={user} />
        <main className="flex-1 container mx-auto py-6">{children}</main>
      </div>
    );
  }

  // Pro veřejné stránky (nebo když se uživatel načítá)
  // zobrazíme jen obsah (např. 'app/page.tsx' nebo 'app/login/page.tsx')
  return <>{children}</>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // Metadata musíme přesunout ven, protože soubor je nyní "use client"
  // Můžete je vložit do 'app/page.tsx' nebo nechat Next.js, aby je odvodil.

  return (
    <html lang="cs">
      <body className="min-h-screen">
        <AuthProvider>
          <AppContent>{children}</AppContent>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </body>
    </html>
  );
}