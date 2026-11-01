"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * Sdílený vzor „tabulka na počítači, karty na mobilu“. `ResponsiveView` vykreslí jen jednu
 * z variant podle šířky okna (`useIsMobile`), ne obě skryté CSS, aby v DOMu nebyla
 * duplicitní tlačítka (E2E selektory, čtečky obrazovky).
 */
export function ResponsiveView({ desktop, mobile }: { desktop: React.ReactNode; mobile: React.ReactNode }) {
  return <>{useIsMobile() ? mobile : desktop}</>;
}

/** Karty pod sebou (mobil). */
export function MobileCardList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-3", className)} {...props} />;
}

/**
 * Karta jednoho záznamu. `title` je hlavní řádek, `badge` stav vpravo od něj, `children`
 * podrobnosti (`MobileCardField`, čipy), `actions` tlačítka přes celou šířku (min. 44 px).
 * Další atributy (`data-session`, `data-testid`…) jdou na kořen karty.
 */
export function MobileCard({
  title,
  badge,
  actions,
  children,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  title: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm", className)} {...props}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 break-words font-medium">{title}</div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {children}
      {actions && <MobileCardActions>{actions}</MobileCardActions>}
    </div>
  );
}

/** Popisek a hodnota na jednom řádku. */
export function MobileCardField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{children}</span>
    </div>
  );
}

/** Akce pod sebou, každé tlačítko přes celou šířku a vysoké alespoň 44 px. */
export function MobileCardActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 [&>span]:block [&_button]:min-h-11 [&_button]:w-full [&_a]:min-h-11 [&_a]:w-full",
        className
      )}
      {...props}
    />
  );
}
