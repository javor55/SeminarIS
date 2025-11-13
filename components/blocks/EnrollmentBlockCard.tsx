"use client";

import { useMemo, useState } from "react";
import { Block, SubjectOccurrence, User } from "@/lib/types";
import { cn } from "@/lib/utils";

import { BlockHeader } from "@/components/blocks/BlockHeader";
import { DataTable } from "@/components/common/data-table";
import {
  getOccurrenceColumns,
  OccurrenceRow,
} from "@/components/occurrences/occurrence-columns";

import { Button } from "@/components/ui/button";

import {
  AlertDialog,
  AlertDialogTitle,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { OccurrencesStudentsDialog } from "@/components/occurrences/OccurrencesStudentsDialog";

import { enrollStudent, unenrollStudent } from "@/lib/mock-db";

export function EnrollmentBlockCard({
  block,
  allBlocks,
  index,
  total,
  currentUser,
}: {
  block: Block & { occurrences: any[] };
  allBlocks: (Block & { occurrences: any[] })[];
  index: number;
  total: number;
  currentUser: User;
}) {
  const isAdmin = currentUser.role === "ADMIN";
  const isTeacher = currentUser.role === "TEACHER";
  const isStudent = currentUser.role === "STUDENT";

  /** Force re-render po změně zápisu */
  const [version, setVersion] = useState(0);

  /** Dialogy */
  const [editOccurrence, setEditOccurrence] = useState<any | null>(null);
  const [studentsOccurrenceId, setStudentsOccurrenceId] = useState<string | null>(null);

  /** Alert: Stejný subject.code v jiném bloku */
  const [sameSubjectAlert, setSameSubjectAlert] = useState<{
    subjectName: string;
    subjectCode: string;
    blockName: string;
    occurrenceCode: string;
  } | null>(null);

  /** Alert: Přepsat zápis v rámci bloku */
  const [switchEnroll, setSwitchEnroll] = useState<{
    fromOccurrenceId: string;
    toOccurrenceId: string;
  } | null>(null);

  //
  // 🧠 1) Student už je zapsán v JEDNOM výskytu tohoto bloku
  //
  function findMyOccurrenceInThisBlock() {
    for (const occ of block.occurrences) {
      const enr = occ.enrollments?.find(
        (e: any) => e.studentId === currentUser.id && !e.deletedAt
      );
      if (enr) {
        return {
          occurrenceId: occ.id,
          enrollmentId: enr.id,
        };
      }
    }
    return null;
  }

  //
  // 🧠 2) Student už je zapsán na subject.code v jiném BLOKU v rámci stejného zápisu
  //
  function findSameSubjectInOtherBlocks(targetOccurrenceId: string) {
    const target = block.occurrences.find((o: any) => o.id === targetOccurrenceId);
    if (!target || !target.subject?.code) return null;

    const code = target.subject.code;

    for (const b of allBlocks) {
      for (const occ of b.occurrences) {
        if (occ.id === targetOccurrenceId) continue;
        if (!occ.subject?.code) continue;
        if (occ.subject.code !== code) continue;

        const already = occ.enrollments?.some(
          (e: any) => e.studentId === currentUser.id && !e.deletedAt
        );
        if (already) {
          const occCode = `${occ.subject.code}/${occ.subCode ?? ""}`;
          return {
            subjectName: occ.subject.name,
            subjectCode: occ.subject.code,
            blockName: b.name,
            occurrenceCode: occCode,
          };
        }
      }
    }

    return null;
  }

  //
  // 🟩 3) Finální logika zápisu studenta
  //
  function handleEnroll(occId: string) {
    if (!isStudent) return;

    // 1. zákaz: stejné subject.code v jiném bloku
    const sameSubject = findSameSubjectInOtherBlocks(occId);
    if (sameSubject) {
      setSameSubjectAlert(sameSubject);
      return;
    }

    // 2. zákaz: jen jeden výskyt v rámci bloku → nutný dialog "přepsat"
    const my = findMyOccurrenceInThisBlock();
    if (my && my.occurrenceId !== occId) {
      setSwitchEnroll({
        fromOccurrenceId: my.occurrenceId,
        toOccurrenceId: occId,
      });
      return;
    }

    // 3. normální zápis
    enrollStudent(currentUser.id, occId);
    setVersion((v) => v + 1);
  }

  //
  // 🟧 4) Odepsání studenta
  //
  function handleUnenroll(occId: string) {
    const occ = block.occurrences.find((o) => o.id === occId);
    if (!occ) return;
    const enr = occ.enrollments?.find(
      (e: any) => e.studentId === currentUser.id && !e.deletedAt
    );
    if (!enr) return;
    unenrollStudent(enr.id);
    setVersion((v) => v + 1);
  }

  //
  // 🔄 5) Připrava dat pro univerzální OccurrenceRow (pro occurrence-columns)
  //
  const rows: OccurrenceRow[] = useMemo(() => {
    return block.occurrences.map((occ: any) => {
      const activeEnrollments =
        occ.enrollments?.filter((e: any) => !e.deletedAt) ?? [];
      const enrolledCount = activeEnrollments.length;
      const enrolledByMe =
        isStudent &&
        activeEnrollments.some((e: any) => e.studentId === currentUser.id);

      const isFull =
        occ.capacity != null && enrolledCount >= occ.capacity;

      const teacherName = occ.teacher
        ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
        : "";

      const fullCode = occ.subject?.code
        ? `${occ.subject.code}/${occ.subCode ?? ""}`
        : occ.subCode ?? "—";

      const capacityText =
        occ.capacity == null
          ? `${enrolledCount}/∞`
          : `${enrolledCount}/${occ.capacity}`;

      const searchText = [
        occ.subject?.name ?? "",
        teacherName,
        fullCode,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        ...(occ as SubjectOccurrence),
        blockName: block.name,
        block: block as any,
        enrollmentWindow: undefined,
        enrollmentName: "",
        statusLabel: "",
        capacityText,
        hasStudents: enrolledCount > 0,
        fullCode,
        teacherName,
        searchText,
        isFull,
        enrolledByMe,
      };
    });
  }, [block, version, currentUser.id, isStudent]);

  //
  // 🟦 6) Sloupce z occurrence-columns
  //
  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser,
        onStudents: (row) => setStudentsOccurrenceId(row.id),
        onEdit: (row) => setEditOccurrence(row),
        onDelete: () => {
          // zatím žádná akce – stejně jako v původní verzi (tlačítko Smazat bylo bez onClick)
        },
        onEnroll: (row) => handleEnroll(row.id),
        onUnenroll: (row) => handleUnenroll(row.id),
        // v rámci karty bloku nepotřebujeme tyhle sloupce:
        showEnrollmentName: false,
        showStatus: false,
        showBlockName: false,
      }),
    [currentUser, handleEnroll, handleUnenroll]
  );

  const studentEnrolledInBlock =
    isStudent &&
    block.occurrences.some((occ) =>
      occ.enrollments?.some(
        (e: any) => e.studentId === currentUser.id && !e.deletedAt
      )
    );

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col",
        studentEnrolledInBlock && "border-emerald-500"
      )}
    >
      <BlockHeader
        block={block}
        blockIndex={index}
        totalBlocks={total}
        isAdmin={isAdmin}
      />

      <div className="p-2">
        <DataTable<OccurrenceRow>
          data={rows}
          columns={columns}
          searchKeys={["searchText"]}
          searchPlaceholder="Hledat..."
        />
      </div>

      {/* dialog Studenti */}
      {studentsOccurrenceId && (
        <OccurrencesStudentsDialog
          occurrenceId={studentsOccurrenceId}
          block={block}
          currentUser={currentUser}
          onOpenChange={(open) => !open && setStudentsOccurrenceId(null)}
        />
      )}

      {/* dialog Editace výskytu */}
      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
        />
      )}

      {/* ALERT: Stejné subject.code v jiném bloku */}
      {sameSubjectAlert && (
        <AlertDialog open onOpenChange={() => setSameSubjectAlert(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nelze se zapsat</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Už jste zapsán na předmět{" "}
                  <strong>{sameSubjectAlert.subjectName}</strong> se stejným
                  kódem <strong>{sameSubjectAlert.subjectCode}</strong> v jiném
                  bloku.
                </p>
                <p>
                  Jste zapsán v bloku{" "}
                  <strong>{sameSubjectAlert.blockName}</strong>{" "}
                  ({sameSubjectAlert.occurrenceCode}).
                </p>
                <p>Nejdříve se prosím odepište.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setSameSubjectAlert(null)}>
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ALERT: Přepsat zápis */}
      {switchEnroll && (
        <AlertDialog open onOpenChange={() => setSwitchEnroll(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Přepsat zápis?</AlertDialogTitle>
              {(() => {
                const from = block.occurrences.find(
                  (o) => o.id === switchEnroll.fromOccurrenceId
                );
                const to = block.occurrences.find(
                  (o) => o.id === switchEnroll.toOccurrenceId
                );

                if (!from || !to) return null;

                const fromCode =
                  from.subject?.code
                    ? `${from.subject.code}/${from.subCode ?? ""}`
                    : from.subCode ?? "—";
                const toCode =
                  to.subject?.code
                    ? `${to.subject.code}/${to.subCode ?? ""}`
                    : to.subCode ?? "—";

                return (
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Jste již zapsán na jiný výskyt v tomto bloku. Pokud budete
                      pokračovat, vaše volba se přepíše.
                    </p>

                    <div className="bg-muted p-3 rounded text-sm space-y-1">
                      <p>
                        <strong>Současný:</strong> {from.subject.name}{" "}
                        <span className="text-muted-foreground">
                          ({fromCode})
                        </span>
                      </p>
                      <p>
                        <strong>Nový:</strong> {to.subject.name}{" "}
                        <span className="text-muted-foreground">
                          ({toCode})
                        </span>
                      </p>
                    </div>
                  </AlertDialogDescription>
                );
              })()}
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const my = findMyOccurrenceInThisBlock();
                  if (my) unenrollStudent(my.enrollmentId);
                  enrollStudent(currentUser.id, switchEnroll.toOccurrenceId);
                  setVersion((v) => v + 1);
                  setSwitchEnroll(null);
                }}
              >
                Přepsat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
