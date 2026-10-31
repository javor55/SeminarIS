"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, Trash2 } from "lucide-react";
import { unwrap } from "@/lib/action-result";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearDemoDataAction, seedDemoDataAction } from "@/modules/core/actions/demo";
import { DEMO_CLEAR_CONFIRM_WORD, DEMO_SEED_CONFIRM_WORD } from "@/modules/core/demo/constants";
import { ImpersonateButton } from "@/modules/core/components/users/ImpersonateButton";
import type { DemoStatus } from "@/modules/core/demo";

type Mode = "seed" | "clear";

/** Administrace → Ukázková data: stav, naplnění a smazání (obě akce vyžadují opsání potvrzovacího slova). */
export function DemoDataPanel({ status }: { status: DemoStatus }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [word, setWord] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const expected = mode === "seed" ? DEMO_SEED_CONFIRM_WORD : DEMO_CLEAR_CONFIRM_WORD;

  function close() {
    if (busy) return;
    setMode(null);
    setWord("");
  }

  async function run() {
    if (!mode) return;
    setBusy(true);
    try {
      if (mode === "seed") {
        toast.success(unwrap(await seedDemoDataAction(word)));
      } else {
        const result = unwrap(await clearDemoDataAction(word));
        toast.success(result.summary);
      }
      setMode(null);
      setWord("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Akce se nezdařila.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm" data-testid="demo-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Stav
            {status.exists ? <Badge variant="warning" data-testid="demo-state">ukázková data jsou v systému</Badge> : <Badge variant="secondary" data-testid="demo-state">ukázková data nejsou</Badge>}
          </CardTitle>
          <CardDescription>
            Ukázková data slouží k prezentaci: školní rok, třídy, studenti, učitelé, předměty, zápisy seminářů a termíny dopisování.
            Všechny účty mají adresu <code>…@ukazka.invalid</code>, e-maily na ně se neodesílají. Smazání odstraní jen to, co ukázková data vytvořila.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.exists && (
            <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2" data-testid="demo-counts">
              {status.counts.map((c) => (
                <li key={c.key} className="flex justify-between gap-4 border-b py-1" data-testid={`demo-count-${c.key}`}>
                  <span className="text-muted-foreground">{c.label}</span>
                  <strong>{c.count}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" disabled={status.exists} onClick={() => setMode("seed")} data-testid="demo-seed-open">
              <Database className="w-4 h-4" /> Naplnit ukázkovými daty
            </Button>
            <Button variant="destructive" className="gap-2" disabled={!status.exists} onClick={() => setMode("clear")} data-testid="demo-clear-open">
              <Trash2 className="w-4 h-4" /> Smazat ukázková data
            </Button>
          </div>
          {status.exists && <p className="text-xs text-muted-foreground" data-testid="demo-seed-blocked">Ukázková data už existují. Dokud je nesmažete, nelze je naplnit znovu.</p>}
        </CardContent>
      </Card>

      <Card className="shadow-sm" data-testid="demo-accounts">
        <CardHeader>
          <CardTitle>Přihlášení do ukázkových účtů</CardTitle>
          <CardDescription>
            {status.password ? (
              <>
                Všechny ukázkové účty mají společné heslo <code className="font-mono font-semibold" data-testid="demo-password">{status.password}</code>{" "}
                (vygenerované při naplnění, vidí ho jen admin).
              </>
            ) : (
              <>Společné heslo ukázkových účtů se vygeneruje při naplnění a zobrazí se tady.</>
            )}{" "}
            Bez přihlašování se na ně podíváte tlačítkem „Zobrazit jako“ (jen pro čtení).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Po naplnění tu bude student 4. ročníku, učitel a host čekající na schválení.</p>
          ) : (
            <ul className="space-y-2">
              {status.accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid="demo-account" data-role={a.role} data-email={a.email}>
                  <div className="text-sm">
                    <div className="font-medium">{a.name} <span className="text-muted-foreground font-normal">· {a.description}</span></div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </div>
                  {a.role === "GUEST" ? null : <ImpersonateButton userId={a.id} name={a.name} label="Zobrazit jako" />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-[480px]" data-testid="demo-dialog">
          <DialogHeader>
            <DialogTitle>{mode === "seed" ? "Naplnit ukázkovými daty" : "Smazat ukázková data"}</DialogTitle>
            <DialogDescription>
              {mode === "seed"
                ? "Vytvoří se asi 240 studentů, 15 učitelů, 4 hosté, třídy 1.A–4.C, předměty, zápisy seminářů a termíny dopisování. Nic se nikomu neodešle."
                : "Smaže se vše, co ukázková data vytvořila, včetně toho, co na tom závisí (např. zápis skutečného studenta do ukázkového okna). Skutečná data zůstanou."}
            </DialogDescription>
          </DialogHeader>
          {mode === "clear" && (
            <Alert variant="destructive">
              <AlertTitle>Nevratná akce</AlertTitle>
              <AlertDescription>Třída, ve které je skutečný student, se nesmaže.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label htmlFor="demo-confirm">Pro potvrzení opište {expected}</Label>
            <Input id="demo-confirm" data-testid="demo-confirm" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} placeholder={expected} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>Zrušit</Button>
            <Button
              variant={mode === "clear" ? "destructive" : "default"}
              disabled={busy || word.trim().toLocaleUpperCase("cs-CZ") !== expected}
              onClick={run}
              data-testid="demo-confirm-submit"
            >
              {busy ? "Pracuji…" : mode === "seed" ? "Naplnit" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
