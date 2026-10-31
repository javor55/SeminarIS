"use client";

import { unwrap } from "@/lib/action-result";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EditEnrollmentDialog } from "@/modules/seminars/components/enrollment/EditEnrollmentDialog";
import { User, EnrollmentWindowWithBlocks } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Calendar, Download, ChevronDown, Users } from "lucide-react";

import { EditBlockDialog } from "@/modules/seminars/components/blocks/EditBlockDialog";
import { createBlock, duplicateEnrollmentWindow, getEnrollmentMatrixData, getEnrollmentDetails } from "@/modules/seminars/actions/windows";
import { getUnenrolledView } from "@/modules/seminars/actions/unenrolled";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { computeEnrollmentStatus } from "@/lib/utils";
import { formatDateTime } from "@/lib/datetime";


type EnrollmentHeaderProps = {
  enrollmentWindow: EnrollmentWindowWithBlocks;
  currentUser: User;
};

const emptyBlockData = { id: "", name: "", description: "" };

export function EnrollmentHeader({
  enrollmentWindow: ew,
  currentUser: user,
}: EnrollmentHeaderProps) {
  const router = useRouter();

  const [now, setNow] = useState(new Date());
  const [editEnrollment, setEditEnrollment] = useState<EnrollmentWindowWithBlocks | null>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);

  // 1) Časovač
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2) Stav zápisu (status)
  const { absoluteStatus } = useMemo(() => {
    const absStatus = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt, now);
    
    return {
      absoluteStatus: absStatus,
    };
  }, [ew, now]);

  const isAdmin = user.role === "ADMIN";

  const downloadCSV = (content: string, filename: string) => {
    const csvContent = "\uFEFF" + content;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMatrix = async () => {
    try {
      const data = await getEnrollmentMatrixData(ew.id);
      const headers = ["Příjmení", "Jméno", "Email", "Třída", ...data.blocks.map(b => b.name)];
      const rows = data.students.map(s => {
        const row = [
          s.lastName || "",
          s.firstName || "",
          s.email || "",
          s.classLabel || "",
          ...data.blocks.map(b => {
             const ch = s.choices[b.id];
             if (!ch) return "—";
             const timeStr = formatDateTime(ch.at);
             return `${ch.label} (${timeStr})`;
          })
        ];
        return row.map(cell => `"${(cell || "").toString().replace(/"/g, '""')}"`);
      });

      const csv = [headers.map(h => `"${h}"`), ...rows].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `export_matice_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Matrix export dokončen.");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Export se nezdařil.");
    }
  };

  const handleExportStudentList = async () => {
    try {
      const { window, classLabels } = await getEnrollmentDetails(ew.id);
      const headers = ["Příjmení", "Jméno", "Email", "Třída", "Blok", "Předmět", "Kód předmětu", "Vyučující", "Zapsáno dne"];
      const rows: string[][] = [];

      window.blocks.forEach(b => {
        b.subjectOccurrences.forEach(occ => {
          occ.studentEnrollments.forEach(en => {
            rows.push([
              en.student.lastName,
              en.student.firstName,
              en.student.email,
              classLabels[en.studentId] || "",
              b.name,
              occ.subject.name,
              occ.subCode || "",
              occ.teacher ? `${occ.teacher.firstName} ${occ.teacher.lastName}` : "—",
              formatDateTime(en.createdAt)
            ]);
          });
        });
      });

      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `seznam_studentu_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Seznam studentů exportován.");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Export se nezdařil.");
    }
  };

  const handleExportSubjectOccupancy = async () => {
    try {
      const { window } = await getEnrollmentDetails(ew.id);
      const headers = ["Blok", "Předmět", "Kód předmětu", "Vyučující", "Kapacita", "Obsazeno", "Studenti"];
      const rows: string[][] = [];

      window.blocks.forEach(b => {
        b.subjectOccurrences.forEach(occ => {
          const students = occ.studentEnrollments.map(e => `${e.student.lastName} ${e.student.firstName}`).join(", ");
          rows.push([
            b.name,
            occ.subject.name,
            occ.subCode || "",
            occ.teacher ? `${occ.teacher.firstName} ${occ.teacher.lastName}` : "—",
            occ.capacity === null ? "∞" : occ.capacity.toString(),
            occ.studentEnrollments.length.toString(),
            students
          ]);
        });
      });

      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `obsazenost_predmetu_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Obsazenost exportována.");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Export se nezdařil.");
    }
  };

  const handleExportTeacherReports = async () => {
    try {
      const { window, classLabels } = await getEnrollmentDetails(ew.id);
      const headers = ["Učitel", "Blok", "Předmět", "Kód", "Student", "Email", "Třída"];
      const rows: string[][] = [];

      window.blocks.forEach(b => {
        b.subjectOccurrences.forEach(occ => {
          const teacherName = occ.teacher ? `${occ.teacher.firstName} ${occ.teacher.lastName}` : "NEPŘIŘAZEN";
          occ.studentEnrollments.forEach(en => {
            rows.push([
              teacherName,
              b.name,
              occ.subject.name,
              occ.subCode || "",
              `${en.student.lastName} ${en.student.firstName}`,
              en.student.email,
              classLabels[en.studentId] || ""
            ]);
          });
        });
      });
      // Seřadit podle učitele
      rows.sort((a,b) => a[0].localeCompare(b[0], 'cs'));

      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `sestavy_pro_ucitele_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Sestavy pro učitele exportovány.");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Export se nezdařil.");
    }
  };

  const handleExportMissingEnrollments = async () => {
    try {
      // Stejné pravidlo jako záložka Nezapsaní: povinné bloky, minimum zápisů, výskyty určené studentovi
      const view = await getUnenrolledView(ew.id);
      const headers = ["Příjmení", "Jméno", "Email", "Třída", "Chybějící bloky"];
      const rows = view.students.map((s) => [s.lastName, s.firstName, s.email, s.classLabel ?? "", s.missingBlocks.join(", ")]);
      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `chybejici_zapisy_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Report nezapsaných exportován.");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Export se nezdařil.");
    }
  };

  const handleDuplicate = async () => {
    try {
      const copy = unwrap(await duplicateEnrollmentWindow(ew.id));
      toast.success(`Vytvořena kopie „${copy.name}“ (koncept).`);
      router.push(`/enrollments/${copy.id}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Zápis se nepodařilo zduplikovat.");
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
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

        <div
          className={cn(
            "rounded-lg border bg-card text-card-foreground shadow-sm flex-shrink-0",
            "w-full md:w-auto"
          )}
        >
          <div className="p-6 flex"> 
            
            <div className="space-y-2 text-sm pr-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Začátek: {formatDateTime(ew.startsAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Konec: {formatDateTime(ew.endsAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="window-rules-summary">
                <span>
                  {ew.allowSelfUnenroll === false ? "Odepsání studentem: ne" : ew.changesUntil ? `Změny studenty do ${formatDateTime(ew.changesUntil)}` : "Změny studenty do konce zápisu"}
                  {" · "}
                  {ew.resultsVisibility === "NAMES" ? "studenti vidí jména zapsaných" : "studenti vidí jen počty"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span data-testid="window-audience">Pro: {ew.audienceView?.summary ?? "vybraní studenti"}</span>
              </div>
            </div>

            <div className="space-y-2 pl-6 border-l border-border">
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

              {absoluteStatus.is === "planned" && (() => {
                const diff = new Date(ew.startsAt).getTime() - now.getTime();
                if (diff <= 0) return null;
                const d = Math.floor(diff / 86400000);
                const h = Math.floor((diff % 86400000) / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                return (
                  <div className="text-xs text-info font-medium animate-pulse">
                    Otevře se za {d > 0 ? `${d}d ` : ""}{h}h {m}m {s}s
                  </div>
                );
              })()}
              {absoluteStatus.is === "open" && (() => {
                const diff = new Date(ew.endsAt).getTime() - now.getTime();
                if (diff <= 0) return null;
                const d = Math.floor(diff / 86400000);
                const h = Math.floor((diff % 86400000) / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                return (
                  <div className="text-xs text-success font-medium">
                    Uzavře se za {d > 0 ? `${d}d ` : ""}{h}h {m}m {s}s
                  </div>
                );
              })()}
            </div>

          </div>
        </div>
      </div>

      {user.role === "GUEST" && (
        <div className="bg-warning/10 border border-warning/30 text-warning p-4 rounded-md flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">Váš účet čeká na schválení administrátorem</p>
            <p className="text-xs mt-1">Nyní máte pouze oprávnění k prohlížení aktuálních zápisů. Nemůžete se zapisovat na žádné předměty.</p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Exportovat reporty
                <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Hlavní přehledy</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportMatrix}>
                Matice zápisů (s časy)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportStudentList}>
                Seznam studentů (lineární)
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Správa a učitelé</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportSubjectOccupancy}>
                Obsazenost předmětů
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportTeacherReports}>
                Sestavy pro učitele
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Kontrola</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportMissingEnrollments}>
                Chybějící zápisy (urgence)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ConfirmAction
            title="Duplikovat zápis?"
            description="Vznikne nový zápis jako koncept: zkopírují se bloky, předměty, publikum a pravidla. Zápisy studentů se nekopírují."
            actionLabel="Duplikovat"
            onConfirm={handleDuplicate}
            trigger={<Button variant="outline" data-testid="duplicate-window">Duplikovat</Button>}
          />
          <Button variant="outline" onClick={() => setEditEnrollment(ew)}>
            Upravit zápis
          </Button>
          <Button
            onClick={() => setIsCreatingBlock(true)}
          >
            Přidat blok
          </Button>
        </div>
      )}

      {editEnrollment && (
        <EditEnrollmentDialog
          enrollment={editEnrollment}
          onOpenChange={(open) => {
            if (!open) setEditEnrollment(null);
          }}
        />
      )}
      
      <EditBlockDialog
        open={isCreatingBlock}
        onOpenChange={setIsCreatingBlock}
        block={emptyBlockData}
        onSubmit={async (data) => {
          try {
            unwrap(await createBlock(ew.id, data.name, data.description, data));
            router.refresh();
            setIsCreatingBlock(false);

          } catch (e: unknown) {
            // eslint-disable-next-line no-console
            console.error(e);
            toast.error((e as Error).message || "Nepodařilo se vytvořit blok.");
          }
        }}
      />
    </>
  );
}