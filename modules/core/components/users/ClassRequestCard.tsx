"use client";

import { unwrap } from "@/lib/action-result";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { setMyRequestedClass } from "@/modules/core/actions/approvals";

/** Výzva pro hosta čekajícího na schválení: vybrat (nebo změnit) svou třídu. */
export function ClassRequestCard({
  classes,
  current,
  required,
}: {
  classes: { id: string; label: string }[];
  current: string | null;
  required: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      unwrap(await setMyRequestedClass(value || null));
      toast.success("Třída uložena, čeká se na schválení správcem.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Uložení se nezdařilo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid="class-request">
      <CardHeader>
        <CardTitle className="text-lg">Vyberte svou třídu</CardTitle>
        <CardDescription>
          Váš účet čeká na schválení správcem. Vyberte třídu, do které chodíte; do schválení ji můžete změnit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="requested-class">Třída{required ? "" : " (nepovinné)"}</Label>
          <NativeSelect id="requested-class" className="w-[160px]" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">— nevybráno —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </NativeSelect>
        </div>
        <Button onClick={save} disabled={saving || (required && !value) || value === (current ?? "")}>
          Uložit
        </Button>
      </CardContent>
    </Card>
  );
}
