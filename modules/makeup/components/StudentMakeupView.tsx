"use client";

import { unwrap, unwrapAsync } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeRange } from "@/lib/datetime";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  cancelMyRegistration,
  moveMyRegistration,
  registerForSession,
  updateMyRegistration,
} from "@/modules/makeup/actions/registrations";
import { ATTENDANCE_LABELS, type MakeupSessionItem, type MyRegistrationItem } from "@/modules/makeup/types";
import { CapacityBadge, SubjectBadges, deadlineText, isPastDeadline } from "./common";
import { MoveDialog, RegisterDialog } from "./RegistrationDialogs";
import { MobileCard, MobileCardField, MobileCardList, ResponsiveView } from "@/components/ui/mobile-card";
import { PageHeader } from "@/components/page-header";
import { NativeSelect } from "@/components/ui/native-select";

/** Textový stav místo tlačítka; na mobilní kartě vycentrovaný přes celou šířku. */
const stateText = (stacked: boolean, color = "text-muted-foreground") =>
  stacked ? `block text-center text-sm ${color}` : `text-xs ${color}`;

const overlaps = (a: MakeupSessionItem, b: MakeupSessionItem) =>
  new Date(a.startsAt) < new Date(b.endsAt) && new Date(a.endsAt) > new Date(b.startsAt);

/**
 * Student: jedna tabulka termínů ve stylu zápisu seminářů. Nadcházející nezrušené termíny
 * a termíny, kde je zapsaný (i zrušené, zvýrazněné); proběhlé zápisy jsou sbalené pod tabulkou.
 */
export function StudentMakeupView({
  sessions,
  registrations,
  mySubjectIds,
}: {
  sessions: MakeupSessionItem[];
  registrations: MyRegistrationItem[];
  mySubjectIds: string[];
}) {
  const router = useRouter();
  const [subjectFilter, setSubjectFilter] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const now = new Date();
  const upcoming = registrations.filter((r) => new Date(r.session.endsAt) >= now);
  const past = registrations.filter((r) => new Date(r.session.endsAt) < now).reverse();
  const activeRegs = upcoming.filter((r) => !r.session.cancelledAt);
  const regBySession = useMemo(() => new Map(upcoming.map((r) => [r.sessionId, r])), [upcoming]);

  const allSubjects = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => s.subjects.forEach((x) => map.set(x.id, x.name)));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [sessions]);

  // Termíny ze serveru jsou nadcházející; zrušené tu jsou jen ty, kde je student zapsaný
  const rows = sessions.filter(
    (s) => (!subjectFilter || s.subjects.some((x) => x.id === subjectFilter)) && (!onlyMine || s.myRegistrationId)
  );

  // Kam se lze přepsat: volné místo, před uzávěrkou, povoluje zvolené předměty, bez kolize s jinými zápisy
  const moveCandidates = (r: MyRegistrationItem) =>
    sessions.filter(
      (s) =>
        s.id !== r.sessionId &&
        !s.cancelledAt &&
        !s.myRegistrationId &&
        !isPastDeadline(s) &&
        s.registeredCount < s.capacity &&
        r.subjects.every((x) => s.subjects.some((y) => y.id === x.id)) &&
        !activeRegs.some((o) => o.id !== r.id && overlaps(o.session, s))
    );

  function actionFor(s: MakeupSessionItem, r: MyRegistrationItem | undefined, stacked = false) {
    if (r) {
      const locked = !s.cancelledAt && isPastDeadline(s);
      if (locked) return <span className={stateText(stacked)}>zapsáno, změny uzavřeny</span>;
      return (
        <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap justify-end gap-2"}>
          {!s.cancelledAt && (
            <RegisterDialog
              session={s}
              mySubjectIds={mySubjectIds}
              initialSubjectIds={r.subjects.map((x) => x.id)}
              initialNote={r.note}
              title="Upravit zápis"
              submitLabel="Uložit"
              onSubmit={(ids, note) => unwrapAsync(updateMyRegistration(r.id, ids, note))}
              trigger={<Button size="sm" variant="outline">Upravit</Button>}
            />
          )}
          <MoveDialog
            title="Přepsat na jiný termín"
            description="Zápis i se zvolenými předměty a poznámkou se přesune na vybraný termín."
            candidates={moveCandidates(r)}
            onMove={(target) => unwrapAsync(moveMyRegistration(r.id, target))}
            trigger={<Button size="sm" variant="outline">Přepsat</Button>}
          />
          <ConfirmAction
            title="Odhlásit se z termínu?"
            description={`${formatTimeRange(s.startsAt, s.endsAt)}, učebna ${s.room}.`}
            actionLabel="Odhlásit"
            onConfirm={async () => {
              try {
                unwrap(await cancelMyRegistration(r.id));
                toast.success("Odhlášeno.");
                router.refresh();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
            trigger={<Button size="sm" variant="outline" className="text-danger">Odhlásit</Button>}
          />
        </div>
      );
    }
    if (isPastDeadline(s)) return <span className={stateText(stacked)}>po uzávěrce</span>;
    if (s.registeredCount >= s.capacity) return <span className={stateText(stacked, "text-danger")}>plno</span>;
    if (activeRegs.some((o) => overlaps(o.session, s))) return <span className={stateText(stacked)}>kolize s jiným zápisem</span>;
    return (
      <RegisterDialog
        session={s}
        mySubjectIds={mySubjectIds}
        title="Zápis na dopisování"
        submitLabel="Zapsat se"
        onSubmit={(ids, note) => unwrapAsync(registerForSession(s.id, ids, note))}
        trigger={<Button size="sm">Zapsat se</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dopisování písemek"
        description="Vyberte termín a předmět, který potřebujete dopsat. Zápis, odhlášení i přepis jsou možné do uzávěrky termínu."
      />

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Termíny</CardTitle>
            <CardDescription>
              Zvýrazněné řádky jsou termíny, na které jste zapsaní. Zvýrazněné předměty jsou předměty vašeho ročníku a třídy.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="subject-filter" className="text-xs">Předmět</Label>
              <NativeSelect
                id="subject-filter"
                className="w-[200px]"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
              >
                <option value="">Všechny</option>
                {allSubjects.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2 pb-1.5">
              <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
              <Label htmlFor="only-mine" className="text-sm">Jen moje zápisy</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {onlyMine ? "Nejste zapsaní na žádný termín." : "Žádné vypsané termíny."}
            </p>
          ) : (
            <ResponsiveView
              desktop={
            <Table data-testid="makeup-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Termín</TableHead>
                  <TableHead>Učebna</TableHead>
                  <TableHead>Dozor</TableHead>
                  <TableHead>Předměty</TableHead>
                  <TableHead>Obsazeno</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const r = regBySession.get(s.id);
                  const rowClass = s.cancelledAt
                    ? "bg-destructive/5"
                    : r
                      ? "bg-success/10"
                      : "";
                  return (
                    <TableRow key={s.id} data-session={s.id} data-registered={r ? "true" : "false"} className={rowClass}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatTimeRange(s.startsAt, s.endsAt)}
                        {s.cancelledAt && <Badge variant="destructive" className="ml-2">termín zrušen</Badge>}
                        {r && !s.cancelledAt && <Badge variant="success" className="ml-2">Zapsáno</Badge>}
                        {s.cancelledAt && s.cancelReason && (
                          <div className="text-xs font-normal text-danger">Důvod: {s.cancelReason}</div>
                        )}
                        {s.note && <div className="text-xs text-muted-foreground font-normal">{s.note}</div>}
                        {!s.cancelledAt && (
                          <div className="text-xs text-muted-foreground font-normal">Změny do {deadlineText(s.changeDeadlineMinutes)}</div>
                        )}
                      </TableCell>
                      <TableCell>{s.room}</TableCell>
                      <TableCell className="whitespace-nowrap">{s.teacherName}</TableCell>
                      <TableCell>
                        {r ? (
                          <div className="space-y-1 text-sm" data-testid="my-subjects">
                            <div>
                              {r.subjects.map((x) => x.name + (x.subjectTeacherName ? ` (${x.subjectTeacherName})` : "")).join(", ")}
                            </div>
                            {r.note && <div className="italic text-muted-foreground">„{r.note}“</div>}
                          </div>
                        ) : (
                          <SubjectBadges subjects={s.subjects} highlight={mySubjectIds} />
                        )}
                      </TableCell>
                      <TableCell><CapacityBadge s={s} /></TableCell>
                      <TableCell className="text-right whitespace-nowrap">{actionFor(s, r)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              }
              mobile={(
    <MobileCardList data-testid="makeup-cards">
      {rows.map((s) => {
        const r = regBySession.get(s.id);
        return (
          <MobileCard
            key={s.id}
            data-session={s.id}
            data-registered={r ? "true" : "false"}
            className={s.cancelledAt ? "bg-destructive/5" : r ? "border-success bg-success/10" : undefined}
            title={formatTimeRange(s.startsAt, s.endsAt)}
            badge={
              s.cancelledAt ? (
                <Badge variant="destructive">termín zrušen</Badge>
              ) : r ? (
                <Badge variant="success">Zapsáno</Badge>
              ) : undefined
            }
            actions={actionFor(s, r, true)}
          >
            <div className="space-y-0.5 text-xs">
              {s.cancelledAt && s.cancelReason && <div className="text-danger">Důvod: {s.cancelReason}</div>}
              {s.note && <div className="text-muted-foreground">{s.note}</div>}
              {!s.cancelledAt && <div className="text-muted-foreground">Změny do {deadlineText(s.changeDeadlineMinutes)}</div>}
            </div>
            <MobileCardField label="Učebna">{s.room}</MobileCardField>
            <MobileCardField label="Dozor">{s.teacherName}</MobileCardField>
            <MobileCardField label="Obsazeno"><CapacityBadge s={s} /></MobileCardField>
            {r ? (
              <div className="space-y-1 text-sm" data-testid="my-subjects">
                <div>
                  {r.subjects.map((x) => x.name + (x.subjectTeacherName ? ` (${x.subjectTeacherName})` : "")).join(", ")}
                </div>
                {r.note && <div className="italic text-muted-foreground">„{r.note}“</div>}
              </div>
            ) : (
              <SubjectBadges subjects={s.subjects} highlight={mySubjectIds} />
            )}
          </MobileCard>
        );
      })}
    </MobileCardList>
  )}
            />
          )}

          {past.length > 0 && (
            <details className="mt-4 text-sm" data-testid="past-registrations">
              <summary className="cursor-pointer text-muted-foreground">Proběhlé zápisy ({past.length})</summary>
              <ul className="mt-2 space-y-1">
                {past.map((r) => (
                  <li key={r.id}>
                    {formatTimeRange(r.session.startsAt, r.session.endsAt)} – {r.subjects.map((x) => x.name).join(", ")}:{" "}
                    <strong>{r.session.cancelledAt ? "termín zrušen" : ATTENDANCE_LABELS[r.attendance]}</strong>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
