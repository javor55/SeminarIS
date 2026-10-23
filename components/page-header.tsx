import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Jednotná hlavička stránky: volitelný odkaz zpět, nadpis, popis a akce vpravo.
 * Používají ji všechny stránky, aby nadpisy vypadaly a zarovnávaly se stejně.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="space-y-2">
      {back && (
        <Link
          href={back.href}
          className="print:hidden text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
      </div>
    </div>
  );
}
