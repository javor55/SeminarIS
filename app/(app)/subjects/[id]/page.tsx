"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getSubjects,
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import { StudentsDialog } from "@/components/enrollment/StudentsDialog";
import {
  EnrollmentWindowWithBlocks,
  SubjectOccurrence,
  Block,
} from "@/lib/types";
import { EditSubjectOccurrenceDialog } from "@/components/enrollment/EditSubjectOccurrenceDialog";

function getWindowStatusLabel(ew: EnrollmentWindowWithBlocks, now = new Date()) {
  const start = new Date(ew.startsAt);
  const end = new Date(ew.endsAt);
  if (now < start) return "Naplánováno";
  if (now >= start && now <= end) return "Otevřeno";
  return "Uzavřeno";
}

export default function SubjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = useAuth();
  const router = useRouter();
  const subjects = getSubjects();
  const subject = subjects.find((s) => s.id === params.id);

  const enrollmentWindows = getEnrollmentWindowsVisible()
    .map((w) => getEnrollmentWindowByIdWithBlocks(w.id))
    .filter(Boolean) as EnrollmentWindowWithBlocks[];

  // ❗ tady přidáme i block
  const occurrences =
    enrollmentWindows.flatMap((ew) =>
      ew.blocks.flatMap((block) =>
        block.occurrences
          .filter((occ: any) => occ.subject.id === params.id)
          .map((occ: any) => ({
            ...occ,
            blockName: block.name,
            block, // <- přidáno
            enrollmentWindow: ew,
          }))
      )
    ) || [];

  // teď už nebudeme držet enrollment, ale block
  const [selectedStudents, setSelectedStudents] = useState<{
    occurrenceId: string;
    block: Block & { occurrences: any[] };
  } | null>(null);

  const [editOccurrence, setEditOccurrence] = useState<
    (SubjectOccurrence & any) | null
  >(null);

  if (!subject) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Předmět nenalezen</h1>
        <p className="text-muted-foreground">
          Předmět s ID <code>{params.id}</code> nebyl nalezen.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Karta: název + popis */}
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{subject.name}</h1>
              {subject.code ? (
                <span className="text-xs bg-slate-100 px-2 py-1 rounded-md">
                  {subject.code}
                </span>
              ) : null}
            </div>

            {(user?.role === "ADMIN" || user?.role === "TEACHER") && (
              <Button
                size="sm"
                onClick={() => router.push(`/subjects/${subject.id}/edit`)}
              >
                Upravit předmět
              </Button>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {subject.description || "Tento předmět nemá popis."}
          </p>
        </div>

        {/* Karta: sylabus */}
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <h2 className="text-base font-semibold">Sylabus</h2>

          {subject.syllabus ? (
            <div
              className="tiptap-view"
              dangerouslySetInnerHTML={{ __html: subject.syllabus }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Sylabus není k dispozici.
            </p>
          )}
        </div>

        {/* Karta: výskyty */}
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="text-base font-semibold">
              Výskyty předmětu v zápisech
            </h2>
            <p className="text-sm text-muted-foreground">
              Přehled všech bloků a zápisových oken, kde je tento předmět
              zařazen.
            </p>
          </div>
          {occurrences.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Tento předmět momentálně není v žádném zápisu nabízen.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b text-left">
                <tr>
                  <th className="px-4 py-2">Zápis</th>
                  <th className="px-4 py-2">Stav</th>
                  <th className="px-4 py-2">Blok</th>
                  <th className="px-4 py-2">Kód výskytu</th>
                  <th className="px-4 py-2">Učitel</th>
                  <th className="px-4 py-2 text-center">Obsaz.</th>
                  <th className="px-4 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map((occ: any) => {
                  const enrolledCount = occ.enrollments?.length ?? 0;
                  const capacityText =
                    occ.capacity == null
                      ? `${enrolledCount}/∞`
                      : `${enrolledCount}/${occ.capacity}`;
                  const hasStudents = enrolledCount > 0;
                  const ew = occ.enrollmentWindow as EnrollmentWindowWithBlocks;
                  const statusLabel = getWindowStatusLabel(ew);
                  const fullCode = occ.subject?.code
                    ? `${occ.subject.code}${
                        occ.subCode ? "/" + occ.subCode : ""
                      }`
                    : occ.subCode || "—";

                  return (
                    <tr
                      key={occ.id}
                      className="border-b last:border-0 hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-2">{ew?.name ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2">{occ.blockName}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">
                        {fullCode}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {occ.teacher
                          ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">
                        {capacityText}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-2 justify-end flex-wrap">
                          {user?.role === "STUDENT" && (
                            <Button size="sm" variant="outline">
                              Zapsat
                            </Button>
                          )}

                          {(user?.role === "ADMIN" ||
                            user?.role === "TEACHER") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setSelectedStudents({
                                  occurrenceId: occ.id,
                                  block: occ.block, // <- tady pošleme blok
                                })
                              }
                            >
                              Studenti
                            </Button>
                          )}

                          {user?.role === "ADMIN" && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setEditOccurrence(occ)}
                              >
                                Upravit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={hasStudents}
                                onClick={() => {
                                  // tady bys řešil smazání výskytu
                                  console.log("smazat výskyt", occ.id);
                                }}
                              >
                                Smazat
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* dialog se studenty – teď jen s blockem */}
      {selectedStudents && user && (
        <StudentsDialog
          occurrenceId={selectedStudents.occurrenceId}
          block={selectedStudents.block}
          currentUser={user}
          onOpenChange={(open) => {
            if (!open) setSelectedStudents(null);
          }}
        />
      )}

      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
        />
      )}
    </>
  );
}
