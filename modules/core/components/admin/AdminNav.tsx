"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { AdminSectionGroup } from "@/modules/types";

export type AdminNavItem = { label: string; href: string; match?: readonly string[]; group?: AdminSectionGroup };

// Nadpisy skupin v menu (Přehled nahoře je bez nadpisu)
const GROUP_LABELS: Record<AdminSectionGroup, string | null> = { overview: null, school: "Škola", modules: "Moduly", ops: "Provoz" };

function isActive(pathname: string, item: AdminNavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => (p === "/admin" ? pathname === p : pathname === p || pathname.startsWith(p + "/")));
}

/** Položky menu seskupené podle `group`; skupiny bez položky se nevykreslí (položky už přicházejí seřazené). */
function grouped(items: AdminNavItem[]) {
  const result: { group: AdminSectionGroup; label: string | null; items: AdminNavItem[] }[] = [];
  for (const i of items) {
    const group = i.group ?? "modules";
    const last = result[result.length - 1];
    if (last && last.group === group) last.items.push(i);
    else result.push({ group, label: GROUP_LABELS[group], items: [i] });
  }
  return result;
}

/** Boční menu administrace ve skupinách Škola / Moduly / Provoz; na mobilu se změní na výběr nad obsahem. */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = items.find((i) => isActive(pathname, i)) ?? items[0];
  const groups = grouped(items);

  return (
    <>
      <div className="md:hidden">
        <NativeSelect aria-label="Sekce administrace" data-testid="admin-nav-select" value={active?.href} onChange={(e) => router.push(e.target.value)}>
          {groups.map((g) =>
            g.label ? (
              <optgroup key={g.group} label={g.label}>
                {g.items.map((i) => (
                  <option key={i.href} value={i.href}>{i.label}</option>
                ))}
              </optgroup>
            ) : (
              g.items.map((i) => (
                <option key={i.href} value={i.href}>{i.label}</option>
              ))
            )
          )}
        </NativeSelect>
      </div>
      <nav aria-label="Sekce administrace" data-testid="admin-nav" className="hidden md:flex md:w-56 md:shrink-0 flex-col gap-1">
        {groups.map((g) => (
          <div key={g.group} className="flex flex-col gap-1" data-nav-group={g.group}>
            {g.label && <span className="px-3 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground" data-testid="admin-nav-group">{g.label}</span>}
            {g.items.map((i) => (
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
          </div>
        ))}
      </nav>
    </>
  );
}
