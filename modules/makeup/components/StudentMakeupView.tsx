"use client";

import { unwrap, unwrapAsync } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatTimeRange } from "@/lib/datetime";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  cancelMyRegistration,
  moveMyRegistration,
  registerForSession,
  updateMyRegistration,
} from "@/modules/makeup/actions/registrations";
import { ATTENDANCE_LABELS, type MakeupSessionItem, type MyRegistrationItem } from "@/modules/makeup/types";
import { SessionsTable, deadlineText, isPastDeadline } from "./common";
import { MoveDialog, RegisterDialog } from "./RegistrationDialogs";
import { PageHeader } from "@/components/page-header";
import { NativeSelect } from "@/components/ui/native-select";

const overlaps = (a: MakeupSessionItem, b: MakeupSessionItem) =>
  new Date(a.startsAt) < new Date(b.endsAt) && new Date(a.endsAt) > new Date(b.startsAt);

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
  const now = new Date();
  const upcoming = registrations.filter((r) => new Date(r.session.endsAt) >= now);
  const past = registrations.filter((r) => new Date(r.session.endsAt) < now).reverse();
  const activeRegs = upcoming.filter((r) => !r.session.cancelledAt);

  const allSubjects = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => s.subjects.forEach((x) => map.set(x.id, x.name)));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [sessions]);

  const open = sessions.filter((s) => !s.cancelledAt && (!subjectFilter || s.subjects.some((x) => x.id === subjectFilter)));

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

  function actionFor(s: MakeupSessionItem) {
    if (s.myRegistrationId) return <Badge variant="success">Zapsáno</Badge>;
    if (isPastDeadline(s)) return <span className="text-xs text-muted-foreground">po uzávěrce</span>;
    if (s.registeredCount >= s.capacity) return <span className="text-xs text-destructive">plno</span>;
    if (activeRegs.some((r) => overlaps(r.session, s))) return <span className="text-xs text-muted-foreground">kolize s jiným zápisem</span>;
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
        <CardHeader>
          <CardTitle>Moje zápisy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="my-registrations">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nejste zapsaní na žádný termín.</p>}
          {upcoming.map((r) => {
            const s = r.session;
            const locked = !s.cancelledAt && isPastDeadline(s);
            return (
              <div key={r.id} className={`rounded-md border p-3 ${s.cancelledAt ? "border-destructive/50 bg-destructive/5" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">
                      {formatTimeRange(s.startsAt, s.endsAt)}, učebna {s.room}
                      {s.cancelledAt && <Badge variant="destructive" className="ml-2">termín zrušen</Badge>}
                    </div>
                    <div className="text-muted-foreground">
                      Dozor {s.teacherName} · {r.subjects.map((x) => x.name + (x.subjectTeacherName ? ` (${x.subjectTeacherName})` : "")).join(", ")}
                    </div>
                    {s.cancelledAt && s.cancelReason && <div className="text-destructive">Důvod: {s.cancelReason}</div>}
                    {r.note && <div className="text-muted-foreground italic">„{r.note}“</div>}
                    {!s.cancelledAt && (
                      <div className="text-xs text-muted-foreground">Změny do {deadlineText(s.changeDeadlineMinutes)}</div>
                    )}
                  </div>
                  {!locked && (
                    <div className="flex flex-wrap gap-2">
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
                        trigger={<Button size="sm" variant="outline" className="text-destructive">Odhlásit</Button>}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {past.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Proběhlé ({past.length})</summary>
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

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Vypsané termíny</CardTitle>
            <CardDescription>Zvýrazněné jsou předměty vaší třídy.</CardDescription>
          </div>
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
        </CardHeader>
        <CardContent>
          <SessionsTable sessions={open} highlightSubjects={mySubjectIds} action={actionFor} empty="Žádné vypsané termíny." />
        </CardContent>
      </Card>
    </div>
  );
}
