"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { AUDIT_AREAS } from "@/lib/audit";
import { getAuditLog, getHistorySettings, saveHistoryRetention, type AuditRow } from "@/modules/core/actions/history";

export function HistoryView({ userId }: { userId?: string }) {
  const [actor, setActor] = useState("");
  const [area, setArea] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: AuditRow[]; total: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getAuditLog({ actor, area, from, to, search, userId, page }));
    } catch {
      toast.error("Nepodařilo se načíst historii.");
    }
  }, [actor, area, from, to, search, userId, page]);

  useEffect(() => {
    const t = setTimeout(load, actor || search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, actor, search]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
   
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(0);
    set(v);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm" data-testid="history-card">
        <CardHeader>
          <CardTitle>Změny v systému</CardTitle>
          <CardDescription>Nejnovější nahoře. U změn provedených v režimu „zobrazit jako“ je uveden i admin, který jednal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="h-actor">Kdo</Label>
              <Input id="h-actor" className="w-[180px]" placeholder="jméno" value={actor} onChange={(e) => reset(setActor)(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-area">Oblast</Label>
              <NativeSelect id="h-area" className="w-[200px]" value={area} onChange={(e) => reset(setArea)(e.target.value)}>
                <option value="">Všechny oblasti</option>
                {Object.entries(AUDIT_AREAS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-from">Od</Label>
              <Input id="h-from" type="date" className="w-[150px]" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-to">Do</Label>
              <Input id="h-to" type="date" className="w-[150px]" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-search">Hledat v popisu</Label>
              <Input id="h-search" className="w-[220px]" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Čas</TableHead>
                <TableHead>Kdo</TableHead>
                <TableHead>Oblast</TableHead>
                <TableHead>Změna</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((r) => (
                <Fragment key={r.id}>
                  <TableRow data-testid="audit-row" data-action={r.action}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.actorName ?? "—"}
                      {r.impersonatorName && <div className="text-xs text-muted-foreground">v náhledu: {r.impersonatorName}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.areaLabel}</TableCell>
                    <TableCell data-testid="audit-summary">{r.summary}</TableCell>
                    <TableCell>
                      {r.data != null && (
                        <Button variant="ghost" size="sm" onClick={() => setOpen(open === r.id ? null : r.id)}>
                          {open === r.id ? "Skrýt" : "Detail"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {open === r.id && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="text-xs text-muted-foreground mb-1"><code>{r.action}</code> · {r.entityType}{r.entityId ? ` ${r.entityId}` : ""}</div>
                        <pre className="text-xs overflow-auto rounded bg-muted p-2">{JSON.stringify(r.data, null, 2)}</pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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
        </CardContent>
      </Card>

      {!userId && <RetentionCard />}
    </div>
  );
}

function RetentionCard() {
  const [years, setYears] = useState("2");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getHistorySettings().then((s) => setYears(String(s.retentionYears))).catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    try {
      unwrap(await saveHistoryRetention(Number(years)));
      toast.success("Nastavení uloženo.");
    } catch (err) {
      toast.error((err as Error).message || "Nastavení se nepodařilo uložit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm" data-testid="retention-card">
      <CardHeader>
        <CardTitle>Uchovávání historie</CardTitle>
        <CardDescription>Starší záznamy maže denní úloha (výchozí 2 roky).</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="h-retention">Uchovávat (roky)</Label>
          <Input id="h-retention" type="number" min={1} max={20} className="w-[120px]" value={years} onChange={(e) => setYears(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving}>Uložit</Button>
      </CardContent>
    </Card>
  );
}
