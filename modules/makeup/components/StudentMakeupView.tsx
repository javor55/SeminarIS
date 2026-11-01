"use client";

import { unwrap, unwrapAsync } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { formatDateTime, formatTimeRange } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  cancelMyRegistration,
  moveMyRegistration,
  registerForSession,
  updateMyRegistration,
} from "@/modules/makeup/actions/registrations";
import { ATTENDANCE_LABELS, type MakeupSessionItem, type MyRegistrationItem } from "@/modules/makeup/types";
import { SubjectBadges, deadlineText, isPastDeadline } from "./common";
import { MoveDialog, RegisterDialog } from "./RegistrationDialogs";
import { PageHeader } from "@/components/page-header";

const overlaps = (a: MakeupSessionItem, b: MakeupSessionItem) =>
  new Date(a.startsAt) < new Date(b.endsAt) && new Date(a.endsAt) > new Date(b.startsAt);

const freeText = (s: MakeupSessionItem) => {
  const free = Math.max(s.capacity - s.registeredCount, 0);
  return free === 0 ? "plno" : `${free} ${plural(free, "volné místo", "volná místa", "volných míst")}`;
};

/** Textový stav místo tlačítka (vysoký jako tlačítko, ať karta drží rytmus). */
const stateClass = "flex min-h-11 items-center justify-center rounded-md border px-3 text-center text-sm";

/**
 * Student (F12): nahoře „Moje přihlášky“ (termín, učebna, dozor, předměty, poznámka, akce), pod tím „Který předmět
 * potřebujete dopsat?“ – čipy s předměty z budoucích termínů; po výběru jen termíny s tímto předmětem. Přihlášení je
 * v dialogu s předvyplněným předmětem a poznámkou pro vyučujícího. Proběhlé zápisy jsou sbalené dole.
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
  const now = new Date();
  const upcoming = registrations.filter((r) => new Date(r.session.endsAt) >= now);
  const past = registrations.filter((r) => new Date(r.session.endsAt) < now).reverse();
  const activeRegs = upcoming.filter((r) => !r.session.cancelledAt);
  const regBySession = useMemo(() => new Map(upcoming.map((r) => [r.sessionId, r])), [upcoming]);

  // Termíny ze serveru jsou nadcházející; zrušené tu jsou jen ty, kde je student zapsaný (ty jsou mezi přihláškami)
  const available = useMemo(() => sessions.filter((s) => !s.cancelledAt), [sessions]);

  // Čipy: předměty z budoucích termínů, předměty studenta (jeho třída a ročník) jako první
  const chips = useMemo(() => {
    const map = new Map<string, string>();
    available.forEach((s) => s.subjects.forEach((x) => map.set(x.id, x.name)));
    return [...map.entries()]
      .map(([id, name]) => ({ id, name, mine: mySubjectIds.includes(id) }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, "cs"));
  }, [available, mySubjectIds]);

  // Jediný předmět se vybere sám
  const [picked, setPicked] = useState<string | null>(null);
  const subjectId = picked ?? (chips.length === 1 ? chips[0].id : null);
  const subject = chips.find((c) => c.id === subjectId) ?? null;
  const terms = subject ? available.filter((s) => s.subjects.some((x) => x.id === subject.id)) : [];

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

  function registrationActions(r: MyRegistrationItem) {
    const s = r.session;
    const locked = !s.cancelledAt && isPastDeadline(s);
    if (locked) return <p className={cn(stateClass, "text-muted-foreground")}>Přihlášeni, změny jsou už uzavřeny</p>;
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!s.cancelledAt && (
          <RegisterDialog
            session={s}
            mySubjectIds={mySubjectIds}
            initialSubjectIds={r.subjects.map((x) => x.id)}
            initialNote={r.note}
            title="Upravit zápis"
            submitLabel="Uložit"
            onSubmit={(ids, note) => unwrapAsync(updateMyRegistration(r.id, ids, note))}
            trigger={<Button variant="outline" className="min-h-11 w-full sm:w-auto">Upravit</Button>}
          />
        )}
        <MoveDialog
          title="Přepsat na jiný termín"
          description="Zápis i se zvolenými předměty a poznámkou se přesune na vybraný termín."
          candidates={moveCandidates(r)}
          onMove={(target) => unwrapAsync(moveMyRegistration(r.id, target))}
          trigger={<Button variant="outline" className="min-h-11 w-full sm:w-auto">Přepsat</Button>}
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
          trigger={<Button variant="outline" className="min-h-11 w-full text-danger sm:w-auto">Odhlásit se</Button>}
        />
      </div>
    );
  }

  /** Tlačítko nebo stav u termínu nabízeného pro vybraný předmět. */
  function termAction(s: MakeupSessionItem) {
    if (regBySession.has(s.id)) {
      return (
        <p className={cn(stateClass, "border-success/50 bg-success/10 font-semibold text-success")}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> Jste přihlášeni
        </p>
      );
    }
    if (isPastDeadline(s)) return <p className={cn(stateClass, "text-muted-foreground")}>Po uzávěrce</p>;
    if (s.registeredCount >= s.capacity) return <p className={cn(stateClass, "bg-muted text-muted-foreground")}>Termín je plný</p>;
    if (activeRegs.some((o) => overlaps(o.session, s))) return <p className={cn(stateClass, "text-muted-foreground")}>Kolize s jiným zápisem</p>;
    return (
      <RegisterDialog
        session={s}
        mySubjectIds={mySubjectIds}
        initialSubjectIds={subject ? [subject.id] : undefined}
        title="Přihlásit se na dopisování?"
        submitLabel="Potvrdit přihlášku"
        onSubmit={(ids, note) => unwrapAsync(registerForSession(s.id, ids, note))}
        trigger={<Button className="min-h-11 w-full">Přihlásit se</Button>}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dopisování písemek"
        description="Přihlaste se na termín, kdy chcete zameškanou písemku dopsat. Přihlášení, odhlášení i přepis jsou možné do uzávěrky termínu."
      />

      <section className="space-y-3" aria-labelledby="my-regs-title" data-testid="my-registrations">
        <h2 id="my-regs-title" className="text-lg font-semibold">Moje přihlášky</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground" data-testid="no-registrations">
            Zatím nejste přihlášeni na žádný termín.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((r) => {
              const s = r.session;
              return (
                <div
                  key={r.id}
                  data-registration={r.id}
                  data-session-id={s.id}
                  data-cancelled={s.cancelledAt ? "true" : "false"}
                  className={cn(
                    "space-y-3 rounded-xl border bg-card p-4 shadow-sm",
                    s.cancelledAt ? "border-danger/40 bg-danger/5" : "border-success/60 bg-success/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold">{formatTimeRange(s.startsAt, s.endsAt)}</div>
                      <div className="text-sm text-muted-foreground">
                        učebna {s.room} · dozor {s.teacherName}
                      </div>
                    </div>
                    {s.cancelledAt ? <Badge variant="danger">termín zrušen</Badge> : <Badge variant="success">Zapsáno</Badge>}
                  </div>
                  {s.cancelledAt && s.cancelReason && <div className="text-sm text-danger">Důvod: {s.cancelReason}</div>}
                  {s.cancelledAt && <div className="text-sm text-danger">Termín byl zrušen, přepište se na jiný nebo se odhlaste.</div>}
                  <div className="space-y-1 text-sm" data-testid="my-subjects">
                    <div>{r.subjects.map((x) => x.name + (x.subjectTeacherName ? ` (${x.subjectTeacherName})` : "")).join(", ")}</div>
                    {r.note && <div className="rounded-md border bg-background px-3 py-2 italic text-muted-foreground">Poznámka: „{r.note}“</div>}
                  </div>
                  {!s.cancelledAt && <div className="text-xs text-muted-foreground">Změny a odhlášení jsou možné do {formatDateTime(s.changeDeadline)}.</div>}
                  {registrationActions(r)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="sign-up-title">
        <h2 id="sign-up-title" className="text-lg font-semibold">Přihlásit se na dopisování</h2>
        {chips.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground" data-testid="no-sessions">
            Teď nejsou vypsané žádné termíny dopisování.
          </p>
        ) : (
          <>
            <p className="font-medium">Který předmět potřebujete dopsat?</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Předměty" data-testid="subject-chips">
              {chips.map((c) => (
                <Chip
                  key={c.id}
                  pressed={c.id === subjectId}
                  data-subject-chip={c.id}
                  data-mine={c.mine ? "true" : "false"}
                  className="min-h-11 gap-1.5 px-4 md:min-h-9"
                  onClick={() => setPicked(c.id === subjectId ? "" : c.id)}
                >
                  {c.mine && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
                  {c.name}
                </Chip>
              ))}
            </div>
            {mySubjectIds.length > 0 && chips.some((c) => c.mine) && (
              <p className="text-xs text-muted-foreground">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground align-middle" aria-hidden="true" />
                Předměty vašeho ročníku a třídy jsou první.
              </p>
            )}

            {!subject ? (
              <p className="text-sm text-muted-foreground" data-testid="pick-subject-hint">
                Vyberte předmět a ukážou se jen termíny, na kterých ho můžete dopsat.
              </p>
            ) : (
              <div className="space-y-3" data-testid="terms">
                <p className="text-sm text-muted-foreground">
                  Termíny pro předmět <strong className="text-foreground">{subject.name}</strong>:
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {terms.map((s) => {
                    const r = regBySession.get(s.id);
                    return (
                      <div
                        key={s.id}
                        data-session={s.id}
                        data-registered={r ? "true" : "false"}
                        className={cn("space-y-3 rounded-xl border bg-card p-4 shadow-sm", r && "border-success/60 bg-success/5")}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold">{formatTimeRange(s.startsAt, s.endsAt)}</div>
                          <div className="text-sm text-muted-foreground">
                            učebna {s.room} · dozor {s.teacherName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className={s.registeredCount >= s.capacity ? "font-semibold text-danger" : ""} data-testid="capacity">
                              {freeText(s)}
                            </span>
                            {" · "}přihlásit se lze {s.changeDeadlineMinutes > 0 ? "nejpozději " : ""}{deadlineText(s.changeDeadlineMinutes)}
                          </div>
                          {s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}
                        </div>
                        <SubjectBadges subjects={s.subjects} highlight={[subject.id]} />
                        {termAction(s)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {past.length > 0 && (
        <details className="text-sm" data-testid="past-registrations">
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
    </div>
  );
}
