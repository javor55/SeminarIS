"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Ochrana proti robotům (proof-of-work ve stylu ALTCHA): po zobrazení stáhne výzvu a ve Web Workeru hledá číslo, jehož
// SHA-256 (se solí) vyjde jako výzva. Uživatel nic neopisuje. Hotové řešení vkládá do skrytého pole `name` a hlásí `onChange`
// (`null`, dokud není ověřeno nebo když výzva vyprší). Server řešení ověří v `lib/antibot.ts`.

type Challenge = { algorithm: string; salt: string; challenge: string; maxnumber: number; signature: string; expiresAt: string };
type State = "solving" | "done" | "error";

// Kód workeru je přímo ve zdroji (Blob), aby šel bez zvláštního souboru a fungoval stejně v dev i v produkčním buildu.
const WORKER_SOURCE = `
self.onmessage = async (e) => {
  const { salt, challenge, maxnumber } = e.data;
  try {
    const enc = new TextEncoder();
    const target = new Uint8Array(challenge.match(/../g).map((h) => parseInt(h, 16)));
    const started = performance.now();
    const BATCH = 500;
    for (let start = 0; start <= maxnumber; start += BATCH) {
      const end = Math.min(start + BATCH - 1, maxnumber);
      const jobs = [];
      for (let n = start; n <= end; n++) jobs.push(crypto.subtle.digest("SHA-256", enc.encode(salt + n)));
      const hashes = await Promise.all(jobs);
      for (let i = 0; i < hashes.length; i++) {
        const h = new Uint8Array(hashes[i]);
        let same = h.length === target.length;
        for (let k = 0; same && k < h.length; k++) if (h[k] !== target[k]) same = false;
        if (same) { self.postMessage({ number: start + i, took: Math.round(performance.now() - started) }); return; }
      }
    }
    self.postMessage({ error: "not-found" });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
`;

function solveInWorker(c: Challenge): { promise: Promise<{ number: number; took: number }>; cancel: () => void } {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(url);
  const cancel = () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
  const promise = new Promise<{ number: number; took: number }>((resolve, reject) => {
    worker.onmessage = (e) => {
      cancel();
      if (typeof e.data?.number === "number") resolve(e.data);
      else reject(new Error(e.data?.error ?? "worker"));
    };
    worker.onerror = (e) => {
      cancel();
      reject(new Error(e.message));
    };
    worker.postMessage({ salt: c.salt, challenge: c.challenge, maxnumber: c.maxnumber });
  });
  return { promise, cancel };
}

export function AntibotField({ onChange, name = "altcha", className }: { onChange?: (solution: string | null) => void; name?: string; className?: string }) {
  const [state, setState] = useState<State>("solving");
  const [value, setValue] = useState("");
  const [attempt, setAttempt] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const report = useCallback((v: string | null) => {
    setValue(v ?? "");
    onChangeRef.current?.(v);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cancelWorker: (() => void) | null = null;
    let refresh: ReturnType<typeof setTimeout> | null = null;

    async function run() {
      setState("solving");
      report(null);
      try {
        if (!window.crypto?.subtle) throw new Error("no-subtle");
        const res = await fetch("/api/antibot/challenge", { cache: "no-store" });
        if (!res.ok) throw new Error("challenge");
        const challenge = (await res.json()) as Challenge;
        const job = solveInWorker(challenge);
        cancelWorker = job.cancel;
        const { number, took } = await job.promise;
        if (cancelled) return;
        report(btoa(JSON.stringify({ algorithm: challenge.algorithm, challenge: challenge.challenge, number, salt: challenge.salt, signature: challenge.signature, took })));
        setState("done");
        // Výzva platí 10 minut; kdo formulář drží déle, dostane novou dřív, než stará vyprší
        const left = new Date(challenge.expiresAt).getTime() - Date.now() - 60_000;
        refresh = setTimeout(() => !cancelled && setAttempt((a) => a + 1), Math.max(10_000, left));
      } catch {
        if (!cancelled) {
          report(null);
          setState("error");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
      cancelWorker?.();
      if (refresh) clearTimeout(refresh);
    };
  }, [attempt, report]);

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)} data-testid="antibot" data-state={state} role="status" aria-live="polite">
      {state === "solving" && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground" data-testid="antibot-status">Ověřuji, že nejste robot…</span>
        </>
      )}
      {state === "done" && (
        <>
          <span className="text-success" data-testid="antibot-status">✓ Ověřeno</span>
        </>
      )}
      {state === "error" && (
        <>
          <span className="text-danger" data-testid="antibot-status">Ověření se nepodařilo.</span>
          <button type="button" className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4 md:min-h-8" onClick={() => setAttempt((a) => a + 1)} data-testid="antibot-retry">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Zkusit znovu
          </button>
        </>
      )}
      <input type="hidden" name={name} value={value} data-testid="antibot-value" readOnly />
    </div>
  );
}
