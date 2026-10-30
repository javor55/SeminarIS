"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export type AdminNavItem = { label: string; href: string; match?: readonly string[] };

function isActive(pathname: string, item: AdminNavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => (p === "/admin" ? pathname === p : pathname === p || pathname.startsWith(p + "/")));
}

/** Boční menu administrace; na mobilu se změní na výběr nad obsahem. */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = items.find((i) => isActive(pathname, i)) ?? items[0];

  return (
    <>
      <div className="md:hidden">
        <NativeSelect aria-label="Sekce administrace" data-testid="admin-nav-select" value={active?.href} onChange={(e) => router.push(e.target.value)}>
          {items.map((i) => (
            <option key={i.href} value={i.href}>{i.label}</option>
          ))}
        </NativeSelect>
      </div>
      <nav aria-label="Sekce administrace" data-testid="admin-nav" className="hidden md:flex md:w-56 md:shrink-0 flex-col gap-1">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active?.href === i.href ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium",
              active?.href === i.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
