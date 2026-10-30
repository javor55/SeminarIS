"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap, type ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toggleSubjectActive, deleteSubjectPermanently, type SubjectDetail } from "@/modules/core/actions/subjects";

type Mode = "archive" | "restore" | "delete" | null;

/**
 * Archivace, obnovení a trvalé smazání předmětu (jen správce). Dialog vždy ukáže, kde se předmět
 * používá (jádro i všechny moduly). Použitý předmět nejde smazat – nabídne se archivace.
 */
export function SubjectLifecycleDialogs({ subject }: { subject: SubjectDetail }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const used = subject.usage.length > 0;

  async function run(action: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) {
    setBusy(true);
    try {
      unwrap(await action());
      toast.success(success);
      setMode(null);
      if (after) after();
      else router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setBusy(false);
    }
  }

  const usageList = used && (
    <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" data-testid="subject-usage">
      {subject.usage.map((u) => (
        <li key={u.id} data-usage={u.id} className="flex justify-between gap-3">
          <span>{u.href ? <Link href={u.href} className="underline underline-offset-2">{u.label}</Link> : u.label}</span>
          <strong>{u.count}</strong>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Button size="sm" variant={subject.isActive ? "destructive" : "default"} onClick={() => setMode(subject.isActive ? "archive" : "restore")} data-testid="subject-archive">
        {subject.isActive ? "Archivovat" : "Obnovit"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setMode("delete")} data-testid="subject-delete">
        Smazat
      </Button>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent data-testid="subject-lifecycle-dialog" data-mode={mode ?? undefined}>
          {mode === "archive" && (
            <>
              <DialogHeader>
                <DialogTitle>Archivovat předmět?</DialogTitle>
                <DialogDescription>
                  Předmět „{subject.name}“ se přestane nabízet v nových zápisech a dopisování, ale jeho data zůstanou zachována.
                  {used ? " Nyní se používá:" : " Zatím se nikde nepoužívá."}
                </DialogDescription>
              </DialogHeader>
              {usageList}
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Zrušit</Button>
                <Button variant="destructive" disabled={busy} data-testid="subject-confirm" onClick={() => run(() => toggleSubjectActive(subject.id), "Předmět byl archivován.")}>
                  Archivovat
                </Button>
              </DialogFooter>
            </>
          )}
          {mode === "restore" && (
            <>
              <DialogHeader>
                <DialogTitle>Obnovit předmět?</DialogTitle>
                <DialogDescription>Předmět „{subject.name}“ se opět stane aktivním.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Zrušit</Button>
                <Button disabled={busy} data-testid="subject-confirm" onClick={() => run(() => toggleSubjectActive(subject.id), "Předmět byl obnoven.")}>
                  Obnovit
                </Button>
              </DialogFooter>
            </>
          )}
          {mode === "delete" && used && (
            <>
              <DialogHeader>
                <DialogTitle>Předmět nelze smazat</DialogTitle>
                <DialogDescription>
                  Předmět „{subject.name}“ se používá, trvalé smazání by zničilo tato data.
                  {subject.isActive ? " Archivujte ho, ať se přestane nabízet, nebo nejdřív použití odstraňte." : " Nejdřív použití odstraňte."}
                </DialogDescription>
              </DialogHeader>
              {usageList}
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)}>Zavřít</Button>
                {subject.isActive && (
                  <Button variant="destructive" disabled={busy} data-testid="subject-archive-instead" onClick={() => run(() => toggleSubjectActive(subject.id), "Předmět byl archivován.")}>
                    Archivovat místo toho
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
          {mode === "delete" && !used && (
            <>
              <DialogHeader>
                <DialogTitle>Trvale smazat předmět?</DialogTitle>
                <DialogDescription>
                  Předmět „{subject.name}“ se nikde nepoužívá. Smazání je nevratné.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Zrušit</Button>
                <Button variant="destructive" disabled={busy} data-testid="subject-confirm" onClick={() => run(() => deleteSubjectPermanently(subject.id), "Předmět byl trvale smazán.", () => router.push("/subjects"))}>
                  Trvale smazat
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
