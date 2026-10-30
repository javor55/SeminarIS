import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { CLASS_CHANGE_REASON_LABELS, ROLE_LABELS } from "@/lib/school";
import type { UserAuditEntry, UserDetail, UserEmailEntry } from "@/modules/core/user-detail";
import { USER_DETAIL_LIST_LIMIT } from "@/modules/core/user-detail";

// Záložky jádra v detailu uživatele. Serverové komponenty bez klientské logiky (akce jsou v UserActions).

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export function ProfileTab({ user, actions }: { user: UserDetail; actions?: React.ReactNode }) {
  return (
    <div className="space-y-6" data-testid="user-profile">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Jméno a příjmení">{user.firstName} {user.lastName}</Field>
          <Field label="E-mail">{user.email}</Field>
          <Field label="Role"><Badge variant="outline">{ROLE_LABELS[user.role]}</Badge></Field>
          <Field label="Účet">
            {user.isActive ? <Badge className="bg-emerald-600 hover:bg-emerald-600">aktivní</Badge> : <Badge variant="secondary">neaktivní</Badge>}
          </Field>
          {user.role === "STUDENT" && (
            <Field label="Stav studia" testId="user-study">
              {user.studyLabel ?? "studuje"}
              {user.studyEndedAt && <span className="text-muted-foreground"> od {formatDate(user.studyEndedAt)}</span>}
              {user.studyEndNote && <span className="text-muted-foreground"> – {user.studyEndNote}</span>}
            </Field>
          )}
          {(user.role === "STUDENT" || user.classLabel) && <Field label="Třída">{user.classLabel ?? "bez třídy"}</Field>}
          {user.role === "GUEST" && user.requestedClassLabel && <Field label="Požadovaná třída">{user.requestedClassLabel}</Field>}
          <Field label="Registrace">{formatDateTime(user.createdAt)}</Field>
          <Field label="Poslední přihlášení">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nikdy"}</Field>
          <Field label="Nepovinná upozornění">{user.receiveOptionalEmails ? "dostává" : "odhlášen"}</Field>
        </CardContent>
      </Card>
      {actions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Akce</CardTitle>
          </CardHeader>
          <CardContent>{actions}</CardContent>
        </Card>
      )}
    </div>
  );
}

export function ClassesTab({ user }: { user: UserDetail }) {
  return (
    <Card data-testid="user-classes">
      <CardHeader>
        <CardTitle className="text-lg">Třídy</CardTitle>
        <CardDescription>
          Aktuální třída: <strong>{user.classLabel ?? "bez třídy"}</strong>. Historie zařazení po školních letech.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user.classHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Uživatel zatím nebyl zařazen do žádné třídy.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Školní rok</TableHead>
                <TableHead>Třída</TableHead>
                <TableHead>Důvod</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.classHistory.map((h) => (
                <TableRow key={h.id} data-testid="class-history-row">
                  <TableCell>{h.yearLabel}</TableCell>
                  <TableCell className="font-medium">{h.classLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{CLASS_CHANGE_REASON_LABELS[h.reason]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Úvazky učitele po školních letech; `editor` (dialog úprav) dostane jen ten, kdo smí úvazky měnit. */
export function AssignmentsTab({ user, editor }: { user: UserDetail; editor?: React.ReactNode }) {
  const years = [...new Set(user.assignments.map((a) => a.yearLabel))];
  return (
    <Card data-testid="user-assignments">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">Úvazky</CardTitle>
          <CardDescription>Co a ve kterých třídách učitel učí (po školních letech).</CardDescription>
        </div>
        {editor}
      </CardHeader>
      <CardContent className="space-y-4">
        {years.length === 0 && <p className="text-sm text-muted-foreground">Uživatel nemá žádné úvazky.</p>}
        {years.map((year) => {
          const rows = user.assignments.filter((a) => a.yearLabel === year);
          const bySubject = new Map<string, { id: string; name: string; code: string | null; classes: string[] }>();
          for (const a of rows) {
            const e = bySubject.get(a.subjectId) ?? { id: a.subjectId, name: a.subjectName, code: a.subjectCode, classes: [] };
            e.classes.push(a.classLabel);
            bySubject.set(a.subjectId, e);
          }
          return (
            <div key={year} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {year} {rows[0].isCurrent && <Badge variant="outline" className="ml-1">aktuální</Badge>}
              </h3>
              <ul className="space-y-1 text-sm">
                {[...bySubject.values()].map((s) => (
                  <li key={s.id} data-testid="user-assignment">
                    <Link href={`/subjects/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                    {s.code && <span className="text-muted-foreground"> ({s.code})</span>}
                    <span className="text-muted-foreground"> – </span>
                    {s.classes.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function HistoryTab({ userId, audit }: { userId: string; audit: { rows: UserAuditEntry[]; total: number } }) {
  return (
    <Card data-testid="user-history-tab">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">Historie</CardTitle>
          <CardDescription>Co uživatel udělal a co se s ním dělo (záznamy ze všech oblastí, včetně hromadných akcí).</CardDescription>
        </div>
        <Link href={`/admin/history?user=${userId}`} className="text-sm font-medium underline underline-offset-4" data-testid="user-history">
          Otevřít v Administraci → Historie
        </Link>
      </CardHeader>
      <CardContent>
        {audit.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím žádné záznamy.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Kdo</TableHead>
                  <TableHead>Oblast</TableHead>
                  <TableHead>Popis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.rows.map((r) => (
                  <TableRow key={r.id} data-testid="user-audit-row">
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>{r.actorName ?? "Systém"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.areaLabel}</TableCell>
                    <TableCell>{r.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {audit.total > USER_DETAIL_LIST_LIMIT && (
              <p className="mt-2 text-xs text-muted-foreground">Zobrazeno {USER_DETAIL_LIST_LIMIT} nejnovějších z {audit.total}.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const EMAIL_STATUS: Record<string, string> = {
  SENT: "odesláno",
  FAILED: "selhalo",
  SKIPPED_LIMIT: "přeskočeno (limit)",
  SKIPPED_DISABLED: "přeskočeno (vypnuto)",
};

export function EmailsTab({ emails }: { emails: { rows: UserEmailEntry[]; total: number } }) {
  return (
    <Card data-testid="user-emails">
      <CardHeader>
        <CardTitle className="text-lg">E-maily</CardTitle>
        <CardDescription>Zprávy, které aplikace uživateli poslala nebo se je pokusila poslat.</CardDescription>
      </CardHeader>
      <CardContent>
        {emails.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Uživateli zatím nebyl poslán žádný e-mail.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Upozornění</TableHead>
                  <TableHead>Předmět</TableHead>
                  <TableHead>Stav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.rows.map((r) => (
                  <TableRow key={r.id} data-testid="user-email-row" data-event={r.event} data-status={r.status}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>{r.eventLabel}</TableCell>
                    <TableCell>{r.subject}</TableCell>
                    <TableCell title={r.error ?? undefined}>{EMAIL_STATUS[r.status] ?? r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {emails.total > USER_DETAIL_LIST_LIMIT && (
              <p className="mt-2 text-xs text-muted-foreground">Zobrazeno {USER_DETAIL_LIST_LIMIT} nejnovějších z {emails.total}.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
