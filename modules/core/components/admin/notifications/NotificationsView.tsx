"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/action-result";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
import {
  getNotificationsOverview,
  saveNotificationEvent,
  saveNotificationSettings,
  sendTestEmailToMe,
  type EmailForecastDay,
  type NotificationEventView,
  type NotificationsOverview,
} from "@/modules/core/actions/notifications";
import { EmailLogTable } from "@/modules/core/components/admin/notifications/EmailLogTable";

const nf = new Intl.NumberFormat("cs-CZ");

type Stats = NotificationEventView["stats"];
const sumStats = (list: Stats[]): Stats => list.reduce((a, s) => ({ today: a.today + s.today, last30: a.last30 + s.last30, skippedLimit30: a.skippedLimit30 + s.skippedLimit30 }), { today: 0, last30: 0, skippedLimit30: 0 });

/** Odesláno dnes a za posledních 30 dní (z EmailLog). */
function StatsLine({ stats, days, testId }: { stats: Stats; days: number; testId: string }) {
  return (
    <span data-testid={testId} data-today={stats.today} data-last30={stats.last30}>
      Odesláno: dnes <strong>{nf.format(stats.today)}</strong> · za {days} dní <strong>{nf.format(stats.last30)}</strong>
      {stats.skippedLimit30 > 0 && <span> · kvůli limitu přeskočeno {nf.format(stats.skippedLimit30)}</span>}
    </span>
  );
}

export function NotificationsView() {
  const [data, setData] = useState<NotificationsOverview | null>(null);

  async function load() {
    try {
      setData(await getNotificationsOverview());
    } catch {
      toast.error("Nepodařilo se načíst nastavení upozornění.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (!data) {
    return <div className="h-40 rounded-lg border bg-muted/30 animate-pulse" />;
  }

  const groups = [...new Set(data.events.map((e) => e.group))];

  return (
    <div className="space-y-6">
      <UsageCard data={data} />
      <SettingsCard data={data} onChange={load} />

      <Card className="shadow-sm" data-testid="events-card">
        <CardHeader>
          <CardTitle>Upozornění</CardTitle>
          <CardDescription>
            U každého upozornění lze změnit zapnutí a text. Povinná upozornění chodí vždy, když jsou zapnutá; nepovinná
            (připomínky a souhrny) jen těm, kdo je v profilu nevypnuli.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.map((group) => (
            <div key={group} className="space-y-3" data-testid={`group-${group}`}>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="text-sm font-semibold">{group}</div>
                <div className="text-xs text-muted-foreground">
                  <StatsLine stats={sumStats(data.events.filter((e) => e.group === group).map((e) => e.stats))} days={data.statsDays} testId={`group-stats-${group}`} />
                </div>
              </div>
              <div className="divide-y rounded-md border">
                {data.events
                  .filter((e) => e.group === group)
                  .map((e) => (
                    <EventRow key={e.id} event={e} statsDays={data.statsDays} onChange={load} />
                  ))}
              </div>
            </div>
          ))}
          <div className="space-y-2" data-testid="manual-stats">
            <div className="text-sm font-semibold">Ruční e-maily</div>
            <p className="text-xs text-muted-foreground">
              Bez vlastního přepínače. Hromadné e-maily z detailu události, ze seznamu uživatelů a ze zápisů se zapisují jako „Hromadný e-mail správce“; všechny se počítají do limitů.
            </p>
            <div className="divide-y rounded-md border text-sm">
              {data.manualStats.map((m) => (
                <div key={m.id} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:justify-between" data-testid={`manual-${m.id}`}>
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs text-muted-foreground">
                    <StatsLine stats={m.stats} days={data.statsDays} testId={`stats-${m.id}`} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm" data-testid="email-log-card">
        <CardHeader>
          <CardTitle>Odeslané e-maily</CardTitle>
          <CardDescription>Posledních odeslaných a přeskočených e-mailů. Podle odeslaných se počítají limity.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailLogTable events={data.events} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Čerpání denního a měsíčního limitu s odhadem na nejbližší dny (nahoře na stránce). */
function UsageCard({ data }: { data: NotificationsOverview }) {
  const { usage } = data;
  const dailyReached = usage.today >= usage.dailyLimit;
  const monthlyReached = usage.month >= usage.monthlyLimit;
  const monthLeft = Math.max(0, usage.monthlyLimit - usage.month);
  return (
    <Card className="shadow-sm" data-testid="email-usage-card">
      <CardHeader>
        <CardTitle>Čerpání limitů</CardTitle>
        <CardDescription>Do limitů se počítají odeslané e-maily všech typů. Co se nevejde, se neodešle a zapíše se jako přeskočené.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4" data-testid="email-usage">
          <div className="space-y-1.5" data-testid="meter-daily">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span>Dnes <strong>{nf.format(usage.today)} / {nf.format(usage.dailyLimit)}</strong></span>
              <span className="text-xs text-muted-foreground">zbývá {nf.format(Math.max(0, usage.dailyLimit - usage.today))}</span>
            </div>
            <Meter value={usage.today} max={usage.dailyLimit} label={`Denní limit: odesláno ${usage.today} z ${usage.dailyLimit}`} />
          </div>
          <div className="space-y-1.5" data-testid="meter-monthly">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span>Tento měsíc <strong>{nf.format(usage.month)} / {nf.format(usage.monthlyLimit)}</strong></span>
              <span className="text-xs text-muted-foreground">zbývá {nf.format(monthLeft)}</span>
            </div>
            <Meter value={usage.month} max={usage.monthlyLimit} label={`Měsíční limit: odesláno ${usage.month} z ${usage.monthlyLimit}`} />
          </div>
          {(dailyReached || monthlyReached) && (
            <p className="text-sm text-danger" data-testid="limit-warning">
              {monthlyReached ? "Měsíční" : "Denní"} limit je vyčerpán, další e-maily se neodesílají
              {usage.skippedToday > 0 ? ` (dnes přeskočeno ${nf.format(usage.skippedToday)})` : ""}.
            </p>
          )}
          {!dailyReached && !monthlyReached && usage.skippedMonth > 0 && (
            <p className="text-xs text-muted-foreground">Tento měsíc se kvůli limitu přeskočilo {nf.format(usage.skippedMonth)} e-mailů.</p>
          )}
        </div>

        <div className="space-y-2 border-t pt-4" data-testid="email-forecast">
          <div className="text-sm font-semibold">Odhad na nejbližší dny</div>
          <p className="text-xs text-muted-foreground">
            Co odejde při denní úloze (např. připomínky účastníkům událostí den předem). Počítají se jen zapnuté typy; vypnuté jsou uvedené zvlášť.
          </p>
          <ul className="space-y-3">
            {data.forecast.map((d, i) => (
              <ForecastRow key={i} day={d} index={i} dailyLimit={usage.dailyLimit} monthLeft={monthLeft} />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ForecastRow({ day, index, dailyLimit, monthLeft }: { day: EmailForecastDay; index: number; dailyLimit: number; monthLeft: number }) {
  const total = day.alreadySent + day.planned;
  const over = total > dailyLimit || day.planned > monthLeft;
  const off = day.items.filter((x) => !x.enabled);
  return (
    <li className="space-y-1" data-testid={`forecast-${index}`} data-planned={day.planned} data-over={over ? "1" : "0"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{day.label}</span>
        <span className="text-xs text-muted-foreground">
          {day.alreadySent > 0 ? `už odesláno ${nf.format(day.alreadySent)}, ` : ""}
          naplánováno <strong>{nf.format(day.planned)}</strong> z {nf.format(dailyLimit)}
        </span>
      </div>
      <Meter value={total} max={dailyLimit} label={`${day.label}: odhad ${total} z denního limitu ${dailyLimit}`} />
      {day.items.filter((x) => x.enabled).map((x) => (
        <p key={x.id} className="text-xs text-muted-foreground">{x.label}: {nf.format(x.count)}</p>
      ))}
      {off.map((x) => (
        <p key={x.id} className="text-xs text-muted-foreground" data-testid={`forecast-off-${x.id}`}>
          {x.label} je vypnuté; po zapnutí by odešlo {nf.format(x.count)}.
        </p>
      ))}
      {over && (
        <p className="text-xs text-danger" data-testid="forecast-over">
          Limit nestačí: {nf.format(Math.max(total - dailyLimit, day.planned - monthLeft, 1))} e-mailů by se přeskočilo. Zvyšte limit, nebo některý typ vypněte.
        </p>
      )}
    </li>
  );
}

function SettingsCard({ data, onChange }: { data: NotificationsOverview; onChange: () => Promise<void> }) {
  const s = data.settings;
  const [enabled, setEnabled] = useState(s.enabled);
  const [from, setFrom] = useState(s.from ?? "");
  const [replyTo, setReplyTo] = useState(s.replyTo ?? "");
  const [dailyLimit, setDailyLimit] = useState(String(s.dailyLimit));
  const [monthlyLimit, setMonthlyLimit] = useState(String(s.monthlyLimit));
  const [retention, setRetention] = useState(String(s.logRetentionDays));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { status } = data;

  async function save() {
    setSaving(true);
    try {
      unwrap(
        await saveNotificationSettings({
          enabled,
          from,
          replyTo,
          dailyLimit: Number(dailyLimit),
          monthlyLimit: Number(monthlyLimit),
          logRetentionDays: Number(retention),
        })
      );
      toast.success("Nastavení uloženo.");
      await onChange();
    } catch (err) {
      toast.error((err as Error).message || "Nastavení se nepodařilo uložit.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = unwrap(await sendTestEmailToMe());
      toast.success(`Zkušební e-mail odeslán na ${res.to}.`);
      await onChange();
    } catch (err) {
      toast.error((err as Error).message || "E-mail se nepodařilo odeslat.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="shadow-sm" data-testid="email-card">
      <CardHeader>
        <CardTitle>Nastavení e-mailů</CardTitle>
        <CardDescription>
          Odesílání přes Resend. API klíč (<code>RESEND_API_KEY</code>) je tajný a patří jen do proměnných prostředí na Vercelu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!status.configured && (
          <p className="text-sm rounded-md border border-warning/30 bg-warning/10 p-3" data-testid="email-missing">
            E-maily se neodesílají, chybí nastavení:{" "}
            {status.missing.map((m, i) => (
              <span key={m}>{i > 0 && " a "}<code>{m}</code></span>
            ))}
            . Doplňte proměnné prostředí a aplikaci znovu nasaďte{status.missing.includes("EMAIL_FROM") ? " (odesílatele lze zadat i níže)" : ""}.
          </p>
        )}
        {status.configured && (
          <div className="text-sm space-y-1" data-testid="email-status">
            <div>Odesílatel: <strong>{status.from}</strong> <span className="text-muted-foreground">({status.fromSource === "admin" ? "z administrace" : "z proměnné prostředí"})</span></div>
            {status.replyTo && <div>Odpovědi na: <strong>{status.replyTo}</strong></div>}
            {status.transport === "log" && (
              <div className="text-muted-foreground">Testovací režim: e-maily se neodesílají, jen zapisují do logu.</div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notif-enabled">Posílat e-mailová upozornění</Label>
            <p className="text-xs text-muted-foreground">Hlavní vypínač. Když je vypnutý, žádné upozornění se neodešle.</p>
          </div>
          <Switch id="notif-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 pt-2 border-t">
          <div className="space-y-1">
            <Label htmlFor="notif-from">Odesílatel</Label>
            <Input id="notif-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={data.envFrom ?? "Školní IS <noreply@skola.cz>"} />
            <p className="text-xs text-muted-foreground">Prázdné = hodnota z prostředí{data.envFrom ? ` (${data.envFrom})` : ""}.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notif-replyto">Reply-to</Label>
            <Input id="notif-replyto" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder={data.envReplyTo ?? "podatelna@skola.cz"} />
            <p className="text-xs text-muted-foreground">Prázdné = hodnota z prostředí{data.envReplyTo ? ` (${data.envReplyTo})` : ""}.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notif-daily">Denní limit e-mailů</Label>
            <Input id="notif-daily" type="number" min={0} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
            <p className="text-xs text-muted-foreground">Free plán Resendu: 100 denně (výchozí 90).</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notif-monthly">Měsíční limit e-mailů</Label>
            <Input id="notif-monthly" type="number" min={0} value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
            <p className="text-xs text-muted-foreground">Free plán Resendu: 3 000 měsíčně (výchozí 2 900).</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notif-retention">Uchovávat záznamy o e-mailech (dny)</Label>
            <Input id="notif-retention" type="number" min={data.minLogRetentionDays} value={retention} onChange={(e) => setRetention(e.target.value)} />
            <p className="text-xs text-muted-foreground">Nejméně {data.minLogRetentionDays} dní (podle záznamů se počítá měsíční limit). Starší maže denní úloha.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving} data-testid="notif-save">{saving ? "Ukládám…" : "Uložit nastavení"}</Button>
          <Button variant="outline" onClick={sendTest} disabled={testing || !status.configured} data-testid="email-send">
            {testing ? "Odesílám…" : "Poslat zkušební e-mail sobě"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({ event: e, statsDays, onChange }: { event: NotificationEventView; statsDays: number; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(e.subject);
  const [body, setBody] = useState(e.body);
  const [busy, setBusy] = useState(false);

  async function toggle(enabled: boolean) {
    try {
      unwrap(await saveNotificationEvent(e.id, { enabled }));
      toast.success(enabled ? `Upozornění „${e.label}“ zapnuto.` : `Upozornění „${e.label}“ vypnuto.`);
      await onChange();
    } catch (err) {
      toast.error((err as Error).message || "Nastavení se nepodařilo uložit.");
    }
  }

  async function saveTemplate(reset = false) {
    setBusy(true);
    try {
      unwrap(
        await saveNotificationEvent(e.id, {
          subject: reset ? "" : subject,
          body: reset ? "" : body,
        })
      );
      if (reset) {
        setSubject(e.defaultSubject);
        setBody(e.defaultBody);
      }
      toast.success(reset ? "Obnoven výchozí text." : "Text uložen.");
      await onChange();
    } catch (err) {
      toast.error((err as Error).message || "Text se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3 space-y-3" data-testid={`event-${e.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={`ev-${e.id}`} className="font-medium">{e.label}</Label>
            <Badge variant={e.mandatory ? "secondary" : "outline"}>{e.mandatory ? "povinné" : "nepovinné"}</Badge>
            {!e.moduleEnabled && <Badge variant="warning">modul je vypnutý</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{e.description}</p>
          <p className="text-xs text-muted-foreground"><StatsLine stats={e.stats} days={statsDays} testId={`stats-${e.id}`} /></p>
          {e.estimate != null && (
            <p className="text-xs text-muted-foreground" data-testid={`estimate-${e.id}`}>
              Odhad příjemců při příštím spuštění: <strong>{nf.format(e.estimate)}</strong>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} data-testid={`edit-${e.id}`}>
            {open ? "Skrýt text" : "Upravit text"}
          </Button>
          <Switch id={`ev-${e.id}`} checked={e.enabled} onCheckedChange={toggle} />
        </div>
      </div>
      {open && (
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <div className="space-y-1">
            <Label htmlFor={`subj-${e.id}`}>Předmět</Label>
            <Input id={`subj-${e.id}`} value={subject} onChange={(ev) => setSubject(ev.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`body-${e.id}`}>Text</Label>
            <Textarea id={`body-${e.id}`} rows={8} value={body} onChange={(ev) => setBody(ev.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground">
            Proměnné:{" "}
            {e.variables.map((v) => (
              <span key={v.name} className="mr-2" title={v.description}>
                <code>{`{{${v.name}}}`}</code> {v.description}
                {";"}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveTemplate(false)} disabled={busy} data-testid={`save-${e.id}`}>Uložit text</Button>
            <Button size="sm" variant="outline" onClick={() => saveTemplate(true)} disabled={busy}>Obnovit výchozí</Button>
          </div>
        </div>
      )}
    </div>
  );
}
