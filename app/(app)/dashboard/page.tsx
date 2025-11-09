"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/lib/data";
import { EnrollmentBlocks } from "@/components/enrollment/EnrollmentBlocks";
import { Button } from "@/components/ui/button";
import { EditEnrollmentDialog } from "@/components/enrollment/EditEnrollmentDialog";

// 🕒 formátování d + hh:mm:ss
function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const restSeconds = totalSeconds - days * 86400;
  const h = Math.floor(restSeconds / 3600);
  const m = Math.floor((restSeconds % 3600) / 60);
  const s = restSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (days > 0) return `${days} d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const enrollments = getEnrollmentWindowsVisible();
  const ew = enrollments.length
    ? getEnrollmentWindowByIdWithBlocks(enrollments[0].id)!
    : null;

  const [now, setNow] = useState(() => new Date());
  const [editEnrollment, setEditEnrollment] = useState<any | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = ew ? new Date(ew.startsAt) : new Date(0);
  const end = ew ? new Date(ew.endsAt) : new Date(0);

  const { statusLabel, statusColor, countdownLabel } = useMemo(() => {
    if (!ew) {
      return {
        statusLabel: "Žádný zápis",
        statusColor: "text-slate-400",
        countdownLabel: "",
      };
    }

    if (now < start) {
      return {
        statusLabel: "Naplánováno",
        statusColor: "text-blue-600",
        countdownLabel: `Začíná za: ${formatDuration(
          start.getTime() - now.getTime()
        )}`,
      };
    } else if (now >= start && now <= end) {
      return {
        statusLabel: "Otevřeno",
        statusColor: "text-emerald-600",
        countdownLabel: `Končí za: ${formatDuration(
          end.getTime() - now.getTime()
        )}`,
      };
    } else {
      return {
        statusLabel: "Uzavřeno",
        statusColor: "text-slate-500",
        countdownLabel: "",
      };
    }
  }, [ew, now, start, end]);

  if (!user) {
    return (
      <p className="text-sm text-slate-500">
        Nejste přihlášen.{" "}
        <a href="/login" className="underline">
          Přihlásit se
        </a>
      </p>
    );
  }

  if (!ew) {
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold">Zápis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aktuálně není k dispozici žádné zápisové období.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* 🧭 KARTA 1 a KARTA 2 vedle sebe */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* KARTA 1 – název + popis */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{ew.name}</h1>
                {ew.description ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    {ew.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    Zápis nemá popis.
                  </p>
                )}
              </div>

              {/* tlačítko vpravo nahoře */}
              {(user.role === "ADMIN" || user.role === "TEACHER") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditEnrollment(ew)}
                >
                  Upravit zápis
                </Button>
              )}
            </div>
          </div>

          {/* KARTA 2 – stav + časy + odpočet */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="px-4 py-3 border-b flex items-center gap-4">
              <p className={`text-base font-semibold ${statusColor}`}>
                {statusLabel}
              </p>
              {countdownLabel && (
                <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                  {countdownLabel}
                </span>
              )}
            </div>

            <div className="px-4 py-3 space-y-1 text-sm">
              <p>
                <span className="text-slate-500">Začátek:</span>{" "}
                {start.toLocaleString()}
              </p>
              <p>
                <span className="text-slate-500">Konec:</span>{" "}
                {end.toLocaleString()}
              </p>
              {!countdownLabel && now > end ? (
                <p className="text-xs text-slate-500">Zápis již byl ukončen.</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* 🧩 KARTA 3 – bloky zápisu */}
        <EnrollmentBlocks enrollment={ew} currentUser={user} />
      </div>

      {editEnrollment && (
        <EditEnrollmentDialog
          enrollment={editEnrollment}
          onOpenChange={(open) => {
            if (!open) setEditEnrollment(null);
          }}
        />
      )}
    </>
  );
}
