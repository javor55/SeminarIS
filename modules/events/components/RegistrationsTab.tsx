"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Download, Mail, MoreHorizontal, Pencil, UserMinus, UserPlus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Meter } from "@/components/ui/meter";
import { MobileCard, MobileCardField, MobileCardList, ResponsiveView } from "@/components/ui/mobile-card";
import { NativeSelect } from "@/components/ui/native-select";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { BulkEmailDialog } from "@/modules/events/components/BulkEmailDialog";
import { CopyLinkButton } from "@/modules/events/components/CopyLinkButton";
import { CancelDialog, MoveDialog, RegistrationFormDialog, RemoveDialog, type DialogState } from "@/modules/events/components/RegistrationDialogs";
import { itemFullLabel } from "@/modules/events/format";
import { REG_STATUS_LABEL, matchesQuery, type RegRow, type RegStatus } from "@/modules/events/organizer-core";
import { placesOf } from "@/modules/events/public-state";
import type { RegistrationsData } from "@/modules/events/registrations-data";

const STATUS_VARIANT: Record<RegStatus, "success" | "warning" | "info" | "muted"> = { CONFIRMED: "success", PENDING: "warning", WAITLIST: "info", CANCELLED: "muted" };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Záložka Registrace: souhrn a obsazenost, odkaz s QR kódem, seznam (na telefonu karty), hledání a akce organizátora. */
export function RegistrationsTab({ data, readOnly }: { data: RegistrationsData; readOnly: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const active = data.rows.filter((r) => r.status !== "CANCELLED");
  const holding = data.rows.filter((r) => r.status === "CONFIRMED" || r.status === "PENDING");
  const limited = data.items.filter((i) => !i.cancelled && i.capacity !== null);
  const free = limited.reduce((s, i) => s + Math.max(0, (i.capacity ?? 0) - i.taken), 0);
  const people = holding.reduce((s, r) => s + placesOf(r.guests), 0);

  const rows = useMemo(
    () => data.rows.filter((r) => (showCancelled || r.status !== "CANCELLED") && (!itemFilter || r.items.some((i) => i.id === itemFilter)) && matchesQuery(r, query)).slice().reverse(),
    [data.rows, showCancelled, itemFilter, query]
  );

  const close = () => setDialog(null);
  const refresh = () => router.refresh();

  function actions(r: RegRow, layout: "menu" | "buttons") {
    if (readOnly || r.status === "CANCELLED") return null;
    const list = [
      { id: "edit", label: "Upravit údaje", icon: <Pencil />, open: () => setDialog({ kind: "edit", reg: r }) },
      { id: "move", label: "Přesunout na jiný termín", icon: <ArrowRightLeft />, open: () => setDialog({ kind: "move", reg: r }) },
      ...(r.items.length > 1 ? [{ id: "remove", label: "Odebrat z termínu", icon: <UserMinus />, open: () => setDialog({ kind: "remove", reg: r }) }] : []),
      { id: "cancel", label: "Zrušit registraci", icon: <XCircle />, open: () => setDialog({ kind: "cancel", reg: r }) },
    ];
    if (layout === "buttons") {
      return list.map((a) => (
        <Button key={a.id} type="button" variant="outline" size="sm" data-action={a.id} onClick={a.open}>
          {a.icon} {a.label}
        </Button>
      ));
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label={`Akce pro registraci ${r.code}`} data-testid="row-actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {list.map((a) => (
            <DropdownMenuItem key={a.id} data-action={a.id} onSelect={a.open}>
              <span className="mr-2 [&>svg]:h-4 [&>svg]:w-4">{a.icon}</span>
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const status = (r: RegRow) => (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={STATUS_VARIANT[r.status]} data-testid="reg-status">{REG_STATUS_LABEL[r.status]}</Badge>
      {r.confirmEmailFailed && r.status !== "CANCELLED" && <Badge variant="warning" data-testid="reg-email-failed">E-mail neodešel</Badge>}
    </span>
  );
  const terms = (r: RegRow) => (r.items.length ? r.items.map((i) => itemFullLabel(i)).join(", ") : "—");

  return (
    <div className="space-y-6" data-testid="registrations-tab">
      <div className="grid grid-cols-3 gap-3" data-testid="reg-summary">
        <StatTile label={plural(active.length, "registrace", "registrace", "registrací")} value={<span data-testid="sum-registrations">{active.length}</span>} />
        <StatTile label="osob celkem" value={<span data-testid="sum-people">{people}</span>} />
        <StatTile label={limited.length === 0 ? "volných míst (bez omezení)" : "volných míst"} value={<span data-testid="sum-free">{limited.length === 0 ? "∞" : free}</span>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Obsazenost termínů</CardTitle></CardHeader>
          <CardContent className="space-y-3" data-testid="occupancy">
            {data.items.length === 0 && <p className="text-sm text-muted-foreground">Událost zatím nemá žádné termíny.</p>}
            {data.items.map((i) => (
              <div key={i.id} className="space-y-1" data-item={i.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={i.cancelled ? "line-through text-muted-foreground" : ""}>{itemFullLabel(i)}</span>
                  <span className="shrink-0 text-muted-foreground" data-testid="occupancy-text">{i.capacity === null ? `${i.taken} · bez omezení` : `${i.taken} / ${i.capacity}`}</span>
                </div>
                <Meter value={i.taken} max={i.capacity} label={i.capacity === null ? `Obsazeno ${i.taken}, bez omezení` : `Obsazeno ${i.taken} z ${i.capacity}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="qr-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">Odkaz a QR kód</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="break-all font-mono text-xs text-muted-foreground">/akce/{data.event.slug}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/events/${data.event.id}/qr`} alt={`QR kód odkazu na událost ${data.event.title}`} width={160} height={160} className="h-40 w-40 rounded-md border bg-white" data-testid="qr-image" />
            <div className="flex flex-wrap gap-2">
              <CopyLinkButton slug={data.event.slug} />
              <Button asChild variant="outline" size="sm"><a href={`/api/events/${data.event.id}/qr?format=png&download=1`} data-testid="qr-png"><Download /> PNG</a></Button>
              <Button asChild variant="outline" size="sm"><a href={`/api/events/${data.event.id}/qr?format=svg&download=1`} data-testid="qr-svg"><Download /> SVG</a></Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input type="search" placeholder="Hledat jméno, e-mail, telefon, kód…" aria-label="Hledat registrace" data-testid="reg-search" className="h-11 text-base md:h-9 md:max-w-xs md:text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
          <NativeSelect aria-label="Filtr podle termínu" data-testid="reg-item-filter" className="md:max-w-xs [&_select]:h-11 [&_select]:text-base md:[&_select]:h-9 md:[&_select]:text-sm" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
            <option value="">Všechny termíny</option>
            {data.items.map((i) => (
              <option key={i.id} value={i.id}>{itemFullLabel(i)}</option>
            ))}
          </NativeSelect>
          <Checkbox data-testid="show-cancelled" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} label="Zobrazit zrušené" labelClassName="min-h-9" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!readOnly && (
            <Button type="button" onClick={() => setDialog({ kind: "add" })} data-testid="add-registration" className="min-h-11 md:min-h-9"><UserPlus /> Přidat registraci</Button>
          )}
          {!readOnly && (
            <Button type="button" variant="outline" onClick={() => setDialog({ kind: "bulk" })} data-testid="bulk-email" className="min-h-11 md:min-h-9"><Mail /> E-mail účastníkům</Button>
          )}
          <Button asChild variant="outline" className="min-h-11 md:min-h-9"><a href={`/api/events/${data.event.id}/export`} data-testid="export-csv"><Download /> Export CSV</a></Button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="reg-empty">
            {data.rows.length === 0 ? "Zatím se nikdo neregistroval." : "Hledání nic nenašlo."}
          </div>
        ) : (
          <ResponsiveView
            desktop={
              <div className="rounded-lg border" data-testid="reg-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jméno</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Termíny</TableHead>
                      <TableHead className="text-right">Osoby</TableHead>
                      <TableHead>Poznámka</TableHead>
                      <TableHead>Vytvořeno</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead><span className="sr-only">Akce</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} data-testid="reg-row" data-code={r.code} data-status={r.status}>
                        <TableCell className="align-top">
                          <div className="font-medium">{r.name ?? "—"}</div>
                          <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                        </TableCell>
                        <TableCell className="break-all align-top">{r.email}</TableCell>
                        <TableCell className="whitespace-nowrap align-top">{str(r.answers.phone) || "—"}</TableCell>
                        <TableCell className="align-top text-sm">{r.items.length ? r.items.map((i) => <div key={i.id}>{itemFullLabel(i)}</div>) : "—"}</TableCell>
                        <TableCell className="text-right align-top">{placesOf(r.guests)}</TableCell>
                        <TableCell className="max-w-[12rem] break-words align-top text-sm" title={str(r.answers.note)}>{str(r.answers.note).slice(0, 80) || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap align-top text-sm">{formatDateTime(r.createdAt)}</TableCell>
                        <TableCell className="align-top">{status(r)}</TableCell>
                        <TableCell className="text-right align-top">{actions(r, "menu")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            mobile={
              <MobileCardList data-testid="reg-cards">
                {rows.map((r) => (
                  <MobileCard key={r.id} title={r.name ?? r.email} badge={<Badge variant={STATUS_VARIANT[r.status]} data-testid="reg-status">{REG_STATUS_LABEL[r.status]}</Badge>} data-testid="reg-row" data-code={r.code} data-status={r.status} actions={actions(r, "buttons")}>
                    <MobileCardField label="Kód">{r.code}</MobileCardField>
                    {r.name && <MobileCardField label="E-mail">{r.email}</MobileCardField>}
                    {str(r.answers.phone) && <MobileCardField label="Telefon">{str(r.answers.phone)}</MobileCardField>}
                    <MobileCardField label="Termíny">{terms(r)}</MobileCardField>
                    <MobileCardField label="Osoby">{placesOf(r.guests)}</MobileCardField>
                    {str(r.answers.note) && <MobileCardField label="Poznámka">{str(r.answers.note).slice(0, 120)}</MobileCardField>}
                    <MobileCardField label="Vytvořeno">{formatDateTime(r.createdAt)}</MobileCardField>
                    {r.confirmEmailFailed && r.status !== "CANCELLED" && <Badge variant="warning" data-testid="reg-email-failed">Potvrzovací e-mail neodešel</Badge>}
                  </MobileCard>
                ))}
              </MobileCardList>
            }
          />
        )}
      </div>

      {dialog?.kind === "bulk" && <BulkEmailDialog eventId={data.event.id} items={data.items} initialItemId={itemFilter} onClose={close} onDone={refresh} />}
      {dialog?.kind === "add" && <RegistrationFormDialog data={data} onClose={close} onDone={refresh} />}
      {dialog?.kind === "edit" && <RegistrationFormDialog key={dialog.reg.id} data={data} reg={dialog.reg} onClose={close} onDone={refresh} />}
      {dialog?.kind === "move" && <MoveDialog key={dialog.reg.id} data={data} reg={dialog.reg} onClose={close} onDone={refresh} />}
      {dialog?.kind === "remove" && <RemoveDialog key={dialog.reg.id} data={data} reg={dialog.reg} onClose={close} onDone={refresh} />}
      {dialog?.kind === "cancel" && <CancelDialog key={dialog.reg.id} data={data} reg={dialog.reg} onClose={close} onDone={refresh} />}
    </div>
  );
}
