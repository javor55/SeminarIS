"use client";

import { unwrap } from "@/lib/action-result";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { setCurrentSchoolYear } from "@/modules/core/actions/school";
import { DEFAULT_STUDY_YEARS } from "@/lib/school";
import type { SchoolYearInfo } from "@/modules/core/school";

/** Administrace → Školní rok a třídy: aktuální rok, počáteční nastavení a odkaz na uzavření roku. */
export function SchoolYearCard({ info, canManage }: { info: SchoolYearInfo; canManage: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(String(info.currentYear.startYear));
  const [busy, setBusy] = useState(false);
  const changed = selected !== String(info.currentYear.startYear);

  async function save() {
    setBusy(true);
    try {
      unwrap(await setCurrentSchoolYear(Number(selected)));
      toast.success("Školní rok nastaven.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Nepodařilo se změnit školní rok.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-sm" data-testid="school-year-card">
      <CardHeader>
        <CardTitle>Školní rok</CardTitle>
        <CardDescription>
          Aktuální rok: <strong data-testid="current-year">{info.currentYear.label}</strong>.
          {canManage &&
            ` Na konci roku ho uzavřete: studenti postoupí do vyšších tříd, ${DEFAULT_STUDY_YEARS}. ročníky absolvují a vyřeší se opakování ročníku, odchody a úvazky.`}
        </CardDescription>
      </CardHeader>
      {canManage && (
        <CardContent className="space-y-3">
          <Button asChild>
            <Link href="/admin/close-year">Uzavřít školní rok {info.currentYear.label}…</Link>
          </Button>
          {info.canSetYearManually && (
            <div className="space-y-1 pt-2 border-t">
              <Label htmlFor="school-year">Počáteční nastavení roku</Label>
              <p className="text-xs text-muted-foreground">
                Jen dokud nejsou studenti zařazení do tříd; potom se rok mění uzavřením.
              </p>
              <div className="flex gap-2">
                <NativeSelect id="school-year" className="w-[180px]" value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {info.years.map((y) => (
                    <option key={y.startYear} value={y.startYear}>
                      {y.label}
                      {y.isCurrent ? " (aktuální)" : ""}
                    </option>
                  ))}
                </NativeSelect>
                <Button variant="outline" disabled={!changed || busy} onClick={save}>
                  Nastavit
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
