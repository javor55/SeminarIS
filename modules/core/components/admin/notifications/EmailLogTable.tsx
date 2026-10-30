"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { getEmailLog, type EmailLogRow, type NotificationEventView } from "@/modules/core/actions/notifications";

const STATUS_LABELS: Record<EmailLogRow["status"], string> = {
  SENT: "odesláno",
  FAILED: "chyba",
  SKIPPED_LIMIT: "přeskočeno (limit)",
  SKIPPED_DISABLED: "přeskočeno (vypnuto)",
};
const STATUS_VARIANT = { SENT: "success", FAILED: "destructive", SKIPPED_LIMIT: "warning", SKIPPED_DISABLED: "secondary" } as const;

export function EmailLogTable({ events }: { events: NotificationEventView[] }) {
  const [status, setStatus] = useState("");
  const [event, setEvent] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: EmailLogRow[]; total: number; pageSize: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getEmailLog({ status, event, search, page }));
    } catch {
      toast.error("Nepodařilo se načíst záznamy o e-mailech.");
    }
  }, [status, event, search, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3" data-testid="email-log">
      <div className="flex flex-wrap gap-2">
        <NativeSelect className="w-[200px]" aria-label="Stav" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}>
          <option value="">Všechny stavy</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
        <NativeSelect className="w-[260px]" aria-label="Událost" value={event} onChange={(e) => { setPage(0); setEvent(e.target.value); }}>
          <option value="">Všechna upozornění</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          <option value="manual.bulk">Hromadný e-mail správce</option>
          <option value="test">Zkušební e-mail</option>
        </NativeSelect>
        <Input className="w-[240px]" placeholder="Hledat příjemce, předmět…" aria-label="Hledat" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Čas</TableHead>
            <TableHead>Příjemce</TableHead>
            <TableHead>Upozornění</TableHead>
            <TableHead>Předmět</TableHead>
            <TableHead>Stav</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.rows ?? []).map((r) => (
            <TableRow key={r.id} data-testid="email-log-row" data-status={r.status} data-event={r.event}>
              <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
              <TableCell>{r.recipient}</TableCell>
              <TableCell>{r.eventLabel}</TableCell>
              <TableCell className="max-w-[320px] truncate" title={r.subject}>{r.subject}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                {r.error && <div className="text-xs text-muted-foreground mt-1">{r.error}</div>}
              </TableCell>
            </TableRow>
          ))}
          {data && data.rows.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Žádné záznamy.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} záznamů` : ""}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Předchozí</Button>
          <span>{page + 1} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Další</Button>
        </div>
      </div>
    </div>
  );
}
