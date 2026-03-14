// app/enrollments/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getEnrollmentWindowsWithDetails,
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { EditEnrollmentDialog } from "@/components/enrollment/EditEnrollmentDialog";
import { DataTable } from "@/components/ui/data-table";
import {
  getEnrollmentColumns,
  EnrollmentRow,
} from "@/components/enrollment/enrollment-columns";
import { EnrollmentWindow, EnrollmentStatus, User, EnrollmentWindowWithBlocks } from "@/lib/types";

const newEnrollmentMock: Partial<EnrollmentWindow> = {
  id: "", 
  name: "Nový zápis",
  description: "",
  status: "DRAFT",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  visibleToStudents: false,
};

export default function EnrollmentsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [editEnrollment, setEditEnrollment] = useState<EnrollmentWindowWithBlocks | Partial<EnrollmentWindow> | null>(null);

  const [enrollmentWithBlocks, setEnrollmentWithBlocks] = useState<EnrollmentWindowWithBlocks[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    async function fetch() {
      const withB = await getEnrollmentWindowsWithDetails(false);
      setEnrollmentWithBlocks(withB);
      setLoadingData(false);
    }
    fetch();
  }, []);

  const rows: EnrollmentRow[] = useMemo(() => {
    return enrollmentWithBlocks.map((ew) => {
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
        status: ew.status as EnrollmentStatus,
        uniqueStudentCount,
        fullyEnrolledCount,
        blocksWithCounts,
        fullData: ew,
      } as EnrollmentRow;
    });
  }, [enrollmentWithBlocks]);

  const columns = useMemo(
    () =>
      getEnrollmentColumns({
        currentUser: user as User,
        onEdit: (row) => setEditEnrollment(row.fullData as EnrollmentWindowWithBlocks),
      }),
    [user]
  );

  if (isLoading || !user) {
    return null;
  }

  const isAllowed = user.role === "ADMIN" || user.role === "TEACHER";

  if (!isAllowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">
          Pro přístup k této stránce nemáte dostatečné oprávnění.
        </p>
      </div>
    );
  }

  if (loadingData) return <p className="mt-8 text-center text-muted-foreground">Načítám data zápisů...</p>;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Zápisová období</h1>
            <p className="text-sm text-muted-foreground">
              Přehled všech zápisů, bloků a počtu unikátních studentů.
            </p>
          </div>
          {user.role === "ADMIN" && (
            <Button onClick={() => setEditEnrollment(newEnrollmentMock)}>
              Vytvořit nový zápis
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-slate-400" />
            </div>
            <div className="max-w-[400px]">
              <h3 className="text-lg font-semibold">Žádná zápisová období</h3>
              <p className="text-sm text-muted-foreground">
                Zatím jste nevytvořili žádné zápisové období. Začněte vytvořením prvního, 
                definujte časové rozmezí a přidejte do něj bloky se semináři.
              </p>
            </div>
            {user.role === "ADMIN" && (
              <Button onClick={() => setEditEnrollment(newEnrollmentMock)}>
                Vytvořit první zápis
              </Button>
            )}
          </div>
        ) : (
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