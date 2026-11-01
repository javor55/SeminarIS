import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Kompaktní dlaždice s číslem a popiskem (přehledy předmětů, uživatelů…). S `href` je to odkaz
 * (např. na filtrovaný seznam), jinak jen zobrazení. `tone` obarví číslo (např. `text-success`).
 */
export function StatTile({ label, value, href, tone, className }: { label: ReactNode; value: ReactNode; href?: string; tone?: string; className?: string }) {
  const cls = cn("block rounded-xl border bg-card p-3 shadow-sm", href && "hover:bg-accent/50", className);
  const body = (
    <>
      <p className={cn("text-2xl font-bold leading-none", tone)}>{value}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
