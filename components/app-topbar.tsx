"use client";

import Link from "next/link";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

// 🔥 ZMĚNA: Všechny 'href: "/dashboard"' jsou nyní 'href: "/"'
const linksByRole: Record<string, Array<{ label: string; href: string }>> = {
  ADMIN: [
    { label: "Dashboard", href: "/" },
    { label: "Zápisy", href: "/enrollments" },
    { label: "Předměty", href: "/subjects" },
    { label: "Uživatelé", href: "/users" },
    { label: "Nastavení", href: "/settings" },
  ],
  TEACHER: [
    { label: "Dashboard", href: "/" },
    { label: "Zápisy", href: "/enrollments" },
    { label: "Předměty", href: "/subjects" },
  ],
  STUDENT: [{ label: "Dashboard", href: "/" }],
  GUEST: [],
};

export function AppTopbar({ user }: { user?: User }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const role = user?.role ?? "GUEST";
  const links = linksByRole[role] ?? [];

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* 🔥 ZMĚNA: Odkaz na logo nyní směřuje na "/" */}
          <Link href="/" className="font-semibold">
            Zápis seminářů
          </Link>
          <nav className="flex gap-2">
            {links.map((link) => {
              // 🔥 ZMĚNA: Logika pro aktivní odkaz
              // Musíme zajistit, aby se "/" zvýraznil jen při PŘESNÉ shodě,
              // zatímco ostatní odkazy se zvýrazní, pokud cesta ZAČÍNÁ s jejich href.
              const isActive =
                link.href === "/"
                  ? pathname === "/" // Přesná shoda pro root
                  : pathname.startsWith(link.href); // 'startsWith' pro všechny ostatní

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm px-3 py-1 rounded-md hover:bg-slate-100",
                    isActive && "bg-slate-100 font-medium" // Použije novou 'isActive' logiku
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-sm text-slate-700">{user.email}</span>
              <button
                onClick={logout}
                className="text-sm px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200"
              >
                Odhlásit
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm px-3 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800"
            >
              Přihlásit
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}