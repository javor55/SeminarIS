"use client";

import Link from "next/link";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <header className="border-b bg-background">
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
                    "text-sm px-3 py-1 rounded-md hover:bg-accent",
                    isActive && "bg-accent font-medium"
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
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <button
                onClick={logout}
                className="text-sm px-3 py-1 rounded-md bg-muted hover:bg-accent"
              >
                Odhlásit
              </button>
              <ThemeToggle />
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Přihlásit
            </Link>
          )}
        </div>

        {/* 🔥 MOBILNÍ Menu: Viditelné jen na mobilu (md:hidden) */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
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
                          isActive && "font-medium bg-accent"
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