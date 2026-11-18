"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/action-result";
import { formatDateTime } from "@/lib/datetime";
import { setAttendanceByLink } from "@/modules/events/actions/organizer";

type Props = { slug: string; token: string; code: string; name: string; guests: number; status: string; attendedAt: string | null };

/**
 * Panel jen pro organizátora (přihlášený, `canManageEvent`), který načetl QR kód z potvrzení: „Označit příchod“.
 * Stránku správy ostatním ukazuje bez tohoto panelu. Token se předává jen serverové akci.
 */
export function MarkArrival({ slug, token, code, name, guests, status, attendedAt: initial }: Props) {
  const router = useRouter();
  const [attendedAt, setAttendedAt] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = status === "WAITLIST";

  async function mark(next: boolean) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const out = unwrap(await setAttendanceByLink(slug, token, next));
      setAttendedAt(out.attendedAt);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Akce se nezdařila.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 md:p-6" aria-labelledby="arrival-h" data-testid="arrival-panel" data-attended={attendedAt ? "true" : "false"}>
      <h2 id="arrival-h" className="flex items-center gap-2 text-lg font-semibold"><UserCheck className="h-5 w-5" aria-hidden="true" /> Příchod (organizátor)</h2>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span> · <span className="font-mono">{code}</span> · {guests} {guests === 1 ? "osoba" : guests < 5 ? "osoby" : "osob"}
      </p>
      {waiting ? (
        <p className="text-sm" data-testid="arrival-waitlist">Registrace je na čekací listině, místo nedrží. Příchod nejde označit.</p>
      ) : attendedAt ? (
        <>
          <p className="flex items-center gap-2 font-semibold text-success" role="status" data-testid="arrival-done"><Check className="h-5 w-5" aria-hidden="true" /> Příchod označen ({formatDateTime(attendedAt)})</p>
          <Button type="button" variant="outline" className="h-11 md:h-9" disabled={pending} onClick={() => mark(false)} data-testid="arrival-undo">Zrušit označení příchodu</Button>
        </>
      ) : (
        <Button type="button" size="lg" className="h-14 w-full text-base md:h-11 md:w-auto" disabled={pending} onClick={() => mark(true)} data-testid="arrival-mark">
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Označit příchod
        </Button>
      )}
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert" data-testid="arrival-error">{error}</p>}
    </section>
  );
}
