"use client";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatTimeRange } from "@/lib/datetime";
import type { MakeupSessionItem } from "@/modules/makeup/types";

/**
 * Výběr předmětů (z povolených na termínu) a poznámky – pro nový zápis i úpravu.
 * `onSubmit` volá příslušnou server action.
 */
export function RegisterDialog({
  session,
  mySubjectIds,
  initialSubjectIds,
  initialNote,
  title,
  submitLabel,
  onSubmit,
  trigger,
}: {
  session: MakeupSessionItem;
  mySubjectIds: string[];
  initialSubjectIds?: string[];
  initialNote?: string | null;
  title: string;
  submitLabel: string;
  // eslint-disable-next-line no-unused-vars
  onSubmit: (subjectIds: string[], note: string) => Promise<unknown>;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Výchozí výběr: jediný povolený předmět, případně jediný „můj“
  const defaults = () => {
    if (initialSubjectIds) return initialSubjectIds;
    if (session.subjects.length === 1) return [session.subjects[0].id];
    const mine = session.subjects.filter((s) => mySubjectIds.includes(s.id));
    return mine.length === 1 ? [mine[0].id] : [];
  };
  const [selected, setSelected] = useState<string[]>(defaults);
  const [note, setNote] = useState(initialNote ?? "");

  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit() {
    setSaving(true);
    try {
      await onSubmit(selected, note);
      toast.success("Uloženo.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span onClick={() => { setSelected(defaults()); setNote(initialNote ?? ""); setOpen(true); }}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {formatTimeRange(session.startsAt, session.endsAt)}, učebna {session.room}, dozor {session.teacherName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Co chcete dopisovat</Label>
              <div className="space-y-1" id="reg-subjects">
                {session.subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" data-subject={s.code} checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                    {s.name}
                    {mySubjectIds.includes(s.id) && <span className="text-xs text-muted-foreground">(váš předmět)</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-note">Poznámka (nepovinná)</Label>
              <Textarea
                id="reg-note"
                rows={2}
                placeholder="např. chci dopsat test z derivací"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Zrušit</Button>
            <Button onClick={submit} disabled={saving || selected.length === 0} data-testid="reg-submit">{submitLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Výběr cílového termínu pro přepis (student) nebo přesun (dozor). */
export function MoveDialog({
  title,
  description,
  candidates,
  onMove,
  trigger,
}: {
  title: string;
  description: string;
  candidates: MakeupSessionItem[];
  // eslint-disable-next-line no-unused-vars
  onMove: (targetSessionId: string) => Promise<unknown>;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState("");

  async function submit() {
    setSaving(true);
    try {
      await onMove(target);
      toast.success("Zápis přesunut.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Přesun se nezdařil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span onClick={() => { setTarget(""); setOpen(true); }}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádný vhodný termín s volným místem.</p>
          ) : (
            <div className="space-y-1" id="move-candidates">
              {candidates.map((s) => (
                <label key={s.id} className="flex items-start gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                  <input type="radio" name="move-target" value={s.id} checked={target === s.id} onChange={() => setTarget(s.id)} />
                  <span>
                    <strong>{formatTimeRange(s.startsAt, s.endsAt)}</strong>, učebna {s.room}, dozor {s.teacherName}
                    <span className="block text-xs text-muted-foreground">
                      obsazeno {s.registeredCount}/{s.capacity} · {s.subjects.map((x) => x.name).join(", ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Zrušit</Button>
            <Button onClick={submit} disabled={saving || !target} data-testid="move-submit">Přesunout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
