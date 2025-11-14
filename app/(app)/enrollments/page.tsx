"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import { EditEnrollmentDialog } from "@/components/enrollment/EditEnrollmentDialog";
import { DataTable } from "@/components/ui/data-table";
import {
  getEnrollmentColumns,
  EnrollmentRow,
} from "@/components/enrollment/enrollment-columns";
import { EnrollmentWindow, EnrollmentStatus } from "@/lib/types";

// ... (Data pro "vytvoření" nového zápisu (mock) zůstávají stejná)
const newEnrollmentMock = {
  name: "Nový zápis",
  description: "",
  status: "DRAFT",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  visibleToStudents: false,
};

export default function EnrollmentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [editEnrollment, setEditEnrollment] = useState<any | null>(null);

  const visible = getEnrollmentWindowsVisible();
  const enrollmentWithBlocks = visible
    .map((ew) => getEnrollmentWindowByIdWithBlocks(ew.id))
    .filter(Boolean) as any[];
  
  // ... (KROK 1: Před-zpracování dat pro DataTable - 'rows' - zůstává stejný)
  const rows = useMemo(() => {
    return enrollmentWithBlocks.map((ew) => {
      const allBlockIds = new Set<string>(ew.blocks?.map((b: any) => b.id) ?? []);
      const allStudents = new Set<string>();
      const studentBlockMap = new Map<string, Set<string>>();

      ew.blocks?.forEach((block: any) => {
        block.occurrences?.forEach((occ: any) => {
          occ.enrollments?.forEach((en: any) => {
            const sid = en.student?.id ?? en.studentId;
            if (sid) {
              allStudents.add(sid);
              if (!studentBlockMap.has(sid)) {
                studentBlockMap.set(sid, new Set<string>());
              }
              studentBlockMap.get(sid)!.add(block.id);
            }
          });
        });
      });

      const blocksWithCounts =
        ew.blocks?.map((block: any) => {
          return {
            id: block.id,
            name: block.name,
            count: block.occurrences?.length ?? 0,
          };
        }) ?? [];
      
      const uniqueStudentCount = allStudents.size;

      let fullyEnrolledCount = 0;
      if (allBlockIds.size > 0) {
        for (const enrolledBlocks of studentBlockMap.values()) {
          if (enrolledBlocks.size === allBlockIds.size) {
            fullyEnrolledCount++;
          }
        }
      }

      return {
        ...(ew as EnrollmentWindow),
        status: ew.status as EnrollmentStatus,
        uniqueStudentCount,
        fullyEnrolledCount,
        blocksWithCounts,
        fullData: ew,
      } as EnrollmentRow;
    });
  }, [enrollmentWithBlocks]);

  // ... (KROK 2: Definice sloupců - zůstává stejný)
  const columns = useMemo(
    () =>
      getEnrollmentColumns({
        currentUser: user,
        onEdit: (row) => setEditEnrollment(row.fullData),
      }),
    [user]
  );

  return (
    <>
      <div className="space-y-6">
        {/* ... (Hlavička stránky a tlačítko "Vytvořit" - zůstávají stejné) */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Zápisová období</h1>
            <p className="text-sm text-muted-foreground">
              Přehled všech zápisů, bloků a počtu unikátních studentů.
            </p>
          </div>
          {user?.role === "ADMIN" && (
            <Button onClick={() => setEditEnrollment(newEnrollmentMock)}>
              Vytvořit nový zápis
            </Button>
          )}
        </div>

        {/* 🔥 KROK 3: DataTable s přidaným filtrem */}
        <DataTable<EnrollmentRow>
          data={rows}
          columns={columns}
          searchKeys={["name"]}
          searchPlaceholder="Hledat podle názvu..."
          selectFilters={[
            {
              columnId: "status",
              label: "Stav",
              options: [
                { label: "Koncept", value: "DRAFT" },
                { label: "Naplánováno", value: "SCHEDULED" },
                { label: "Otevřeno", value: "OPEN" },
                { label: "Uzavřeno", value: "CLOSED" },
              ],
            },
            // 🔥 ZDE JE PŘIDÁN NOVÝ FILTR
            {
              columnId: "visibleToStudents",
              label: "Viditelnost",
              options: [
                { label: "Viditelné studentům", value: "yes" },
                { label: "Skryté studentům", value: "no" },
              ],
            },
          ]}
          dateFilters={[
            {
              id: "startsAt",
              label: "Začátek",
              getDate: (row) => new Date(row.startsAt),
            },
            {
              id: "endsAt",
              label: "Konec",
              getDate: (row) => new Date(row.endsAt),
            },
          ]}
        />
      </div>

      {/* ... (Dialog - zůstává stejný) ... */}
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