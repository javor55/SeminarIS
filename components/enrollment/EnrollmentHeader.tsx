"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EditEnrollmentDialog } from "@/components/enrollment/EditEnrollmentDialog";
import { User, EnrollmentWindowWithBlocks } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

// --- Funkce pro výpočet absolutního stavu ---
function computeStatus(
  startsAt: string,
  endsAt: string,
  now: Date = new Date()
) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (now < start)
    return {
      label: "Naplánováno",
      className: "text-blue-600",
      is: "planned",
    };
  if (now >= start && now <= end)
    return { label: "Otevřeno", className: "text-emerald-600", is: "open" };
  return { label: "Uzavřeno", className: "text-slate-500", is: "closed" };
}

// Pomocná funkce pro formátování data
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type EnrollmentHeaderProps = {
  enrollmentWindow: EnrollmentWindowWithBlocks;
  currentUser: User;
};

export function EnrollmentHeader({
  enrollmentWindow: ew,
  currentUser: user,
}: EnrollmentHeaderProps) {
  const [now, setNow] = useState(new Date());
  const [editEnrollment, setEditEnrollment] = useState<any | null>(null);

  // 1) Časovač
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2) Stav zápisu (status)
  const { absoluteStatus } = useMemo(() => {
    const absStatus = computeStatus(ew.startsAt, ew.endsAt, now);
    
    return {
      absoluteStatus: absStatus,
    };
  }, [ew, now]);

  const isAdmin = user.role === "ADMIN";

  return (
    <>
      {/* --- Sekce se dvěma kartami --- */}
      <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
        
        {/* KARTA 1: Levá (Název, Popis) */}
        <div
          className={cn(
            "rounded-lg border bg-card text-card-foreground shadow-sm w-full flex-1"
          )}
        >
          <div className="p-6">
            <h1 className="text-2xl font-semibold">{ew.name}</h1>
            {ew.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {ew.description}
              </p>
            )}
          </div>
        </div>

        {/* KARTA 2: Pravá (Stav, Data) */}
        <div
          className={cn(
            "rounded-lg border bg-card text-card-foreground shadow-sm flex-shrink-0",
            "w-full md:w-auto"
          )}
        >
          <div className="p-6 flex"> 
            
            {/* Sloupec 1: Začátek a Konec */}
            <div className="space-y-2 text-sm pr-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Začátek: {formatDateTime(ew.startsAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Konec: {formatDateTime(ew.endsAt)}</span>
              </div>
            </div>

            {/* Sloupec 2: Stav */}
            <div className="space-y-4 pl-6 border-l border-slate-200">
              {/* Stav */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Stav</div>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    absoluteStatus.className
                  )}
                >
                  {absoluteStatus.label}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* --- Sekce tlačítek --- */}
      {isAdmin && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditEnrollment(ew)}>
            Upravit zápis
          </Button>
          <Button
            onClick={() => {
              console.log("TODO: přidat blok do zápisu", ew.id);
            }}
          >
            Přidat blok
          </Button>
        </div>
      )}

      {/* Dialog pro úpravu */}
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