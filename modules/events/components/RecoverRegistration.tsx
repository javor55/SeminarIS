"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrap } from "@/lib/action-result";
import { recoverRegistration } from "@/modules/events/actions/manage";

/**
 * „Už jste registrovaní?“: kód + e-mail. Při shodě přejde na správu registrace (nový odkaz, starý přestane platit);
 * při neshodě je hláška vždy stejná.
 */
export function RecoverRegistration({ slug }: { slug: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!code.trim() || !email.trim()) {
      setError("Vyplňte kód registrace i e-mail.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { token } = unwrap(await recoverRegistration(slug, { code, email }));
      router.push(`/akce/${encodeURIComponent(slug)}/r/${encodeURIComponent(token)}`);
    } catch (err) {
      setError((err as Error).message || "Registraci se nepodařilo najít.");
      setPending(false);
    }
  }

  return (
    <details className="group rounded-xl border bg-card shadow-sm" data-testid="recover">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold md:px-6 [&::-webkit-details-marker]:hidden" data-testid="recover-toggle">
        Už jste registrovaní?
        <span className="text-sm font-normal text-primary underline underline-offset-4 group-open:hidden">Najít registraci</span>
      </summary>
      <form onSubmit={submit} noValidate className="space-y-4 border-t px-4 py-4 md:px-6" data-testid="recover-form">
        <p className="text-sm text-muted-foreground">
          Zadejte kód registrace (např. K7M-4QX2) a e-mail, který jste při registraci uvedli. Pak můžete registraci změnit nebo zrušit.
        </p>
        <div className="space-y-1">
          <label htmlFor="rec-code" className="text-sm font-medium">Kód registrace</label>
          <Input id="rec-code" name="code" className="h-11 font-mono text-base uppercase md:h-9 md:text-sm" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="rec-email" className="text-sm font-medium">E-mail</label>
          <Input id="rec-email" name="email" type="email" inputMode="email" autoComplete="email" className="h-11 text-base md:h-9 md:text-sm" placeholder="jmeno@domena.cz" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground" data-testid="recover-note">
          Po nalezení vám vystavíme nový odkaz na správu. Starý odkaz (například z e-mailu) tím přestane platit; nový si uložte.
        </p>
        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert" data-testid="recover-error">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full md:h-9 md:w-auto" disabled={pending} data-testid="recover-button">
          {pending ? <Loader2 className="animate-spin" /> : null} Najít registraci
        </Button>
      </form>
    </details>
  );
}
