"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Radio } from "@/components/ui/checkbox";
import { formatDateTime, formatRemaining } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EnrollmentWindowWithBlocks, User } from "@/lib/types";
import { enrollStudent, switchEnrollment, unenrollStudent } from "@/modules/seminars/actions/enrollment";
import { ParticipantsDialog } from "@/modules/seminars/components/occurrences/ParticipantsDialog";
import {
  blockStateText,
  buildBlocks,
  deadlineLine,
  freeText,
  nextBlockToOpen,
  type BlockModel,
  type OptionModel,
} from "@/modules/seminars/components/student/student-blocks";
import { checkStudentCanChange } from "@/modules/seminars/window-rules";
import { windowPhase } from "@/modules/seminars/window-phase";
import { blockRulesLabel } from "@/modules/seminars/window-rules";

// Zápis studenta po krocích (F12): bloky jsou sbalitelné karty s číslem kroku, rozbalený je ten, který je na řadě.
// Výskyty mají název s odkazem na detail předmětu, učitele a volná místa. Tlačítka: Vybrat / Vyměnit (jedna
// transakce, `switchEnrollment`) / Odepsat (podle pravidel okna). Host vidí nabídku jen ke čtení. Všechna pravidla
// (kapacita, publikum, počet zápisů v bloku, termín změn) vynucuje server, UI je jen zobrazuje.

type Props = {
  enrollmentWindow: EnrollmentWindowWithBlocks;
  currentUser: User;
  /** Student smí zapisovat (host ne) */
  canEnroll: boolean;
};

type ActionResult = { error?: string } | undefined;

export function StudentEnrollmentView({ enrollmentWindow: ew, currentUser, canEnroll }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const info = useMemo(() => windowPhase(ew, now), [ew, now]);
  const interactive = canEnroll && info.phase === "OPEN";
  const blocks = useMemo(() => buildBlocks(ew, currentUser.id), [ew, currentUser.id]);
  const change = useMemo(
    () => checkStudentCanChange({ allowSelfUnenroll: ew.allowSelfUnenroll ?? true, changesUntil: ew.changesUntil ?? null, endsAt: ew.endsAt }, now),
    [ew.allowSelfUnenroll, ew.changesUntil, ew.endsAt, now]
  );
  const namesVisible = ew.resultsVisibility === "NAMES";

  // Rozbalené bloky: při zápisu jeden (ten, který je na řadě), jen ke čtení (host, zápis neběží) všechny
  const [open, setOpen] = useState<string[]>(() => (interactive ? [nextBlockToOpen(blocks)].filter((x): x is string => !!x) : blocks.map((b) => b.id)));
  const [busy, setBusy] = useState(false);
  const [unenrollTarget, setUnenrollTarget] = useState<{ block: BlockModel; options: OptionModel[]; collapse: boolean } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<{ block: BlockModel; to: OptionModel } | null>(null);
  const [switchFromId, setSwitchFromId] = useState("");
  const [sameSubject, setSameSubject] = useState<{ subjectName: string; blockName: string } | null>(null);
  const [names, setNames] = useState<{ id: string; title: string } | null>(null);

  const requiredBlocks = blocks.filter((b) => b.required && b.options.length > 0);
  const requiredDone = requiredBlocks.filter((b) => !b.missing).length;
  const missingBlocks = blocks.filter((b) => b.missing);

  function toggle(blockId: string) {
    setOpen((cur) => {
      const isOpen = cur.includes(blockId);
      if (interactive) return isOpen ? [] : [blockId];
      return isOpen ? cur.filter((x) => x !== blockId) : [...cur, blockId];
    });
  }

  /** Po změně: blok, který je hotový (dosáhl maxima), se sbalí a otevře se další, který je na řadě. */
  function advance(block: BlockModel, newCount: number) {
    if (newCount >= block.max) {
      const next = nextBlockToOpen(blocks.map((b) => (b.id === block.id ? { ...b, missing: false } : b)));
      setOpen(next ? [next] : []);
    } else {
      setOpen([block.id]);
    }
  }

  async function run(action: () => Promise<ActionResult>, success: string, fallback: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await action();
      if (res && res.error) {
        toast.error(res.error);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message || fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function findSameSubjectElsewhere(block: BlockModel, opt: OptionModel) {
    for (const b of blocks) {
      if (b.id === block.id) continue;
      const hit = b.mine.find((o) => o.subjectId === opt.subjectId);
      if (hit) return { subjectName: hit.name, blockName: b.name };
    }
    return null;
  }

  async function pick(block: BlockModel, opt: OptionModel) {
    const same = findSameSubjectElsewhere(block, opt);
    if (same) {
      setSameSubject(same);
      return;
    }
    if (block.count >= block.max) {
      // V bloku je plno: místo přidání se jeden výběr vymění
      if (!change.ok) {
        toast.error(change.reason ?? "Zápis v tomto bloku už nelze změnit.");
        return;
      }
      setSwitchFromId(block.mine[0]?.enrollmentId ?? "");
      setSwitchTarget({ block, to: opt });
      return;
    }
    const ok = await run(() => enrollStudent(currentUser.id, opt.id), `Zapsáno: ${opt.name}`, "Nepodařilo se provést zápis.");
    if (ok) advance(block, block.count + 1);
  }

  async function confirmSwitch() {
    if (!switchTarget || !switchFromId) return;
    const { block, to } = switchTarget;
    setSwitchTarget(null);
    // jedna transakce na serveru: když se nový zápis nepovede, původní zůstane
    const ok = await run(() => switchEnrollment(switchFromId, to.id), `Vyměněno: ${to.name}`, "Nepodařilo se vyměnit zápis.");
    if (ok) advance(block, block.count);
  }

  async function confirmUnenroll() {
    if (!unenrollTarget) return;
    const { options, collapse } = unenrollTarget;
    setUnenrollTarget(null);
    let removed = 0;
    for (const opt of options) {
      if (!opt.enrollmentId) continue;
      const enrollmentId = opt.enrollmentId;
      const ok = await run(() => unenrollStudent(enrollmentId), `Odhlášeno: ${opt.name}`, "Nepodařilo se zrušit zápis.");
      if (!ok) break;
      removed++;
    }
    // „Nechci nic z tohoto bloku“ blok sbalí; obyčejné odepsání ho nechá otevřený, ať si student vybere jinak
    if (collapse && removed === options.length) setOpen([]);
  }

  function askUnenroll(block: BlockModel, options: OptionModel[], collapse = false) {
    if (!change.ok) {
      toast.error(change.reason ?? "Zápis v tomto bloku už nelze změnit.");
      return;
    }
    setUnenrollTarget({ block, options, collapse });
  }

  /** „Nechci nic z tohoto bloku“: sbalí blok, a když v něm student je, odepíše ho. */
  function skip(block: BlockModel) {
    if (block.mine.length > 0) askUnenroll(block, block.mine, true);
    else setOpen([]);
  }

  const statusBadge = { OPEN: "success", PLANNED: "info", CLOSED: "muted", DRAFT: "muted" } as const;
  const statusClass = { DRAFT: "text-muted-foreground", PLANNED: "text-info", OPEN: "text-success", CLOSED: "text-muted-foreground" }[info.phase];

  const complete = requiredBlocks.length > 0 && missingBlocks.length === 0;
  const statusBar = (
    <div
      className={cn("flex items-center gap-2 text-sm font-semibold", complete ? "text-success" : "text-warning")}
      data-testid="enrollment-status"
      data-complete={complete ? "true" : "false"}
    >
      {complete ? <CircleCheck className="h-5 w-5 shrink-0" aria-hidden="true" /> : <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />}
      <span>{complete ? "Zápis je kompletní" : `Zbývá vybrat: ${missingBlocks.map((b) => b.name).join(", ")}`}</span>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="student-enrollment">
      {/* Hlavička okna */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{ew.name}</h1>
          {ew.description && <p className="text-sm text-muted-foreground">{ew.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge variant={statusBadge[info.phase]} data-testid="window-phase" data-phase={info.phase}>
            {info.label}
          </Badge>
          {info.phase === "PLANNED" && (
            <span className={cn("text-sm font-medium", statusClass)} data-testid="window-countdown">
              Otevře se za {formatRemaining(new Date(ew.startsAt).getTime() - now.getTime())}
            </span>
          )}
          {info.phase === "OPEN" && (
            <span className={cn("text-sm font-medium", statusClass)} data-testid="window-countdown">
              Zavře se za {formatRemaining(new Date(ew.endsAt).getTime() - now.getTime())}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground" data-testid="window-deadline">
          {deadlineLine({ phase: info.phase, startsAt: ew.startsAt, endsAt: ew.endsAt, closedEarly: info.closedEarly })}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="window-rules-summary">
          {ew.allowSelfUnenroll === false
            ? "Sami se z výběru odepsat ani vyměnit nemůžete."
            : ew.changesUntil
              ? `Výběr můžete měnit do ${formatDateTime(ew.changesUntil)}.`
              : "Výběr můžete měnit až do konce zápisu."}
          {" · "}
          {namesVisible ? "u semináře uvidíte jména zapsaných" : "u semináře uvidíte jen počty zapsaných"}
        </p>
      </div>

      {currentUser.role === "GUEST" && (
        <div className="flex items-center gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-warning">
          <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Váš účet čeká na schválení administrátorem</p>
            <p className="mt-1 text-xs">Nyní máte pouze oprávnění k prohlížení aktuálních zápisů. Nemůžete se zapisovat na žádné předměty.</p>
          </div>
        </div>
      )}

      {interactive && requiredBlocks.length > 0 && (
        <div className="space-y-1.5" data-testid="window-progress-bar">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Povinné bloky</span>
            <span>
              {requiredDone} ze {requiredBlocks.length} hotovo
            </span>
          </div>
          <Progress value={(requiredDone / requiredBlocks.length) * 100} className="h-2" aria-label="Hotové povinné bloky" />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Bloky */}
        <div className="space-y-3" data-testid="enrollment-blocks">
          {blocks.length === 0 && <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">V tomto zápisu zatím nejsou žádné bloky.</p>}
          {blocks.map((block, index) => {
            const isOpen = open.includes(block.id);
            return (
              <section
                key={block.id}
                data-block={block.id}
                data-done={block.done ? "true" : "false"}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm",
                  isOpen && interactive && "border-primary ring-1 ring-primary",
                  block.done && !isOpen && "border-success/60"
                )}
              >
                <h2>
                  <button
                    type="button"
                    data-testid="block-toggle"
                    aria-expanded={isOpen}
                    aria-controls={`block-body-${block.id}`}
                    onClick={() => toggle(block.id)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                        block.done ? "border-success bg-success text-success-foreground" : isOpen && interactive ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      )}
                    >
                      {block.done ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold" data-testid="block-name">
                        {block.name}
                      </span>
                      <span className={cn("block text-sm", block.done ? "font-medium text-success" : "text-muted-foreground")} data-testid="block-state">
                        {blockStateText(block)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold underline underline-offset-4">
                      {isOpen ? "Zavřít" : interactive ? (block.done ? "Změnit" : "Vybrat") : "Zobrazit"}
                      {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                    </span>
                  </button>
                </h2>

                {isOpen && (
                  <div id={`block-body-${block.id}`} className="border-t">
                    <div className="space-y-1 px-4 pt-3 text-sm text-muted-foreground">
                      {block.description && <p>{block.description}</p>}
                      <p className="flex flex-wrap gap-x-3 text-xs">
                        <span data-testid="block-rules">{blockRulesLabel({ required: block.required, minEnrollments: block.min, maxEnrollments: block.max })}</span>
                        {canEnroll && (
                          <span data-testid="block-progress">
                            Zapsáno {block.count} z {block.min === block.max ? block.max : `${block.min}–${block.max}`}
                            {block.required ? "" : " (nepovinný blok)"}
                          </span>
                        )}
                      </p>
                    </div>
                    {block.options.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">V tomto bloku zatím není žádný seminář.</p>
                    ) : (
                      <ul className="divide-y px-2 pb-2 pt-1 sm:px-4">
                        {block.options.map((opt) => (
                          <OptionCard
                            key={opt.id}
                            block={block}
                            opt={opt}
                            interactive={interactive}
                            busy={busy}
                            changeBlocked={!change.ok ? change.reason : undefined}
                            namesVisible={namesVisible}
                            onPick={() => pick(block, opt)}
                            onUnenroll={() => askUnenroll(block, [opt])}
                            onNames={() => setNames({ id: opt.id, title: `${opt.name}${opt.subCode ? ` (${opt.subCode})` : ""}` })}
                          />
                        ))}
                      </ul>
                    )}
                    {interactive && !block.required && block.options.length > 0 && (
                      <div className="px-4 pb-4">
                        <Button type="button" variant="outline" className="h-11 w-full md:h-9 md:w-auto" data-testid="skip-block" disabled={busy} onClick={() => skip(block)}>
                          Nechci nic z tohoto bloku
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Panel „Váš výběr“ na počítači */}
        {blocks.length > 0 && (
          <aside className="hidden space-y-3 rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-4 lg:block" data-testid="selection-panel">
            <h2 className="font-semibold">Váš výběr</h2>
            <ul className="space-y-2 text-sm">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-baseline gap-2" data-block-summary={b.id}>
                  <span aria-hidden="true" className={cn("text-xs", b.done ? "text-success" : b.missing ? "text-warning" : "text-muted-foreground")}>
                    ●
                  </span>
                  <span className="flex-1 font-medium">{b.name}</span>
                  <span className={cn("text-right", b.done ? "" : b.missing ? "text-warning" : "text-muted-foreground")}>
                    {b.count > 0 ? b.mine.map((o) => o.name).join(", ") : b.missing ? "chybí" : b.required ? "—" : "nepovinné"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t pt-3 text-sm text-muted-foreground">
              {interactive && requiredBlocks.length > 0 && <div className="mb-2">{statusBar}</div>}
              {info.phase === "OPEN" ? (
                <>
                  Zápis se uzavře <strong className="text-foreground">{formatDateTime(ew.endsAt)}</strong>.
                </>
              ) : (
                deadlineLine({ phase: info.phase, startsAt: ew.startsAt, endsAt: ew.endsAt, closedEarly: info.closedEarly })
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Lepivá lišta na telefonu a tabletu */}
      {interactive && requiredBlocks.length > 0 && (
        <div
          className="sticky z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden"
          style={{ bottom: "var(--bottom-nav, 0px)" }}
          data-testid="enrollment-status-bar"
          data-complete={complete ? "true" : "false"}
        >
          {statusBar}
        </div>
      )}

      {/* Odepsání */}
      {unenrollTarget && (
        <AlertDialog open onOpenChange={() => setUnenrollTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu se chcete odhlásit?</AlertDialogTitle>
              <AlertDialogDescription>
                Budete odhlášeni z předmětu <strong>{unenrollTarget.options.map((o) => o.name).join(", ")}</strong> v bloku <strong>{unenrollTarget.block.name}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmUnenroll}>
                Odhlásit se
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Vyměnit */}
      {switchTarget && (
        <AlertDialog open onOpenChange={() => setSwitchTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Vyměnit výběr?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>V bloku {switchTarget.block.name} máte zapsáno nejvyšší povolené množství. Pokud budete pokračovat, výběr se vymění.</p>
                  {switchTarget.block.mine.length > 1 && (
                    <fieldset className="space-y-1" data-testid="switch-from">
                      <legend className="text-foreground">Který výběr nahradit?</legend>
                      {switchTarget.block.mine.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 rounded-md border p-2">
                          <Radio name="switch-from" checked={switchFromId === o.enrollmentId} onChange={() => setSwitchFromId(o.enrollmentId ?? "")} />
                          <span>{o.name}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="space-y-1 rounded bg-muted p-3 text-sm">
                    <p>
                      <strong>Současný:</strong> {switchTarget.block.mine.find((o) => o.enrollmentId === switchFromId)?.name ?? "—"}
                    </p>
                    <p>
                      <strong>Nový:</strong> {switchTarget.to.name}
                    </p>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction onClick={confirmSwitch} disabled={!switchFromId}>
                Vyměnit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {sameSubject && (
        <AlertDialog open onOpenChange={() => setSameSubject(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nelze se zapsat</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  Už jste zapsán na předmět <strong>{sameSubject.subjectName}</strong> v jiném bloku.
                </span>
                <span className="block">
                  Jste zapsán v bloku <strong>{sameSubject.blockName}</strong>.
                </span>
                <span className="block">Nejdříve se prosím odepište.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setSameSubject(null)}>OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {names && <ParticipantsDialog occurrenceId={names.id} title={names.title} onClose={() => setNames(null)} />}
    </div>
  );
}

function OptionCard({
  block,
  opt,
  interactive,
  busy,
  changeBlocked,
  namesVisible,
  onPick,
  onUnenroll,
  onNames,
}: {
  block: BlockModel;
  opt: OptionModel;
  interactive: boolean;
  busy: boolean;
  /** Důvod, proč teď nejde odepsat ani vyměnit (pravidla okna), jinak undefined */
  changeBlocked?: string;
  namesVisible: boolean;
  onPick: () => void;
  onUnenroll: () => void;
  onNames: () => void;
}) {
  const switching = !opt.mine && block.count >= block.max;
  const fill = opt.capacity ? Math.min(100, Math.round((opt.enrolled / opt.capacity) * 100)) : 0;
  return (
    <li
      data-occurrence={opt.id}
      data-selected={opt.mine ? "true" : "false"}
      data-full={opt.full ? "true" : "false"}
      data-free={opt.free ?? ""}
      className={cn("rounded-lg px-2 py-2.5", opt.mine && "bg-success/10", opt.full && !opt.mine && "bg-muted/40")}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className={cn("break-words font-semibold leading-snug", opt.full && "text-muted-foreground")}>
            <Link href={`/subjects/${opt.subjectId}`} className="underline decoration-muted-foreground/60 underline-offset-4 hover:decoration-foreground">
              {opt.name}
            </Link>
            {opt.subCode && (
              <span className="ml-1 font-normal text-muted-foreground" data-testid="occurrence-group">
                (skupina {opt.subCode})
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>
              {opt.teacher && <>{opt.teacher} · </>}
              <span className={cn(opt.full && "font-semibold text-danger")} data-testid="occurrence-free">
                {freeText(opt)}
              </span>
            </span>
            {opt.capacity ? (
              <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted md:inline-block" aria-hidden="true" title={`Obsazeno ${opt.enrolled} z ${opt.capacity}`}>
                <span className={cn("block h-full rounded-full", opt.full ? "bg-danger" : "bg-foreground/70")} style={{ width: `${fill}%` }} />
              </span>
            ) : null}
            {namesVisible && (
              <button
                type="button"
                data-testid="participants-button"
                className="-my-2 inline-flex min-h-11 items-center px-1 font-medium text-foreground underline underline-offset-4 md:min-h-8"
                onClick={onNames}
              >
                Zapsaní
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {opt.mine ? (
            <>
              <Badge variant="success" className="h-8 gap-1 px-2.5 text-sm md:h-6 md:text-xs" data-testid="selected-badge">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Vybráno
              </Badge>
              {interactive && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-11 text-danger md:h-8"
                  disabled={busy || !!changeBlocked}
                  title={changeBlocked}
                  data-testid="unenroll-button"
                  onClick={onUnenroll}
                >
                  Odepsat
                </Button>
              )}
            </>
          ) : (
            interactive && (
              <Button
                type="button"
                size="sm"
                variant={opt.full ? "secondary" : "default"}
                className="h-11 min-w-24 md:h-8"
                disabled={busy || opt.full}
                data-testid="enroll-button"
                data-action={switching ? "switch" : "enroll"}
                onClick={onPick}
              >
                {opt.full ? "Plno" : switching ? "Vyměnit" : "Vybrat"}
              </Button>
            )
          )}
        </div>
      </div>
      {opt.mine && interactive && changeBlocked && <p className="mt-1 text-xs text-muted-foreground">{changeBlocked}</p>}
    </li>
  );
}
