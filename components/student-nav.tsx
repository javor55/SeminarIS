"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LogOut, PencilLine, User as UserIcon, Library, GraduationCap } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import { can } from "@/modules/registry";
import type { StudentNav } from "@/modules/core/student-nav";
import type { StudentTab } from "@/modules/server-types";

// Zjednodušená navigace studenta (F12): jen záložky, které pro něj mají obsah (počítá server), a menu účtu
// pod kolečkem s iniciálami. Na počítači jsou záložky v horní liště, na telefonu ve spodní liště.

const ICONS = { book: BookOpen, pencil: PencilLine } as const;

/** Záložka je aktivní na své stránce i na jejích podstránkách (`/zapisy/abc` patří záložce `/zapisy`). */
function isActive(tab: StudentTab, pathname: string) {
  const section = "/" + tab.href.split("/")[1];
  return pathname === section || pathname.startsWith(section + "/");
}

/** Tečka u záložky: student tu má něco dokončit. */
function Dot() {
  return <span className="h-2 w-2 rounded-full bg-warning" role="img" aria-label="Je potřeba dokončit" data-testid="tab-attention" />;
}

/** Horní lišta: název, záložky (jen když jsou aspoň dvě) a menu účtu. */
export function StudentTopbar({ nav }: { nav: StudentNav }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const role = "STUDENT" as const;
  const mine = can(role, "core.subjects.mine");
  const profile = can(role, "core.profile");
  const subjects = can(role, "core.subjects.view");

  return (
    <div className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 md:h-16">
        <Link href="/" className="font-semibold md:text-lg">
          {APP_NAME}
        </Link>

        {nav.tabs.length >= 2 && (
          <nav aria-label="Hlavní navigace" className="hidden flex-1 items-center justify-center gap-1 md:flex" data-testid="student-tabs">
            {nav.tabs.map((tab) => {
              const active = isActive(tab, pathname);
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  data-tab={tab.id}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {tab.label}
                  {tab.attention && <Dot />}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Můj účet"
                data-testid="account-menu"
                className="flex h-11 w-11 items-center justify-center rounded-full border bg-muted text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:w-10"
              >
                {nav.initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="font-medium">{nav.name}</div>
                <div className="truncate text-xs text-muted-foreground">{nav.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profile && (
                <DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2">
                  <Link href="/profile">
                    <UserIcon className="h-4 w-4" /> Můj profil
                  </Link>
                </DropdownMenuItem>
              )}
              {mine && (
                <DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2">
                  <Link href="/subjects/mine">
                    <GraduationCap className="h-4 w-4" /> Moje předměty
                  </Link>
                </DropdownMenuItem>
              )}
              {subjects && (
                <DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2">
                  <Link href="/subjects">
                    <Library className="h-4 w-4" /> Katalog předmětů
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="min-h-11 cursor-pointer gap-2" data-testid="logout">
                <LogOut className="h-4 w-4" /> Odhlásit se
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

/** Spodní lišta telefonu: dvě záložky vysoké 64 px (min. 44 px dotyková plocha), tečka = něco je potřeba dokončit. */
export function StudentBottomNav({ nav }: { nav: StudentNav }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hlavní navigace"
      data-testid="student-bottom-nav"
      className="print:hidden fixed inset-x-0 bottom-0 z-40 grid h-16 border-t bg-background md:hidden"
      style={{ gridTemplateColumns: `repeat(${nav.tabs.length}, minmax(0, 1fr))` }}
    >
      {nav.tabs.map((tab) => {
        const active = isActive(tab, pathname);
        const Icon = ICONS[tab.icon];
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-tab={tab.id}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-semibold",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {tab.attention && (
                <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-warning" role="img" aria-label="Je potřeba dokončit" data-testid="tab-attention" />
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
