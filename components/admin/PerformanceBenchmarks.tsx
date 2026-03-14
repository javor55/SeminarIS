"use client";

import { useState } from "react";
import { runSystemDiagnostics } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Zap, 
  Database, 
  ShieldCheck, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  RefreshCw,
  Gauge
} from "lucide-react";
import { toast } from "sonner";

interface DiagnosticData {
  dbLatency: number;
  sessionCheckLatency: number;
  envHealth: {
    DATABASE_URL: boolean;
    NEXTAUTH_SECRET: boolean;
    NEXTAUTH_URL: boolean;
    VERCEL_SPEED_INSIGHTS: boolean;
  };
  isFirstRequest: boolean;
  serverTime: string;
  userRole: string;
}

export function PerformanceBenchmarks() {
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPing, setLastPing] = useState<number | null>(null);

  async function runTest() {
    setIsLoading(true);
    const clientStartTime = Date.now();
    try {
      const result = await runSystemDiagnostics();
      const rtt = Date.now() - clientStartTime;
      setData(result);
      setLastPing(rtt);
      toast.success("Benchmark dokončen.");
    } catch {
      toast.error("Vyskytla se chyba při provádění benchmarku.");
    } finally {
      setIsLoading(false);
    }
  }

  function getLatencyColor(ms: number) {
    if (ms < 100) return "text-emerald-500";
    if (ms < 300) return "text-orange-500";
    return "text-destructive";
  }

  function getLatencyProgress(ms: number) {
    return Math.min(100, Math.max(5, (ms / 1000) * 100));
  }

  return (
    <Card className="shadow-sm border-border overflow-hidden">
      <CardHeader className="bg-slate-50/50 border-b">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-indigo-500" />
              Benchmark a Diagnostika
            </CardTitle>
            <CardDescription>
              Monitorování výkonu serveru, databáze a stavu konfigurace.
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={runTest} 
            disabled={isLoading}
            className="shadow-sm"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Activity className="w-4 h-4 mr-2" />
            )}
            Spustit test
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {!data && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <Zap className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-muted-foreground w-64">
              Spusťte benchmark pro získání aktuálních metrik o stavu systému.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* PERFORMANCE METRICS */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Výkonostní metriky</h4>
              
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Odezva serveru (Ping)</span>
                  </div>
                  <span className={`text-xl font-bold font-mono ${lastPing ? getLatencyColor(lastPing) : ""}`}>
                    {lastPing ?? "--"} <span className="text-xs font-normal text-muted-foreground">ms</span>
                  </span>
                </div>
                <Progress value={lastPing ? getLatencyProgress(lastPing) : 0} className="h-1.5" />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">Latence databáze</span>
                  </div>
                  <span className={`text-xl font-bold font-mono ${data ? getLatencyColor(data.dbLatency) : ""}`}>
                    {data?.dbLatency ?? "--"} <span className="text-xs font-normal text-muted-foreground">ms</span>
                  </span>
                </div>
                <Progress value={data ? getLatencyProgress(data.dbLatency) : 0} className="h-1.5" />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">Ověření relace (Session)</span>
                  </div>
                  <span className={`text-xl font-bold font-mono ${data ? getLatencyColor(data.sessionCheckLatency) : ""}`}>
                    {data?.sessionCheckLatency ?? "--"} <span className="text-xs font-normal text-muted-foreground">ms</span>
                  </span>
                </div>
                <Progress value={data ? getLatencyProgress(data.sessionCheckLatency) : 0} className="h-1.5" />
              </div>
            </div>

            {/* SYSTEM STATUS */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stav systému</h4>
              
              <div className="rounded-lg border bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Konfigurace proměnných</span>
                  <div className="flex gap-1">
                    {data && Object.entries(data.envHealth).map(([key, ok]) => (
                      <Badge key={key} variant={ok ? "outline" : "destructive"} className="px-1 py-0 text-[10px] h-4">
                        {key.split('_')[0]}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Typ požadavku</span>
                  {data?.isFirstRequest ? (
                    <Badge variant="warning" className="animate-pulse">Studený start (Cold)</Badge>
                  ) : (
                    <Badge variant="success">Teplý start (Warm)</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Čas serveru</span>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <Clock className="w-3 h-3" />
                    {data ? new Date(data.serverTime).toLocaleTimeString() : "--:--:--"}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-200 mt-1">
                  <span className="text-muted-foreground">Vercel Speed Insights</span>
                  {data?.envHealth.VERCEL_SPEED_INSIGHTS ? (
                    <span className="flex items-center gap-1 text-emerald-600 text-[11px] font-medium">
                      <CheckCircle2 className="w-3 h-3" /> Aktivní
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400 text-[11px] font-medium">
                      <AlertCircle className="w-3 h-3" /> Nenalezeno
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <AlertCircle className="w-3 h-3 inline mr-1 mb-0.5" />
                Poznámka: Hodnoty pod 100ms jsou považovány za optimální pro plynulý chod IS.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
