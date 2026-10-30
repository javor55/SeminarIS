"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/action-result";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { saveSettingsAction } from "@/modules/core/actions/settings";
import type { SettingField } from "@/lib/settings-registry";

/** Id ovládacího prvku nastavení (`auth.microsoft.enabled` → `setting-auth-microsoft-enabled`). */
export const settingInputId = (key: string) => `setting-${key.replace(/\./g, "-")}`;

/**
 * Jednoduchý formulář vykreslený z deklarací nastavení (registr nastavení):
 * přepínač a výběr se ukládají hned po změně, číslo a text tlačítkem „Uložit“.
 * Zápis jde přes `saveSettingsAction` (kontrola oprávnění, validace a historie změn na serveru).
 */
export function SettingsForm({
  title,
  description,
  fields,
  disabledKeys = [],
  notice,
  testId,
}: {
  title?: string;
  description?: string;
  fields: SettingField[];
  // Pole, která jsou teď nedostupná (např. přihlášení přes Microsoft bez konfigurace)
  disabledKeys?: string[];
  notice?: React.ReactNode;
  testId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [saved, setSaved] = useState<Record<string, string | number | boolean>>(values);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(field: SettingField, value: string | number | boolean) {
    setBusy(field.key);
    try {
      unwrap(await saveSettingsAction({ [field.key]: value }));
      setValues((v) => ({ ...v, [field.key]: value }));
      setSaved((v) => ({ ...v, [field.key]: value }));
      toast.success("Nastavení uloženo.");
      router.refresh();
    } catch (err) {
      // vrátit původní hodnotu
      setValues((v) => ({ ...v, [field.key]: saved[field.key] }));
      toast.error((err as Error).message || "Nepodařilo se změnit nastavení.");
    } finally {
      setBusy(null);
    }
  }

  const body = (
    <div className="space-y-4">
      {notice}
      {fields.map((f, idx) => {
        const id = settingInputId(f.key);
        const disabled = !f.canEdit || disabledKeys.includes(f.key) || busy === f.key;
        const dirty = values[f.key] !== saved[f.key];
        return (
          <div key={f.key} className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${idx > 0 ? "pt-3 border-t" : ""}`} data-setting={f.key}>
            <div className="min-w-0">
              <Label htmlFor={id}>{f.label}</Label>
              {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
            </div>
            {f.type === "boolean" && (
              <Switch id={id} checked={values[f.key] === true} disabled={disabled} onCheckedChange={(checked) => save(f, checked)} />
            )}
            {f.type === "enum" && (
              <NativeSelect
                id={id}
                className="sm:w-[200px]"
                value={String(values[f.key])}
                disabled={disabled}
                onChange={(e) => save(f, e.target.value)}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            )}
            {(f.type === "number" || f.type === "string") && (
              <div className="flex gap-2">
                <Input
                  id={id}
                  className="sm:w-[200px]"
                  type={f.type === "number" ? "number" : "text"}
                  min={f.min}
                  max={f.max}
                  maxLength={f.maxLength}
                  placeholder={f.placeholder}
                  value={String(values[f.key])}
                  disabled={disabled}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value }))}
                />
                <Button variant="outline" disabled={disabled || !dirty} onClick={() => save(f, values[f.key])}>
                  Uložit
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (!title) return body;
  return (
    <Card className="shadow-sm" data-testid={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
