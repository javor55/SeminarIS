"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Mail } from "lucide-react";
import { unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { getUnenrolledView, remindUnenrolled, type UnenrolledView } from "@/modules/seminars/actions/unenrolled";

/** Záložka „Nezapsaní“: studenti z publika zápisu, kterým chybí zápis v povinných blocích. */
export function UnenrolledTab({
  windowId,
  windowName,
  canRemind,
  onCount,
}: {
  windowId: string;
  windowName: string;
  canRemind: boolean;
   
  onCount?: (count: number) => void;
}) {
  const [view, setView] = useState<UnenrolledView | null>(null);
  const [classId, setClassId] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await getUnenrolledView(windowId);
      setView(v);
      onCount?.(v.students.length);
    } catch (err) {
      toast.error((err as Error).message || "Nepodařilo se načíst nezapsané studenty.");
    }
  }, [windowId, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => (view?.students ?? []).filter((s) => !classId || s.classGroupId === classId),
    [view, classId]
  );

  function exportCsv() {
    const header = ["Příjmení", "Jméno", "E-mail", "Třída", "Chybějící bloky"];
    const lines = rows.map((s) => [s.lastName, s.firstName, s.email, s.classLabel ?? "", s.missingBlocks.join(", ")]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nezapsani_${windowName.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function remind() {
    setSending(true);
    try {
      const r = unwrap(await remindUnenrolled(windowId));
      const skipped = r.skippedLimit + r.skippedDisabled;
      if (r.sent > 0) {
        toast.success(`Připomínka odeslána: ${r.sent} z ${r.total} e-mailů${skipped ? `, ${skipped} přeskočeno` : ""}${r.failed ? `, ${r.failed} se nepodařilo odeslat` : ""}.`);
      } else {
        toast.error(r.error ?? "Žádný e-mail se neodeslal.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Připomínku se nepodařilo odeslat.");
    } finally {
      setSending(false);
    }
  }

  if (!view) return <div className="h-32 rounded-lg border bg-muted/30 animate-pulse" />;
  const total = view.students.length;

  return (
    <div className="space-y-4" data-testid="unenrolled-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground" data-testid="unenrolled-count">
          {total === 0
            ? "Všichni studenti z publika zápisu mají zapsáno vše potřebné v povinných blocích."
            : `Nezapsaných studentů: ${total}${classId ? ` (ve vybrané třídě ${rows.length})` : ""}`}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect className="w-[150px]" aria-label="Třída" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Všechny třídy</option>
            {view.classes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={rows.length === 0} data-testid="unenrolled-export">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {canRemind && (
            <ConfirmAction
              title="Poslat připomínku nezapsaným?"
              description={`E-mail s chybějícími bloky dostane ${total} studentů (kdo si v profilu vypnul nepovinná upozornění, ho nedostane). Počítá se do denního a měsíčního limitu e-mailů.`}
              actionLabel="Poslat"
              onConfirm={remind}
              trigger={
                <Button size="sm" className="gap-2" disabled={sending || total === 0} data-testid="unenrolled-remind">
                  <Mail className="h-4 w-4" /> Poslat připomínku nezapsaným ({total} e-mailů)
                </Button>
              }
            />
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Třída</TableHead>
              <TableHead>Chybějící bloky</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id} data-testid="unenrolled-row" data-email={s.email}>
                <TableCell>
                  {s.lastName} {s.firstName}
                  <div className="text-xs text-muted-foreground">{s.email}</div>
                </TableCell>
                <TableCell>{s.classLabel ?? "—"}</TableCell>
                <TableCell>{s.missingBlocks.join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
