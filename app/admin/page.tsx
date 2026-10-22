"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getAdminOverview, setGlobalCohort, setRegistrationEnabled, setDefaultRole, setModuleEnabledAction, type AdminModuleInfo } from "@/modules/core/actions/admin";
import type { AdminStat } from "@/modules/server-types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users, BookOpen, Calendar, Save } from "lucide-react";
import { toast } from "sonner";
import { PerformanceBenchmarks } from "@/modules/core/components/admin/PerformanceBenchmarks";
import { can } from "@/modules/registry";

const STAT_ICONS = {
  users: <Users className="h-4 w-4 text-slate-500" />,
  book: <BookOpen className="h-4 w-4 text-slate-500" />,
  calendar: <Calendar className="h-4 w-4 text-emerald-500" />,
};

export default function AdminPage() {
  const { user, isLoading, refreshSession } = useAuth();

  const [stats, setStats] = useState<AdminStat[] | null>(null);
  const [modules, setModules] = useState<AdminModuleInfo[]>([]);
  const [cohort, setCohort] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [regEnabled, setRegEnabled] = useState(true);
  const [defaultRole, setDefaultRoleState] = useState<"GUEST" | "STUDENT">("GUEST");


  useEffect(() => {
    if (can(user?.role, "core.admin")) {
      loadData();
    }
  }, [user]);

  async function loadData() {
    try {
      const overview = await getAdminOverview();
      setStats(overview.stats);
      setCohort(overview.cohort);
      setRegEnabled(overview.registrationEnabled);
      setDefaultRoleState(overview.defaultRole);
      setModules(overview.modules);
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

  if (isLoading || !user || !can(user.role, "core.admin")) return (
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

      {/* STATISTIKY (dodávají je zapnuté moduly) */}
      <div className="grid gap-4 md:grid-cols-3">
        {(stats ?? []).map((stat) => (
          <Card key={stat.label} className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              {stat.icon && STAT_ICONS[stat.icon]}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
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

            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <Label htmlFor="defaultRole">Výchozí role pro nové uživatele</Label>
                <p className="text-xs text-muted-foreground">
                  Role, která bude přiřazena po dokončení registrace.
                </p>
              </div>
              <Select 
                value={defaultRole} 
                onValueChange={async (value) => {
                  try {
                    const role = value as "GUEST" | "STUDENT";
                    await setDefaultRole(role);
                    setDefaultRoleState(role);
                    toast.success("Výchozí role byla úspěšně změněna.");
                  } catch (err) {
                    const error = err as Error;
                    toast.error(error.message || "Nepodařilo se změnit nastavení.");
                  }
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Vyberte roli" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GUEST">Host (Guest)</SelectItem>
                  <SelectItem value="STUDENT">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* MODULY */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Moduly</CardTitle>
            <CardDescription>
              Vypnutý modul zmizí z menu a jeho stránky ani akce nejsou dostupné. Data zůstávají zachována.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modules.map((m, idx) => (
              <div key={m.id} className={`flex items-center justify-between gap-4 ${idx > 0 ? "pt-2 border-t" : ""}`}>
                <div>
                  <Label htmlFor={`module-${m.id}`}>{m.name}</Label>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
                <Switch
                  id={`module-${m.id}`}
                  checked={m.enabled}
                  disabled={m.core}
                  onCheckedChange={async (checked) => {
                    try {
                      await setModuleEnabledAction(m.id, checked);
                      // Znovu načíst i statistiky – závisí na zapnutých modulech
                      await loadData();
                      toast.success(checked ? `Modul „${m.name}“ zapnut.` : `Modul „${m.name}“ vypnut.`);
                      // Menu v hlavičce se skládá ze session
                      await refreshSession();
                    } catch (err) {
                      const error = err as Error;
                      toast.error(error.message || "Nepodařilo se změnit nastavení.");
                    }
                  }}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* BENCHMARK A DIAGNOSTIKA */}
      <PerformanceBenchmarks />
    </div>
  );
}