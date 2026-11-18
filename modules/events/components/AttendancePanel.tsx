"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Meter } from "@/components/ui/meter";
import { unwrap } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { setAttendance } from "@/modules/events/actions/organizer";
import { matchesQuery, type RegRow } from "@/modules/events/organizer-core";
import { placesOf } from "@/modules/events/public-state";

const collator = new Intl.Collator("cs");
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Režim „Prezence“ v detailu termínu: velké řádky (vhodné pro telefon u vchodu) se zaškrtnutím „Přišel/a“. Zaškrtnutí se ukládá
 * hned (a jde odškrtnout). Zobrazují se jen registrace, které drží místo (zrušené a čekající ne), seřazené podle jména.
 */
export function AttendancePanel({ eventId, rows, itemId, query, readOnly }: { eventId: string; rows: RegRow[]; itemId: string; query: string; readOnly: boolean }) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const holding = useMemo(
    () =>
      rows
        .filter((r) => (r.status === "CONFIRMED" || r.status === "PENDING") && r.items.some((i) => i.id === itemId))
        .sort((a, b) => collator.compare(a.name ?? a.email, b.name ?? b.email) || a.code.localeCompare(b.code)),
    [rows, itemId]
  );
  const attendedAt = (r: RegRow) => (r.id in marks ? marks[r.id] : r.attendedAt);
  const came = holding.filter((r) => attendedAt(r));
  const people = (xs: RegRow[]) => xs.reduce((s, r) => s + placesOf(r.guests), 0);
  const shown = holding.filter((r) => matchesQuery(r, query) && (!onlyMissing || !attendedAt(r)));

  async function toggle(r: RegRow) {
    if (readOnly || busy) return;
    const next = !attendedAt(r);
    setBusy(r.id);
    setMarks((m) => ({ ...m, [r.id]: next ? new Date().toISOString() : null }));
    try {
      const out = unwrap(await setAttendance(eventId, r.id, next));
      setMarks((m) => ({ ...m, [r.id]: out.attendedAt }));
      router.refresh();
    } catch (err) {
      setMarks((m) => {
        const { [r.id]: _drop, ...rest } = m;
        return rest;
      });
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3" data-testid="attendance-panel">
      <div className="space-y-2 rounded-xl border bg-card p-4" data-testid="attend-summary">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-lg font-semibold">
            Přišlo <span data-testid="attend-came">{came.length}</span> z <span data-testid="attend-total">{holding.length}</span>
          </div>
          <div className="text-sm text-muted-foreground">osob <span data-testid="attend-people">{people(came)}</span> z {people(holding)}</div>
        </div>
        <Meter value={came.length} max={Math.max(1, holding.length)} label={`Přišlo ${came.length} z ${holding.length} registrací`} />
        <Checkbox data-testid="attend-only-missing" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} label="Jen kdo ještě nepřišel" labelClassName="min-h-11" />
      </div>

      {holding.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="attend-empty">Na tomto termínu zatím nikdo není registrovaný.</div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="attend-none">Nikdo neodpovídá hledání.</div>
      ) : (
        <ul className="space-y-2" data-testid="attend-list">
          {shown.map((r) => {
            const on = !!attendedAt(r);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={readOnly || busy === r.id}
                  onClick={() => void toggle(r)}
                  data-testid="attend-row"
                  data-code={r.code}
                  data-attended={on ? "true" : "false"}
                  className={cn(
                    "flex min-h-[4.5rem] w-full items-center gap-4 rounded-xl border-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                    on ? "border-success bg-success/10" : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <span aria-hidden className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2", on ? "border-success bg-success text-success-foreground" : "border-muted-foreground/40 bg-background")}>
                    {on && <Check className="h-6 w-6" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-lg font-semibold leading-tight">{r.name ?? r.email}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      <span className="font-mono">{r.code}</span>
                      {r.guests > 0 && <span>{placesOf(r.guests)} osoby</span>}
                      {str(r.answers.phone) && <span>{str(r.answers.phone)}</span>}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-sm font-medium", on ? "text-success" : "text-muted-foreground")}>{on ? "Přišel/a" : "Chybí"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
