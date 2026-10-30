import Link from "next/link";

export type TabLink = { id: string; label: string };

/**
 * Záložky jako odkazy (`?tab=<id>`): aktivní záložka je v URL, takže jde sdílet a funguje bez JS.
 * První záložka je výchozí a v adrese se neuvádí. Používá ji detail uživatele i předmětu.
 */
export function TabLinks({ tabs, activeId, baseHref, testId }: { tabs: TabLink[]; activeId: string; baseHref: string; testId: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b" role="tablist" data-testid={testId}>
      {tabs.map((t, i) => (
        <Link
          key={t.id}
          href={i === 0 ? baseHref : `${baseHref}?tab=${encodeURIComponent(t.id)}`}
          role="tab"
          aria-selected={t.id === activeId}
          data-tab={t.id}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${t.id === activeId ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
