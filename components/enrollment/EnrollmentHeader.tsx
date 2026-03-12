"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EditEnrollmentDialog } from "@/components/enrollment/EditEnrollmentDialog";
import { User, EnrollmentWindowWithBlocks } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Calendar, Download, ChevronDown } from "lucide-react";

import { EditBlockDialog } from "@/components/blocks/EditBlockDialog";
import { createBlock, getEnrollmentMatrixData, getEnrollmentDetails } from "@/lib/data";
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

const emptyBlockData = { id: "", name: "", description: "" };

export function EnrollmentHeader({
  enrollmentWindow: ew,
  currentUser: user,
}: EnrollmentHeaderProps) {
  const router = useRouter();

  const [now, setNow] = useState(new Date());
  const [editEnrollment, setEditEnrollment] = useState<any | null>(null);
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
      const headers = ["Příjmení", "Jméno", "Email", "Ročník", ...data.blocks.map(b => b.name)];
      const rows = data.students.map(s => {
        const row = [
          s.lastName || "",
          s.firstName || "",
          s.email || "",
          s.cohort || "",
          ...data.blocks.map(b => {
             const ch = s.choices[b.id];
             if (!ch) return "—";
             const timeStr = new Date(ch.at).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
             return `${ch.label} (${timeStr})`;
          })
        ];
        return row.map(cell => `"${(cell || "").toString().replace(/"/g, '""')}"`);
      });

      const csv = [headers.map(h => `"${h}"`), ...rows].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `export_matice_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Matrix export dokončen.");
    } catch (err: any) {
      toast.error(err.message || "Export se nezdařil.");
    }
  };

  const handleExportStudentList = async () => {
    try {
      const { window, allStudents } = await getEnrollmentDetails(ew.id);
      const headers = ["Příjmení", "Jméno", "Email", "Ročník", "Blok", "Předmět", "Kód semináře", "Vyučující", "Zapsáno dne"];
      const rows: string[][] = [];

      window.blocks.forEach(b => {
        b.subjectOccurrences.forEach(occ => {
          occ.studentEnrollments.forEach(en => {
            rows.push([
              en.student.lastName,
              en.student.firstName,
              en.student.email,
              en.student.cohort || "",
              b.name,
              occ.subject.name,
              occ.subCode || "",
              occ.teacher ? `${occ.teacher.firstName} ${occ.teacher.lastName}` : "—",
              new Date(en.createdAt).toLocaleString("cs-CZ")
            ]);
          });
        });
      });

      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `seznam_studentu_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Seznam studentů exportován.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExportSubjectOccupancy = async () => {
    try {
      const { window } = await getEnrollmentDetails(ew.id);
      const headers = ["Blok", "Předmět", "Kód semináře", "Vyučující", "Kapacita", "Obsazeno", "Studenti"];
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
      downloadCSV(csv, `obsazenost_seminaru_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Obsazenost exportována.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExportTeacherReports = async () => {
    try {
      const { window } = await getEnrollmentDetails(ew.id);
      const headers = ["Učitel", "Blok", "Předmět", "Kód", "Student", "Email", "Ročník"];
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
              en.student.cohort || ""
            ]);
          });
        });
      });
      // Seřadit podle učitele
      rows.sort((a,b) => a[0].localeCompare(b[0], 'cs'));

      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `sestavy_pro_ucitele_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Sestavy pro učitele exportovány.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExportMissingEnrollments = async () => {
    try {
      const { window, allStudents } = await getEnrollmentDetails(ew.id);
      const blockCount = window.blocks.length;

      // Spočítat kolik má kdo zápisů v tomto okně
      const studentCounts = new Map<string, number>();
      window.blocks.forEach(b => {
        b.subjectOccurrences.forEach(occ => {
          occ.studentEnrollments.forEach(en => {
            studentCounts.set(en.studentId, (studentCounts.get(en.studentId) || 0) + 1);
          });
        });
      });

      const headers = ["Příjmení", "Jméno", "Email", "Ročník", "Počet zápisů", "Stav"];
      const rows: string[][] = [];

      allStudents.forEach(s => {
        const count = studentCounts.get(s.id) || 0;
        if (count < blockCount) {
          rows.push([
            s.lastName,
            s.firstName,
            s.email,
            s.cohort || "",
            count.toString(),
            count === 0 ? "ABSENCE" : "NEÚPLNÉ"
          ]);
        }
      });

      const csv = [headers.map(h => `"${h}"`), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`))].map(e => e.join(";")).join("\n");
      downloadCSV(csv, `chybejici_zapisy_${ew.name.replace(/\s+/g, "_")}.csv`);
      toast.success("Report nezapsaných exportován.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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

      {user.role === "GUEST" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-md flex items-center gap-3">
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

      {/* --- Sekce tlačítek --- */}
      {isAdmin && (
        <div className="flex justify-end gap-2">
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
                Obsazenost seminářů
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

      {/* Dialog pro úpravu */}
      {editEnrollment && (
        <EditEnrollmentDialog
          enrollment={editEnrollment}
          onOpenChange={(open) => {
            if (!open) setEditEnrollment(null);
          }}
        />
      )}
      
      {/* Dialog pro zbrusu nový blok */}
      <EditBlockDialog
        open={isCreatingBlock}
        onOpenChange={setIsCreatingBlock}
        block={emptyBlockData}
        onSubmit={async (data) => {
          try {
            await createBlock(ew.id, data.name, data.description);
            router.refresh();
            setIsCreatingBlock(false);

          } catch (e) {
            console.error(e);
            alert("Nepodařilo se vytvořit blok.");
          }
        }}
      />
    </>
  );
}