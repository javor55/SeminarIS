"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { unwrap, type ActionResult } from "@/lib/action-result";
import type { ImportPreview, ImportResult, ImportRowStatus } from "@/modules/core/imports/types";

export type ImportOption = { key: string; label: string; description?: string; default: boolean };

type Props = {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  /** Rozlišení dialogů v testech a ve stavu (users / assignments / subjects) */
  kind: string;
  title: string;
  description: React.ReactNode;
  sample: { filename: string; content: string };
  options?: ImportOption[];
  // eslint-disable-next-line no-unused-vars
  preview: (content: string, options: Record<string, boolean>) => Promise<ActionResult<ImportPreview>>;
  // eslint-disable-next-line no-unused-vars
  confirm: (content: string, options: Record<string, boolean>) => Promise<ActionResult<ImportResult>>;
  onDone?: () => void;
};

const STATUS_LABEL: Record<ImportRowStatus, string> = { new: "Nový", change: "Změna", unchanged: "Beze změny", error: "Chyba" };
const STATUS_CLASS: Record<ImportRowStatus, string> = {
  new: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  change: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  unchanged: "bg-muted text-muted-foreground",
  error: "bg-red-500/15 text-red-700 dark:text-red-300",
};

/** Společný dialog importů: soubor → náhled (nový / změna / beze změny / chyba) → potvrzení. */
export function ImportDialog({ open, onOpenChange, kind, title, description, sample, options = [], preview, confirm, onDone }: Props) {
  const [content, setContent] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [opts, setOpts] = React.useState<Record<string, boolean>>(() => Object.fromEntries(options.map((o) => [o.key, o.default])));
  const [data, setData] = React.useState<ImportPreview | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const token = React.useRef(0);

  const reset = () => {
    setContent(null);
    setFileName("");
    setData(null);
    setResult(null);
    setError(null);
    setOpts(Object.fromEntries(options.map((o) => [o.key, o.default])));
  };

  const runPreview = React.useCallback(
    async (text: string, o: Record<string, boolean>) => {
      const mine = ++token.current;
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const res = unwrap(await preview(text, o));
        if (mine === token.current) setData(res);
      } catch (e) {
        if (mine === token.current) {
          setData(null);
          setError((e as Error).message || "Náhled se nepodařilo vytvořit.");
        }
      } finally {
        if (mine === token.current) setBusy(false);
      }
    },
    [preview]
  );

  const onFile = async (file: File | null) => {
    setData(null);
    setResult(null);
    setError(null);
    if (!file) {
      setContent(null);
      setFileName("");
      return;
    }
    const text = await file.text();
    setContent(text);
    setFileName(file.name);
    await runPreview(text, opts);
  };

  const toggle = (key: string, value: boolean) => {
    const next = { ...opts, [key]: value };
    setOpts(next);
    if (content) void runPreview(content, next);
  };

  const download = () => {
    const blob = new Blob([sample.content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = sample.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const applicable = data ? data.counts.new + data.counts.change : 0;

  const run = async () => {
    if (!content) return;
    setBusy(true);
    try {
      const res = unwrap(await confirm(content, opts));
      setResult(res);
      setData(null);
      toast.success("Import dokončen");
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message || "Import se nezdařil.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid={`import-dialog-${kind}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
            <span className="font-medium">1. Vzorový soubor</span>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={download} data-testid="import-sample">
              <Download className="w-4 h-4" />
              Stáhnout vzor CSV
            </Button>
            <span className="text-xs text-muted-foreground">Oddělovač ; nebo , a kódování UTF-8 (i z Excelu).</span>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">2. Nahrát soubor</h4>
            <Input id="csv-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          </div>

          {options.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              {options.map((o) => (
                <label key={o.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    data-testid={`import-option-${o.key}`}
                    checked={!!opts[o.key]}
                    onChange={(e) => toggle(o.key, e.target.checked)}
                  />
                  <span>
                    {o.label}
                    {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          {busy && !result && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Zpracovávám…
            </p>
          )}
          {error && (
            <Alert variant="destructive" data-testid="import-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {data?.fileError && (
            <Alert variant="destructive" data-testid="import-error">
              <AlertDescription>{data.fileError}</AlertDescription>
            </Alert>
          )}

          {data && !data.fileError && (
            <div className="space-y-2" data-testid="import-preview">
              <h4 className="text-sm font-medium">3. Náhled {fileName && <span className="font-normal text-muted-foreground">({fileName})</span>}</h4>
              <p className="flex flex-wrap gap-2 text-xs" data-testid="import-counts">
                {(["new", "change", "unchanged", "error"] as const).map((s) => (
                  <span key={s} data-count={s} className={`rounded px-2 py-1 font-medium ${STATUS_CLASS[s]}`}>
                    {STATUS_LABEL[s]}: {data.counts[s]}
                  </span>
                ))}
              </p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs">
                    <tr>
                      <th className="px-2 py-1.5">Řádek</th>
                      <th className="px-2 py-1.5">Stav</th>
                      <th className="px-2 py-1.5">Záznam</th>
                      <th className="px-2 py-1.5">Co se stane / důvod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.line} data-status={r.status} data-line={r.line} className="border-t align-top">
                        <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                        <td className="px-2 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                        </td>
                        <td className="px-2 py-1.5 break-all">{r.title}</td>
                        <td className="px-2 py-1.5 text-xs">{r.status === "error" ? <span className="text-red-600">{r.error}</span> : r.changes.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.counts.error > 0 && <p className="text-xs text-muted-foreground">Řádky s chybou se při potvrzení přeskočí, ostatní se provedou.</p>}
            </div>
          )}

          {result && (
            <Alert className={result.counts.error > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20"} data-testid="import-result">
              <div className="mb-1 flex items-center gap-2">
                {result.counts.error > 0 ? <AlertCircle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                <AlertTitle className="mb-0">Import dokončen</AlertTitle>
              </div>
              <AlertDescription className="text-sm">{result.summary}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy && !!result}>
            Zavřít
          </Button>
          <Button
            onClick={run}
            disabled={!data || !!data.fileError || applicable === 0 || busy || !!result}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="import-confirm"
          >
            {applicable > 0 ? `Potvrdit import (${applicable})` : "Potvrdit import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
