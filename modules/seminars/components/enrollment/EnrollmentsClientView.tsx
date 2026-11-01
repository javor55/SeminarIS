// components/enrollment/EnrollmentsClientView.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { EditEnrollmentDialog } from "@/modules/seminars/components/enrollment/EditEnrollmentDialog";
import { DataTable } from "@/components/ui/data-table";
import {
  getEnrollmentColumns,
  EnrollmentRow,
} from "@/modules/seminars/components/enrollment/enrollment-columns";
import { EnrollmentWindow, User, EnrollmentWindowWithBlocks } from "@/lib/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import { formatDateTime } from "@/lib/datetime";
import { WindowPhaseBadge } from "@/modules/seminars/components/enrollment/enrollment-columns";
import { PageHeader } from "@/components/page-header";

const newEnrollmentMock: Partial<EnrollmentWindow> = {
  id: "", 
  name: "Nový zápis",
  description: "",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  published: false,
};

interface EnrollmentsClientViewProps {
  enrollments: EnrollmentWindowWithBlocks[];
  currentUser: User;
  // Výchozí hodnoty nového okna z nastavení modulu
  newWindowDefaults?: { published: boolean; reminderDaysBefore: number | null };
}

export function EnrollmentsClientView({ enrollments, currentUser, newWindowDefaults }: EnrollmentsClientViewProps) {
  const [editEnrollment, setEditEnrollment] = useState<EnrollmentWindowWithBlocks | Partial<EnrollmentWindow> | null>(null);

  const rows: EnrollmentRow[] = useMemo(() => {
    return enrollments.map((ew) => {
      const allBlockIds = new Set<string>(ew.blocks?.map((b) => b.id) ?? []);
      const allStudents = new Set<string>();
      const studentBlockMap = new Map<string, Set<string>>();

      ew.blocks?.forEach((block) => {
        block.occurrences?.forEach((occ) => {
          occ.enrollments?.forEach((en) => {
            const sid = en.studentId;
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
        ew.blocks?.map((block) => {
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
        uniqueStudentCount,
        fullyEnrolledCount,
        blocksWithCounts,
        fullData: ew,
      } as EnrollmentRow;
    });
  }, [enrollments]);

  const columns = useMemo(
    () =>
      getEnrollmentColumns({
        currentUser,
        onEdit: (row) => setEditEnrollment(row.fullData as EnrollmentWindowWithBlocks),
      }),
    [currentUser]
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Zápisová období"
          description="Přehled všech zápisů, bloků a počtu unikátních studentů."
          actions={
            currentUser.role === "ADMIN" ? (
              <Button onClick={() => setEditEnrollment({ ...newEnrollmentMock, ...newWindowDefaults })}>Vytvořit nový zápis</Button>
            ) : undefined
          }
        />

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="max-w-[400px]">
              <h3 className="text-lg font-semibold">Žádná zápisová období</h3>
              <p className="text-sm text-muted-foreground">
                Zatím jste nevytvořili žádné zápisové období. Začněte vytvořením prvního, 
                definujte časové rozmezí a přidejte do něj bloky s předměty.
              </p>
            </div>
            {currentUser.role === "ADMIN" && (
              <Button onClick={() => setEditEnrollment({ ...newEnrollmentMock, ...newWindowDefaults })}>
                Vytvořit první zápis
              </Button>
            )}
          </div>
        ) : (
          <DataTable<EnrollmentRow>
            data={rows}
            columns={columns}
            renderCard={(r) => (
              <MobileCard
                data-testid="enrollment-card"
                title={
                  <Link href={`/enrollments/${r.id}`} className="text-info hover:underline">
                    {r.name}
                  </Link>
                }
                badge={<WindowPhaseBadge window={r} />}
                actions={
                  currentUser.role === "ADMIN" ? (
                    <Button variant="outline" onClick={() => setEditEnrollment(r.fullData as EnrollmentWindowWithBlocks)}>
                      Upravit zápis
                    </Button>
                  ) : undefined
                }
              >
                {r.description && <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                <MobileCardField label="Publikum">{r.audienceView?.summary ?? "—"}</MobileCardField>
                <MobileCardField label="Začátek">{formatDateTime(r.startsAt)}</MobileCardField>
                <MobileCardField label="Konec">{formatDateTime(r.endsAt)}</MobileCardField>
                <MobileCardField label="Zapsaní studenti">{r.uniqueStudentCount}</MobileCardField>
                <MobileCardField label="Kompletně zapsaní">{r.fullyEnrolledCount}</MobileCardField>
                {r.blocksWithCounts.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.blocksWithCounts.map((b) => (
                      <Badge key={b.id} variant="muted" className="font-normal">
                        {b.name} · {b.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </MobileCard>
            )}
            searchKeys={["name"]}
            searchPlaceholder="Hledat podle názvu..."
            selectFilters={[
              {
                columnId: "phase",
                label: "Stav",
                options: [
                  { label: "Koncept (studenti nevidí)", value: "DRAFT" },
                  { label: "Naplánováno", value: "PLANNED" },
                  { label: "Otevřeno", value: "OPEN" },
                  { label: "Uzavřeno", value: "CLOSED" },
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
        )}
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
