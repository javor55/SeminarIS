"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { unwrap } from "@/lib/action-result";
import { previewBulk, runBulk } from "@/modules/core/actions/user-bulk";
import type { BulkActionDescriptor, BulkPreviewResult, BulkSelection } from "@/modules/core/bulk-runner-types";

/**
 * Potvrzení hromadné akce: parametry, náhled dopadu ze serveru (kolik uživatelů, koho se týká, co se stane)
 * a potvrzení s počtem. Spuštění ověří na serveru, že se výběr od náhledu nezměnil.
 */
export function BulkActionDialog({
  action,
  selection,
  onClose,
  onDone,
}: {
  action: BulkActionDescriptor | null;
  selection: BulkSelection;
  onClose: () => void;
  onDone: () => void;
}) {
  const [params, setParams] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<BulkPreviewResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  // klíč výběru: když se změní, náhled se načte znovu
  const selectionKey = JSON.stringify(selection);

  // nová akce = čisté parametry
  React.useEffect(() => {
    setParams({});
    setPreview(null);
    setError(null);
  }, [action?.id]);

  React.useEffect(() => {
    if (!action) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await previewBulk(action.id, selection, params);
      if (cancelled) return;
      setLoading(false);
      try {
        setPreview(unwrap(res));
        setError(null);
      } catch (e) {
        setPreview(null);
        setError((e as Error).message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.id, selectionKey, JSON.stringify(params)]);

  if (!action) return null;

  const missing = action.params.some((p) => p.required && !params[p.key]?.trim());
  const canRun = !!preview && !preview.blocked && !missing && !loading && !running;

  async function run() {
    if (!action || !preview) return;
    setRunning(true);
    try {
      const out = unwrap(await runBulk(action.id, selection, params, { selected: preview.selected, eligible: preview.eligible }));
      toast.success(out.summary);
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "Akce se nezdařila.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto" data-testid="bulk-dialog">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.confirm}</DialogDescription>
        </DialogHeader>

        {action.params.length > 0 && (
          <div className="space-y-3">
            {action.params.map((p) => (
              <div key={p.key} className="space-y-1">
                <Label htmlFor={`bulk-${p.key}`}>{p.label}</Label>
                {p.type === "select" ? (
                  <NativeSelect id={`bulk-${p.key}`} value={params[p.key] ?? ""} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}>
                    {(!p.options?.some((o) => o.value === "") || p.required) && <option value="" disabled={!!p.required}>— vyberte —</option>}
                    {p.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </NativeSelect>
                ) : p.type === "textarea" ? (
                  <Textarea id={`bulk-${p.key}`} rows={6} maxLength={p.maxLength} value={params[p.key] ?? ""} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))} />
                ) : (
                  <Input id={`bulk-${p.key}`} maxLength={p.maxLength} placeholder={p.placeholder} value={params[p.key] ?? ""} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid="bulk-preview" aria-live="polite">
          {error && <p className="text-destructive">{error}</p>}
          {!error && !preview && <p className="text-muted-foreground">Načítám náhled…</p>}
          {preview && (
            <>
              <p data-testid="bulk-count">
                Vybráno <strong>{preview.selected}</strong>, akce se týká <strong>{preview.eligible}</strong>.
              </p>
              {preview.lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              {preview.skipped.length > 0 && (
                <p className="text-muted-foreground">
                  Přeskočí se: {preview.skipped.map((s) => `${s.count} (${s.reason})`).join(", ")}.
                </p>
              )}
              {preview.sample.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Např. {preview.sample.join(", ")}
                  {preview.eligible > preview.sample.length ? " …" : ""}
                </p>
              )}
              {preview.blocked && <p className="font-medium text-destructive" data-testid="bulk-blocked">{preview.blocked}</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Zrušit</Button>
          <Button variant={action.danger ? "destructive" : "default"} onClick={run} disabled={!canRun} data-testid="bulk-confirm">
            {running ? "Provádím…" : `Provést${preview ? ` (${preview.eligible})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
