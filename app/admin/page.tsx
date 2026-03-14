"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getSystemStats, getGlobalCohort, setGlobalCohort, isRegistrationEnabled, setRegistrationEnabled } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users, BookOpen, Calendar, Save } from "lucide-react";
import { toast } from "sonner";
import { PerformanceBenchmarks } from "@/components/admin/PerformanceBenchmarks";

export default function AdminPage() {
  const { user, isLoading } = useAuth();

  const [stats, setStats] = useState<{ userCount: number; subjectCount: number; activeEnrollmentCount: number } | null>(null);
  const [cohort, setCohort] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);


  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadData();
    }
  }, [user]);

  async function loadData() {
    try {
      const [s, c, r] = await Promise.all([getSystemStats(), getGlobalCohort(), isRegistrationEnabled()]);
      setStats(s);
      setCohort(c);
      setRegEnabled(r);
    } catch {
      toast.error("Nepodařilo se načíst data administrace.");
    }
  }

  async function handleSaveCohort() {
    setIsSaving(true);
    try {
      await setGlobalCohort(cohort);
      toast.success("Globální ročník byl úspěšně aktualizován.");
    } catch {
      toast.error("Chyba při ukládání ročníku.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !user || user.role !== "ADMIN") return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="h-9 w-64 bg-muted animate-pulse rounded" />
        <div className="h-4 w-96 bg-muted animate-pulse rounded mt-2" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-outfit">Administrační centrum</h1>
        <p className="text-muted-foreground mt-1">
          Správa globálního nastavení systému a přehled statistik.
        </p>
      </div>

      {/* STATISTIKY */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Uživatelé celkem</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.userCount ?? "..."}</div>
            <p className="text-xs text-muted-foreground">Včetně studentů a učitelů</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Aktivní předměty</CardTitle>
            <BookOpen className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.subjectCount ?? "..."}</div>
            <p className="text-xs text-muted-foreground">Nabízené v aktuálním katalogu</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Otevřené zápisy</CardTitle>
            <Calendar className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeEnrollmentCount ?? "..."}</div>
            <p className="text-xs text-muted-foreground">Aktuálně probíhající zápisová okna</p>
            </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* GLOBÁLNÍ NASTAVENÍ */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Globální nastavení</CardTitle>
            <CardDescription>
              Základní parametry ovlivňující chování celého systému.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cohort">Aktuální ročník studentů</Label>
              <div className="flex gap-2">
                <Input 
                  id="cohort" 
                  placeholder="např. 2024/2025" 
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                />
                <Button variant="default" onClick={handleSaveCohort} disabled={isSaving}>
                  {isSaving ? "Ukládám..." : <><Save className="w-4 h-4 mr-2" /> Uložit</>}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tato hodnota se používá jako výchozí filtr při importu studentů a v přehledech.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <Label htmlFor="registration">Registrace nových uživatelů</Label>
                <p className="text-xs text-muted-foreground">
                  Pokud je vypnuta, nikdo se nemůže registrovat.
                </p>
              </div>
              <Switch
                id="registration"
                checked={regEnabled}
                onCheckedChange={async (checked) => {
                  try {
                    await setRegistrationEnabled(checked);
                    setRegEnabled(checked);
                    toast.success(checked ? "Registrace povolena." : "Registrace zakázána.");
                  } catch (err) {
                    const error = err as Error;
                    toast.error(error.message || "Nepodařilo se změnit nastavení.");
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BENCHMARK A DIAGNOSTIKA */}
      <PerformanceBenchmarks />
    </div>
  );
}