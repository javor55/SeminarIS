import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { getAuthSettings } from "@/lib/auth-settings";
import { PerformanceBenchmarks } from "@/modules/core/components/admin/PerformanceBenchmarks";
import { getCronStatus, getDatabaseStatus, getDeploymentInfo, getEmailDiagnostics, getMigrationStatus } from "@/modules/core/system-status";

export const dynamic = "force-dynamic";

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm border-b last:border-b-0" data-testid={testId}>
      <span className="text-muted-foreground">{label}</span>
      <div className="font-medium text-right">{children}</div>
    </div>
  );
}

const Ok = ({ children }: { children: ReactNode }) => <Badge variant="success">{children}</Badge>;
const Bad = ({ children }: { children: ReactNode }) => <Badge variant="destructive">{children}</Badge>;
const Warn = ({ children }: { children: ReactNode }) => <Badge variant="warning">{children}</Badge>;

export default async function DiagnosticsPage() {
  await requirePagePermission("core.admin");
  const [db, migrations, cron, email, auth] = await Promise.all([getDatabaseStatus(), getMigrationStatus(), getCronStatus(), getEmailDiagnostics(), getAuthSettings()]);
  const deployment = getDeploymentInfo();

  return (
    <div className="space-y-6">
      <PageHeader title="Diagnostika" description="Stav databáze, migrací, denní úlohy, e-mailů a nasazení." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm" data-testid="diag-db">
          <CardHeader>
            <CardTitle>Databáze a migrace</CardTitle>
            <CardDescription>Připojení a stav tabulky <code>_prisma_migrations</code>.</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Připojení">{db.ok ? <Ok>v pořádku ({db.latencyMs} ms)</Ok> : <Bad>nedostupná{db.error ? `: ${db.error.slice(0, 80)}` : ""}</Bad>}</Row>
            <Row label="Použité migrace" testId="diag-migrations">
              {migrations.error ? <Bad>nelze zjistit</Bad> : <>{migrations.applied}{migrations.ok ? <> <Ok>aktuální</Ok></> : null}</>}
            </Row>
            {migrations.latest && (
              <Row label="Poslední migrace">
                <span className="font-mono text-xs">{migrations.latest.name}</span>
                {migrations.latest.at && <span className="block text-xs text-muted-foreground">{formatDateTime(migrations.latest.at)}</span>}
              </Row>
            )}
            {migrations.failed.length > 0 && <Row label="Neúspěšné migrace"><Bad>{migrations.failed.join(", ")}</Bad></Row>}
            {migrations.pending && migrations.pending.length > 0 && (
              <Row label="Chybí použít"><Warn>{migrations.pending.join(", ")}</Warn></Row>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm" data-testid="diag-cron">
          <CardHeader>
            <CardTitle>Denní úloha</CardTitle>
            <CardDescription>Připomínky, souhrny a úklid (cron <code>/api/cron/daily</code>).</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="CRON_SECRET">{cron.secretConfigured ? <Ok>nastaveno</Ok> : <Bad>chybí – úloha se nespustí</Bad>}</Row>
            <Row label="Poslední běh">
              {cron.lastRunDay ? (
                <>
                  {cron.lastRunDay} {cron.daysSince === 0 ? <Ok>dnes</Ok> : cron.daysSince !== null && cron.daysSince <= 1 ? <Ok>včera</Ok> : <Warn>před {cron.daysSince} dny</Warn>}
                </>
              ) : (
                <Warn>ještě neběžela</Warn>
              )}
            </Row>
            <Row label="Poslední chyba">
              {cron.lastFailure ? (
                <div className="max-w-xs">
                  {cron.lastFailure.latestRun ? <Bad>v posledním běhu</Bad> : <Warn>dříve</Warn>}
                  <p className="text-xs text-muted-foreground">{formatDateTime(cron.lastFailure.at)}: {cron.lastFailure.summary}</p>
                </div>
              ) : (
                <Ok>žádná</Ok>
              )}
            </Row>
          </CardContent>
        </Card>

        <Card className="shadow-sm" data-testid="diag-email">
          <CardHeader>
            <CardTitle>E-mail</CardTitle>
            <CardDescription>Odesílání upozornění (nastavení najdete v sekci Upozornění).</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Upozornění">{email.enabled ? <Ok>zapnuta</Ok> : <Warn>vypnuta</Warn>}</Row>
            <Row label="Odesílání">
              {email.status.configured ? <Ok>nastaveno ({email.status.transport})</Ok> : <Bad>chybí {email.status.missing.join(", ")}</Bad>}
            </Row>
            <Row label="Odesílatel">{email.status.from ?? "—"}</Row>
            <Row label="Dnes odesláno">{email.usage.today} / {email.usage.dailyLimit}</Row>
            <Row label="Tento měsíc odesláno">{email.usage.month} / {email.usage.monthlyLimit}</Row>
            <Row label="Neúspěšné za 24 h">{email.failed24h === 0 ? <Ok>0</Ok> : <Bad>{email.failed24h}</Bad>}</Row>
          </CardContent>
        </Card>

        <Card className="shadow-sm" data-testid="diag-auth">
          <CardHeader>
            <CardTitle>Přihlášení</CardTitle>
            <CardDescription>Přihlášení přes Microsoft 365 (nastavení najdete v sekci Registrace a přihlášení).</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Microsoft 365" testId="diag-m365">
              {auth.microsoftConfigured ? (
                auth.microsoftEnabled ? <Ok>zapnuto</Ok> : <Warn>nastaveno, ale vypnuto správcem</Warn>
              ) : (
                <span className="text-muted-foreground">nenastaveno (přihlašuje se heslem; chybí AZURE_AD_*)</span>
              )}
            </Row>
          </CardContent>
        </Card>

        <Card className="shadow-sm" data-testid="diag-deployment">
          <CardHeader>
            <CardTitle>Nasazení</CardTitle>
            <CardDescription>Verze aplikace a prostředí serveru.</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Commit" testId="diag-commit">
              {deployment.commit ? <span className="font-mono text-xs">{deployment.commit.slice(0, 7)}</span> : <span className="text-muted-foreground">neznámý (mimo Vercel)</span>}
            </Row>
            <Row label="Prostředí">{deployment.environment ?? "—"}</Row>
            <Row label="Node.js">{deployment.node}</Row>
            <Row label="Instance spuštěna">{formatDateTime(deployment.startedAt)}</Row>
          </CardContent>
        </Card>
      </div>

      <PerformanceBenchmarks />
    </div>
  );
}
