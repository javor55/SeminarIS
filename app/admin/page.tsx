"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { getSystemStats, getGlobalCohort, setGlobalCohort } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, BookOpen, Calendar, Save, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<any>(null);
  const [cohort, setCohort] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadData();
    }
  }, [user]);

  async function loadData() {
    try {
      const [s, c] = await Promise.all([getSystemStats(), getGlobalCohort()]);
      setStats(s);
      setCohort(c);
    } catch (e) {
      console.error(e);
      toast.error("Nepodařilo se načíst data administrace.");
    }
  }

  async function handleSaveCohort() {
    setIsSaving(true);
    try {
      await setGlobalCohort(cohort);
      toast.success("Globální ročník byl úspěšně aktualizován.");
    } catch (e) {
      toast.error("Chyba při ukládání ročníku.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !user || user.role !== "ADMIN") return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-outfit">Administrační centrum</h1>
        <p className="text-muted-foreground mt-1">
          Správa globálního nastavení systému a přehled statistik.
        </p>
      </div>

      {/* STATISTIKY */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Uživatelé celkem</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.userCount ?? "..."}</div>
            <p className="text-xs text-muted-foreground">Včetně studentů a učitelů</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Aktivní předměty</CardTitle>
            <BookOpen className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.subjectCount ?? "..."}</div>
            <p className="text-xs text-muted-foreground">Nabízené v aktuálním katalogu</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200">
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
          </CardContent>
        </Card>

        {/* HROMADNÉ AKCE */}
        <Card className="shadow-sm border-amber-100 bg-amber-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Rychlé systémové akce
            </CardTitle>
            <CardDescription>
              Destruktivní nebo hromadné operace nad databází.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start text-amber-700" onClick={() => toast.info("Tato funkce bude dostupná v příští aktualizaci.")}>
              <Trash2 className="w-4 h-4 mr-2" /> Deaktivovat neaktivní uživatele
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/users")}>
              <Users className="w-4 h-4 mr-2" /> Hromadná změna rolí
            </Button>
          </CardContent>
          <CardFooter className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Používejte s opatrností
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}