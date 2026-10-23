"use client";

import { unwrap, unwrapAsync } from "@/lib/action-result";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeRange } from "@/lib/datetime";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import {
  cancelSession,
  deleteSession,
  moveRegistration,
  removeRegistration,
  setAttendance,
} from "@/modules/makeup/actions/sessions";
import {
  ATTENDANCE_LABELS,
  type MakeupAttendanceValue,
  type MakeupRegistrationItem,
  type MakeupSessionItem,
} from "@/modules/makeup/types";
import { SubjectBadges, deadlineText } from "./common";
import { SessionFormDialog } from "./SessionFormDialog";
import { MoveDialog } from "./RegistrationDialogs";

export function SessionDetailView({
  session,
  registrations,
  otherSessions,
}: {
  session: MakeupSessionItem;
  registrations: MakeupRegistrationItem[];
  // nadcházející termíny pro přesun studenta
  otherSessions: MakeupSessionItem[];
}) {
  const router = useRouter();
  const started = new Date(session.startsAt) <= new Date();
  const cancelled = !!session.cancelledAt;

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    }
  }

  const candidatesFor = (r: MakeupRegistrationItem) =>
    otherSessions.filter(
      (s) =>
        s.id !== session.id &&
        !s.cancelledAt &&
        new Date(s.startsAt) > new Date() &&
        s.registeredCount < s.capacity &&
        r.subjects.every((x) => s.subjects.some((y) => y.id === x.id))
    );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="print:hidden">
        <Link href="/makeup" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Zpět na Dopisování
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Dopisování {formatTimeRange(session.startsAt, session.endsAt)}
            {cancelled && <Badge variant="destructive" className="ml-2 align-middle">zrušeno</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1">
            Učebna {session.room} · dozor {session.teacherName} · zapsáno {session.registeredCount}/{session.capacity} ·
            změny do {deadlineText(session.changeDeadlineMinutes)}
          </p>
          <div className="mt-2"><SubjectBadges subjects={session.subjects} /></div>
          {session.note && <p className="text-sm mt-2">{session.note}</p>}
          {cancelled && session.cancelReason && <p className="text-sm text-destructive mt-2">Důvod zrušení: {session.cancelReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> Tisk
          </Button>
          {!cancelled && (
            <SessionFormDialog session={session} trigger={<Button variant="outline" data-testid="edit-session">Upravit</Button>} />
          )}
          {!cancelled && <CancelSessionDialog session={session} onDone={() => router.refresh()} />}
          {registrations.length === 0 && (
            <ConfirmAction
              title="Smazat termín?"
              description="Na termínu nikdo není zapsaný, termín se smaže úplně."
              actionLabel="Smazat"
              onConfirm={async () => {
                try {
                  unwrap(await deleteSession(session.id));
                  toast.success("Termín smazán.");
                  router.push("/makeup");
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              trigger={<Button variant="outline" className="text-destructive">Smazat</Button>}
            />
          )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Zapsaní studenti</CardTitle>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím nikdo.</p>
          ) : (
            <Table data-testid="registrations">
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Třída</TableHead>
                  <TableHead>Dopisuje (vyučující)</TableHead>
                  <TableHead>Poznámka</TableHead>
                  <TableHead>Docházka</TableHead>
                  <TableHead className="print:hidden" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((r) => (
                  <TableRow key={r.id} data-student={r.studentName}>
                    <TableCell className="font-medium">{r.studentName}</TableCell>
                    <TableCell>{r.classLabel ?? "—"}</TableCell>
                    <TableCell>
                      {r.subjects.map((x) => (
                        <div key={x.id}>
                          {x.name}
                          <span className="text-muted-foreground"> ({x.subjectTeacherName ?? "vyučující neuveden"})</span>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.note}</TableCell>
                    <TableCell>
                      {started && !cancelled ? (
                        <select
                          aria-label={`Docházka – ${r.studentName}`}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm print:hidden"
                          value={r.attendance}
                          onChange={(e) =>
                            run(() => unwrapAsync(setAttendance(r.id, e.target.value as MakeupAttendanceValue)), "Docházka uložena.")
                          }
                        >
                          {(Object.keys(ATTENDANCE_LABELS) as MakeupAttendanceValue[]).map((a) => (
                            <option key={a} value={a}>{ATTENDANCE_LABELS[a]}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{ATTENDANCE_LABELS[r.attendance]}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap print:hidden">
                      <MoveDialog
                        title={`Přesunout – ${r.studentName}`}
                        description="Student se přesune i se zvolenými předměty a poznámkou."
                        candidates={candidatesFor(r)}
                        onMove={(target) => unwrapAsync(moveRegistration(r.id, target))}
                        trigger={<Button size="sm" variant="outline" className="mr-2">Přesunout</Button>}
                      />
                      <ConfirmAction
                        title={`Odepsat ${r.studentName}?`}
                        description="Student bude z termínu odepsán."
                        actionLabel="Odepsat"
                        onConfirm={() => run(() => unwrapAsync(removeRegistration(r.id)), "Student odepsán.")}
                        trigger={<Button size="sm" variant="outline" className="text-destructive">Odepsat</Button>}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CancelSessionDialog({ session, onDone }: { session: MakeupSessionItem; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [wholeSeries, setWholeSeries] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const count = unwrap(await cancelSession(session.id, reason, wholeSeries));
      toast.success(count > 1 ? `Zrušeno ${count} termínů.` : "Termín zrušen.");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error((err as Error).message || "Zrušení se nezdařilo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>Zrušit termín</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Zrušit termín?</DialogTitle>
            <DialogDescription>
              Zapsaní studenti ({session.registeredCount}) uvidí termín jako zrušený a mohou se přepsat jinam.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cancel-reason">Důvod (uvidí studenti)</Label>
              <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="např. nemoc" />
            </div>
            {session.seriesId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={wholeSeries} onChange={(e) => setWholeSeries(e.target.checked)} />
                Zrušit i všechny další termíny této opakované řady
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Zpět</Button>
            <Button variant="destructive" onClick={submit} disabled={saving} data-testid="cancel-submit">Zrušit termín</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
