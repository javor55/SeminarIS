"use client";

import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import { plural } from "@/lib/plural";
import type { WindowProgress } from "@/modules/seminars/window-progress";

/** Událost, kterou panel posílá záložkám detailu okna (přepnout na „Nezapsaní“, kde je celý seznam, export a připomínka). */
export const OPEN_TAB_EVENT = "enrollment-open-tab";

const SHOWN = 8;

/**
 * Průběh zápisu (F13): souhrn hotovo / rozpracováno / nezačali / plné semináře a seznam „Chybí dokončit“.
 * Jen přehled – akce (připomínka, export, zápis studenta) zůstávají v záložce Nezapsaní a u výskytů.
 */
export function EnrollmentProgressPanel({ progress: p }: { progress: WindowProgress }) {
  const pct = p.audience === 0 ? 100 : Math.round((p.done / p.audience) * 100);
  const shown = p.missing.slice(0, SHOWN);
  const rest = p.missing.length - shown.length;
  const openUnenrolled = () => window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: "unenrolled" }));

  return (
    <section className="space-y-4" data-testid="window-progress" aria-label="Průběh zápisu">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid="progress-done">
          <dt className="text-sm text-muted-foreground">Hotovo (všechny povinné bloky)</dt>
          <dd className="text-2xl font-bold">{p.done} / {p.audience}</dd>
          <Meter className="mt-2" value={p.done} max={p.audience} tone="success" label={`Hotovo ${pct} %`} />
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid="progress-in-progress">
          <dt className="text-sm text-muted-foreground">Rozpracováno</dt>
          <dd className="text-2xl font-bold">{p.inProgress}</dd>
          <dd className="text-sm text-muted-foreground">mají zapsáno jen část</dd>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid="progress-not-started">
          <dt className="text-sm text-muted-foreground">Nezačali</dt>
          <dd className={p.notStarted > 0 ? "text-2xl font-bold text-warning" : "text-2xl font-bold"}>{p.notStarted}</dd>
          <dd className="text-sm text-muted-foreground">
            {p.notStartedByClass.length > 0 ? p.notStartedByClass.map((c) => `${c.label}: ${c.count}`).join(" · ") : "nikdo"}
          </dd>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid="progress-full">
          <dt className="text-sm text-muted-foreground">Plné semináře</dt>
          <dd className="text-2xl font-bold">{p.fullOccurrences} z {p.limitedOccurrences}</dd>
          <dd className="text-sm text-muted-foreground">volno ještě {p.freeSeats} {plural(p.freeSeats, "místo", "místa", "míst")}</dd>
        </div>
      </dl>

      <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid="missing-list">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Chybí dokončit</h2>
          <span className="text-sm text-muted-foreground">{p.missing.length} {plural(p.missing.length, "student", "studenti", "studentů")}</span>
        </div>
        {p.missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Všichni studenti z publika mají zapsáno vše potřebné v povinných blocích.</p>
        ) : (
          <>
            <ul className="divide-y">
              {shown.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-sm" data-testid="missing-row">
                  <span className="font-medium">
                    {s.name}
                    {s.classLabel && <span className="font-normal text-muted-foreground"> · {s.classLabel}</span>}
                  </span>
                  <span className={s.started ? "text-xs font-semibold text-warning" : "text-xs font-semibold text-danger"}>{s.what}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {rest > 0 && <span className="text-sm text-muted-foreground">+ {rest} {plural(rest, "další", "další", "dalších")}</span>}
              <Button type="button" variant="outline" size="sm" onClick={openUnenrolled} data-testid="missing-open-tab">
                Celý seznam, export a připomínka e-mailem
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
