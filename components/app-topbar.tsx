"use client";

import Link from "next/link";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

// 🔥 Importy pro responzivní menu
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Definice odkazů (stejná jako ve vašem souboru)
const linksByRole: Record<string, Array<{ label: string; href: string }>> = {
  ADMIN: [
    { label: "Dashboard", href: "/" },
    { label: "Zápisy", href: "/enrollments" },
    { label: "Předměty", href: "/subjects" },
    { label: "Uživatelé", href: "/users" },
    { label: "Administrace", href: "/admin" },
    { label: "Můj Profil", href: "/profile" },
  ],
  TEACHER: [
    { label: "Dashboard", href: "/" },
    { label: "Zápisy", href: "/enrollments" },
    { label: "Předměty", href: "/subjects" },
    { label: "Uživatelé", href: "/users" },
    { label: "Můj Profil", href: "/profile" },
  ],
  STUDENT: [
    { label: "Dashboard", href: "/" },
    { label: "Předměty", href: "/subjects" },
    { label: "Můj Profil", href: "/profile" },
  ],

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
          {/* Logo/Název - Vždy viditelné */}
          <Link href="/" className="font-semibold">
            Zápis seminářů
          </Link>

          {/* 🔥 DESKTOP Navigace: Skrytá na mobilu (hidden), viditelná od 'md' (md:flex) */}
          <nav className="hidden md:flex gap-2">
            {links.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm px-3 py-1 rounded-md hover:bg-slate-100",
                    isActive && "bg-slate-100 font-medium"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* 🔥 DESKTOP User Info: Skryté na mobilu, viditelné od 'md' */}
        <div className="hidden md:flex items-center gap-2">
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

        {/* 🔥 MOBILNÍ Menu: Viditelné jen na mobilu (md:hidden) */}
        <div className="flex md:hidden">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Otevřít menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-normal">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {links.map((link) => {
                  const isActive =
                    link.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(link.href);

                  return (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link
                        href={link.href}
                        className={cn(
                          isActive && "font-medium bg-slate-100"
                        )}
                      >
                        {link.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  Odhlásit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Na mobilu, pokud není přihlášen, zobrazíme jen tlačítko
            <Button asChild size="sm">
              <Link href="/login">Přihlásit</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}