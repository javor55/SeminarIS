"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getSubjects,
  getEnrollmentWindowsVisible,
  getEnrollmentWindowByIdWithBlocks,
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import { OccurrencesStudentsDialog } from "@/components/occurrences/OccurrencesStudentsDialog";
import {
  Block,
  EnrollmentWindowWithBlocks,
} from "@/lib/types";
import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { DataTable } from "@/components/common/data-table";
import {
  OccurrenceRow,
  getOccurrenceColumns,
} from "@/components/occurrences/occurrence-columns";
import { users } from "@/lib/mock-db";

function getWindowStatusLabel(
  ew: EnrollmentWindowWithBlocks,
  now = new Date()
) {
  const start = new Date(ew.startsAt);
  const end = new Date(ew.endsAt);
  if (now < start) return "Naplánováno";
  if (now >= start && now <= end) return "Otevřeno";
  return "Uzavřeno";
}

function getUserName(userId?: string) {
  if (!userId) return "—";
  const u = users.find((x) => x.id === userId);
  if (!u) return userId;
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.email || userId;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
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

  // Připravíme řádky pro DataTable (OccurrenceRow)
  const occurrences: OccurrenceRow[] =
    enrollmentWindows.flatMap((ew) =>
      ew.blocks.flatMap((block) =>
        block.occurrences
          .filter((occ: any) => occ.subject.id === params.id)
          .map((occ: any) => {
            const enrolledCount = occ.enrollments
              ? occ.enrollments.filter((e: any) => !e.deletedAt).length
              : 0;

            const capacityText =
              occ.capacity == null
                ? `${enrolledCount}/∞`
                : `${enrolledCount}/${occ.capacity}`;

            const hasStudents = enrolledCount > 0;

            const fullCode = occ.subject?.code
              ? `${occ.subject.code}${occ.subCode ? "/" + occ.subCode : ""}`
              : occ.subCode ?? "—";

            const teacherName = occ.teacher
              ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
              : "—";

            const statusLabel = getWindowStatusLabel(ew);

            const searchText = [
              ew.name,
              block.name,
              fullCode,
              teacherName,
            ]
              .filter(Boolean)
              .join(" ");

            return {
              ...(occ as any),
              blockName: block.name,
              block: block as Block & { occurrences: any[] },
              enrollmentWindow: ew,
              enrollmentName: ew.name,
              statusLabel,
              capacityText,
              hasStudents,
              fullCode,
              teacherName,
              searchText,
            } as OccurrenceRow;
          })
      )
    ) || [];

  // Dialog "Studenti"
  const [selectedStudents, setSelectedStudents] = useState<{
    occurrenceId: string;
    block: Block & { occurrences: any[] };
  } | null>(null);

  // Dialog "Upravit výskyt"
  const [editOccurrence, setEditOccurrence] = useState<OccurrenceRow | null>(
    null
  );

  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser: user ?? null,
        onStudents: (occ) =>
          setSelectedStudents({
            occurrenceId: occ.id,
            block: occ.block,
          }),
        onEdit: (occ) => setEditOccurrence(occ),
        onDelete: (occ) => {
          // Tady můžeš napojit reálné mazání výskytu (mock-db funkce)
          // Např.: deleteSubjectOccurrence(occ.id)
          console.log("Smazat výskyt (TODO):", occ.id);
        },
        onEnroll: (occ) => {
          // Tady můžeš napojit zápis studenta (enrollStudent)
          console.log("Zapsat studenta (TODO) do:", occ.id);
        },
      }),
    [user]
  );

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

  const createdByName = getUserName((subject as any).createdById);
  const updatedByName = getUserName((subject as any).updatedById);
  const createdAt = formatDate((subject as any).createdAt);
  const updatedAt = formatDate((subject as any).updatedAt);

  return (
    <>
      <div className="space-y-6">
        {/* Karta: název + popis + audit */}
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold">{subject.name}</h1>
                {subject.code ? (
                  <span className="text-xs bg-slate-100 px-2 py-1 rounded-md">
                    {subject.code}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {subject.description || "Tento předmět nemá popis."}
              </p>
              <p className="text-xs text-muted-foreground">
                Vytvořil: <strong>{createdByName}</strong> dne{" "}
                <strong>{createdAt}</strong>
                <br />
                Poslední úprava: <strong>{updatedByName}</strong> dne{" "}
                <strong>{updatedAt}</strong>
              </p>
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
        </div>

        {/* Karta: Sylabus */}
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          <h2 className="text-base font-semibold">Sylabus</h2>
          {subject.syllabus ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: (subject as any).syllabus ?? "",
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Sylabus není k dispozici.
            </p>
          )}
        </div>

        {/* Karta: Výskyty – DataTable */}
        <div className="space-y-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">
              Výskyty předmětu v zápisech
            </h2>
            <p className="text-sm text-muted-foreground">
              Přehled všech bloků a zápisových oken, kde je tento předmět
              zařazen.
            </p>
          </div>

          {occurrences.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">
              Tento předmět momentálně není v žádném zápisu nabízen.
            </p>
          ) : (
            <DataTable<OccurrenceRow>
              data={occurrences}
              columns={columns}
              searchPlaceholder="Hledat podle zápisu, bloku, učitele nebo kódu…"
              searchKeys={["searchText"]}
            />
          )}
        </div>
      </div>

      {/* Dialog se studenty */}
      {selectedStudents && user && (
        <OccurrencesStudentsDialog
          occurrenceId={selectedStudents.occurrenceId}
          block={selectedStudents.block}
          currentUser={user}
          onOpenChange={(open) => {
            if (!open) setSelectedStudents(null);
          }}
        />
      )}

      {/* Dialog pro editaci výskytu */}
      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
        />
      )}
    </>
  );
}
