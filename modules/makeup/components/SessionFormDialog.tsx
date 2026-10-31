"use client";

import { unwrap } from "@/lib/action-result";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSessions, getSessionFormOptions, updateSession } from "@/modules/makeup/actions/sessions";
import { DEADLINE_OPTIONS, type MakeupSessionItem } from "@/modules/makeup/types";
import { SubjectPicker } from "./SubjectPicker";
import { deadlineText } from "./common";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";

type Options = Awaited<ReturnType<typeof getSessionFormOptions>>;

const pad = (n: number) => String(n).padStart(2, "0");
// Datum a čas v místním čase prohlížeče (formát pro <input type="date|time">)
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Výskyty řady: stejný den v týdnu a čas, týdně až do `until` včetně (počítá se v místním čase). */
function buildOccurrences(date: string, from: string, to: string, repeat: boolean, until: string) {
  const first = new Date(`${date}T${from}`);
  const firstEnd = new Date(`${date}T${to}`);
  if (isNaN(first.getTime()) || isNaN(firstEnd.getTime())) throw new Error("Zadejte datum a čas.");
  const result = [{ startsAt: first.toISOString(), endsAt: firstEnd.toISOString() }];
  if (repeat) {
    const last = new Date(`${until}T23:59`);
    if (isNaN(last.getTime())) throw new Error("Zadejte, do kdy se má termín opakovat.");
    for (let week = 1; ; week++) {
      const start = new Date(first);
      start.setDate(start.getDate() + 7 * week);
      if (start > last) break;
      const end = new Date(firstEnd);
      end.setDate(end.getDate() + 7 * week);
      result.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
      if (result.length > 60) throw new Error("Řada může mít nejvýš 60 termínů.");
    }
  }
  return result;
}

export function SessionFormDialog({ session, trigger }: { session?: MakeupSessionItem; trigger: ReactNode }) {
  const router = useRouter();
  const isEdit = !!session;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);

  const start = session ? new Date(session.startsAt) : null;
  const end = session ? new Date(session.endsAt) : null;
  const [teacherId, setTeacherId] = useState(session?.teacherId ?? "");
  const [date, setDate] = useState(start ? toDateInput(start) : "");
  const [from, setFrom] = useState(start ? toTimeInput(start) : "14:00");
  const [to, setTo] = useState(end ? toTimeInput(end) : "14:45");
  const [room, setRoom] = useState(session?.room ?? "");
  const [capacity, setCapacity] = useState(String(session?.capacity ?? 10));
  const [subjectIds, setSubjectIds] = useState<string[]>(session?.subjects.map((s) => s.id) ?? []);
  const [deadline, setDeadline] = useState(String(session?.changeDeadlineMinutes ?? 60));
  const [note, setNote] = useState(session?.note ?? "");
  const [repeat, setRepeat] = useState(false);
  const [until, setUntil] = useState("");

  async function onOpenChange(o: boolean) {
    setOpen(o);
    if (o && !options) {
      try {
        const opts = await getSessionFormOptions();
        setOptions(opts);
        if (!teacherId) setTeacherId(opts.currentUserId);
        if (!isEdit) {
          setCapacity(String(opts.defaults.capacity));
          setDeadline(String(opts.defaults.changeDeadlineMinutes));
        }
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  }

  const toggleSubject = (id: string) =>
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submit() {
    setSaving(true);
    try {
      const base = {
        teacherId: teacherId || undefined,
        room,
        capacity: Number(capacity),
        subjectIds,
        changeDeadlineMinutes: Number(deadline),
        note,
      };
      if (isEdit) {
        const [occ] = buildOccurrences(date, from, to, false, "");
        unwrap(await updateSession(session.id, { ...base, ...occ }));
        toast.success("Termín uložen.");
      } else {
        const count = unwrap(await createSessions({ ...base, occurrences: buildOccurrences(date, from, to, repeat, until) }));
        toast.success(count > 1 ? `Vypsáno ${count} termínů.` : "Termín vypsán.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Uložení se nezdařilo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span onClick={() => onOpenChange(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Upravit termín" : "Nový termín dopisování"}</DialogTitle>
            <DialogDescription>
              {isEdit && session.registeredCount > 0
                ? `Na termínu je zapsáno ${session.registeredCount} studentů – změnu uvidí ve svých zápisech.`
                : "Termín je váš čas a místo; studenti si při zápisu vyberou předmět z povolených."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {options?.canChooseTeacher && (
              <div className="space-y-1">
                <Label htmlFor="ms-teacher">Dozor</Label>
                <NativeSelect id="ms-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  {options.teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="ms-date">Datum</Label>
                <Input id="ms-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ms-from">Od</Label>
                <Input id="ms-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ms-to">Do</Label>
                <Input id="ms-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            {!isEdit && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Checkbox id="ms-repeat" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} label="Opakovat každý týden do" />
                <Input
                  id="ms-until"
                  type="date"
                  className="w-[170px]"
                  value={until}
                  disabled={!repeat}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="ms-room">Učebna</Label>
                <Input id="ms-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="např. 204" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ms-capacity">Kapacita</Label>
                <Input id="ms-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Předměty, které lze dopisovat</Label>
              {!options ? (
                <p className="text-sm text-muted-foreground">Načítám…</p>
              ) : options.subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nejsou založené žádné předměty (Škola → Předměty).</p>
              ) : (
                <SubjectPicker
                  subjects={options.subjects}
                  mineIds={options.teacherSubjects[teacherId] ?? []}
                  selected={subjectIds}
                  onToggle={toggleSubject}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-deadline">Zápis, odhlášení a přepis nejpozději</Label>
              <NativeSelect id="ms-deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)}>
                {DEADLINE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{deadlineText(m)}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-note">Poznámka pro studenty (nepovinná)</Label>
              <Textarea id="ms-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Zrušit</Button>
            <Button onClick={submit} disabled={saving} data-testid="ms-submit">
              {saving ? "Ukládám…" : isEdit ? "Uložit" : "Vypsat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
