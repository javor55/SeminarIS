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

function computeStatus(
  startsAt: string,
  endsAt: string,
  now: Date = new Date()
) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (now < start) return { label: "Naplánováno", className: "text-blue-600" };
  if (now >= start && now <= end)
    return { label: "Otevřeno", className: "text-emerald-600" };
  return { label: "Uzavřeno", className: "text-slate-500" };
}

export default function EnrollmentsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [editEnrollment, setEditEnrollment] = useState<any | null>(null);

  const visible = getEnrollmentWindowsVisible();
  const enrollmentWithBlocks = visible
    .map((ew) => getEnrollmentWindowByIdWithBlocks(ew.id))
    .filter(Boolean) as any[];

  const now = useMemo(() => new Date(), []);

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
        </div>

        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="min-w-full text-sm align-top">
            <thead className="bg-slate-50 border-b text-left">
              <tr>
                <th className="px-4 py-2">Název</th>
                <th className="px-4 py-2">Začátek</th>
                <th className="px-4 py-2">Konec</th>
                <th className="px-4 py-2">Stav</th>
                <th className="px-4 py-2">Bloky (zapsaní)</th>
                <th className="px-4 py-2 text-center">
                  Zapsáno unikátních studentů
                </th>
                <th className="px-4 py-2 text-right">Akce</th>
              </tr>
            </thead>

            <tbody>
              {enrollmentWithBlocks.map((ew) => {
                const status = computeStatus(ew.startsAt, ew.endsAt, now);

                // unikátní studenti za celé období
                const windowStudents = new Set<string>();
                ew.blocks?.forEach((block: any) => {
                  block.occurrences?.forEach((occ: any) => {
                    occ.enrollments?.forEach((en: any) => {
                      const sid = en.student?.id ?? en.studentId;
                      if (sid) windowStudents.add(sid);
                    });
                  });
                });

                // bloky s počty
                const blocksWithCounts =
                  ew.blocks?.map((block: any) => {
                    const blockStudents = new Set<string>();
                    block.occurrences?.forEach((occ: any) => {
                      occ.enrollments?.forEach((en: any) => {
                        const sid = en.student?.id ?? en.studentId;
                        if (sid) blockStudents.add(sid);
                      });
                    });
                    return {
                      id: block.id,
                      name: block.name,
                      count: blockStudents.size,
                    };
                  }) ?? [];

                return (
                  <tr
                    key={ew.id}
                    className="border-b last:border-0 hover:bg-slate-50 transition"
                  >
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{ew.name}</span>
                        {ew.description && (
                          <span className="text-xs text-slate-500">
                            {ew.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(ew.startsAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(ew.endsAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className={status.className}>{status.label}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        {blocksWithCounts.length === 0 && (
                          <span className="text-xs text-slate-400">
                            Žádné bloky
                          </span>
                        )}
                        {blocksWithCounts.map((b: any) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1 text-xs text-slate-700"
                          >
                            <span>{b.name}</span>
                            <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                              {b.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center font-medium text-slate-700">
                      {windowStudents.size}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        onClick={() => router.push("/dashboard")}
                      >
                        Otevřít
                      </Button>
                      {(user?.role === "ADMIN" || user?.role === "TEACHER") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditEnrollment(ew)}
                        >
                          Upravit zápis
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {enrollmentWithBlocks.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Žádná zápisová období k zobrazení.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
