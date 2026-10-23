"use client";

import { unwrap } from "@/lib/action-result";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getEmailSettings, sendTestEmail } from "@/modules/core/actions/email";
import type { EmailStatus } from "@/lib/email";

// E-maily (Resend): stav konfigurace a odeslání zkušebního e-mailu.
export function EmailCard({ defaultTo }: { defaultTo: string }) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("Zkušební e-mail");
  const [text, setText] = useState("Toto je zkušební e-mail ze školního informačního systému.");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getEmailSettings().then(setStatus).catch(() => toast.error("Nepodařilo se načíst nastavení e-mailů."));
  }, []);

  async function send() {
    setSending(true);
    try {
      unwrap(await sendTestEmail({ to, subject, text }));
      toast.success(`E-mail odeslán na ${to}.`);
    } catch (err) {
      toast.error((err as Error).message || "E-mail se nepodařilo odeslat.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="shadow-sm" data-testid="email-card">
      <CardHeader>
        <CardTitle>E-maily</CardTitle>
        <CardDescription>
          Odesílání přes Resend. Klíč a odesílatel se nastavují v proměnných prostředí na Vercelu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.configured && (
          <p className="text-sm rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            E-maily nejsou nastavené. Na Vercelu doplňte{" "}
            {status.missing.map((m, i) => (
              <span key={m}>{i > 0 && " a "}<code>{m}</code></span>
            ))}{" "}
            a aplikaci znovu nasaďte.
          </p>
        )}
        {status?.configured && (
          <div className="text-sm space-y-1">
            <div>Odesílatel: <strong>{status.from}</strong></div>
            {status.replyTo && <div>Odpovědi na: <strong>{status.replyTo}</strong></div>}
            {status.transport === "log" && (
              <div className="text-muted-foreground">Testovací režim: e-maily se neodesílají, jen zapisují do logu.</div>
            )}
          </div>
        )}

        <div className="space-y-3 pt-2 border-t">
          <div className="font-medium text-sm">Zkušební e-mail</div>
          <div className="space-y-1">
            <Label htmlFor="email-to">Adresát</Label>
            <Input id="email-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email-subject">Předmět</Label>
            <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email-text">Text</Label>
            <Textarea id="email-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Button onClick={send} disabled={sending || !status?.configured} data-testid="email-send">
            {sending ? "Odesílám…" : "Odeslat"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
