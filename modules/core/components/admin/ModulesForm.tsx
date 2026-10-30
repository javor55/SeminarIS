"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/action-result";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setModuleEnabledAction, type AdminModuleInfo } from "@/modules/core/actions/admin";

/** Administrace → Moduly: zapnutí a vypnutí modulů (zápis přes registr nastavení). */
export function ModulesForm({ modules }: { modules: AdminModuleInfo[] }) {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(modules.map((m) => [m.id, m.enabled])));

  async function toggle(m: AdminModuleInfo, checked: boolean) {
    try {
      unwrap(await setModuleEnabledAction(m.id, checked));
      setEnabled((e) => ({ ...e, [m.id]: checked }));
      toast.success(checked ? `Modul „${m.name}“ zapnut.` : `Modul „${m.name}“ vypnut.`);
      // Menu v hlavičce se skládá ze session, menu administrace z layoutu
      await refreshSession();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Nepodařilo se změnit nastavení.");
    }
  }

  return (
    <Card className="shadow-sm" data-testid="modules-card">
      <CardContent className="space-y-4 pt-6">
        {modules.map((m, idx) => (
          <div key={m.id} className={`flex items-center justify-between gap-4 ${idx > 0 ? "pt-3 border-t" : ""}`}>
            <div>
              <Label htmlFor={`module-${m.id}`}>{m.name}</Label>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
            <Switch id={`module-${m.id}`} checked={enabled[m.id]} disabled={m.core} onCheckedChange={(checked) => toggle(m, checked)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
