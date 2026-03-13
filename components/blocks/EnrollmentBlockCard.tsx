"use client";

import { useMemo, useState } from "react"; // 🔥 Opraveno
import { useRouter } from "next/navigation";
import { Block, SubjectOccurrence, User } from "@/lib/types";
import { cn } from "@/lib/utils";

import { BlockHeader } from "@/components/blocks/BlockHeader";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import {
  getOccurrenceColumns,
  OccurrenceRow,
} from "@/components/occurrences/occurrence-columns";

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

import { enrollStudent, unenrollStudent, updateSubjectOccurrence, deleteSubjectOccurrence } from "@/lib/data";

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
  const router = useRouter();
  const isAdmin = currentUser.role === "ADMIN"; 
  const isStudent = currentUser.role === "STUDENT";

  /** Dialogy */
  const [editOccurrence, setEditOccurrence] = useState<any | null>(null);
  const [studentsOccurrenceId, setStudentsOccurrenceId] = useState<string | null>(null);
  const [deleteOccurrence, setDeleteOccurrence] = useState<any | null>(null);
  const [unenrollConfirm, setUnenrollConfirm] = useState<{ occId: string; subjectName: string } | null>(null);

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
  async function handleEnroll(occId: string) {
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
    try {
      await enrollStudent(currentUser.id, occId);
      toast.success("Zápis byl úspěšně proveden.");
      router.refresh();

    } catch (err: any) {
      toast.error(err.message || "Nepodařilo se provést zápis.");
    }
  }

  //
  // 🟧 4) Odepsání studenta
  //
  async function handleUnenroll(occId: string) {
    const occ = block.occurrences.find((o) => o.id === occId);
    if (!occ) return;
    // Zobrazit potvrzovací dialog
    setUnenrollConfirm({ occId, subjectName: occ.subject?.name || "seminář" });
  }

  async function confirmUnenroll() {
    if (!unenrollConfirm) return;
    const occ = block.occurrences.find((o) => o.id === unenrollConfirm.occId);
    if (!occ) return;
    const enr = occ.enrollments?.find(
      (e: any) => e.studentId === currentUser.id && !e.deletedAt
    );
    if (!enr) return;
    try {
      await unenrollStudent(enr.id);
      toast.success("Odhlášení bylo úspěšně provedeno.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Nepodařilo se zrušit zápis.");
    } finally {
      setUnenrollConfirm(null);
    }
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
  }, [block, currentUser.id, isStudent]);

  //
  // 🟦 6) Sloupce z occurrence-columns
  //
  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser,
        onStudents: (row) => setStudentsOccurrenceId(row.id),
        onEdit: (row) => setEditOccurrence(row),
        onDelete: (row) => setDeleteOccurrence(row),
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
          hideToolbar
          hideFooter
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
          occurrence={editOccurrence as any}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
          onSubmit={async (data) => {
              await updateSubjectOccurrence(data.id, data);
              router.refresh();

          }}
          onDelete={async (id) => {
              await deleteSubjectOccurrence(id);
              router.refresh();

          }}
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
                </p> {/* 🔥 Opraveno */}
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
                    </p> {/* 🔥 Opraveno */}

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
                onClick={async () => {
                  try {
                    const my = findMyOccurrenceInThisBlock();
                    if (my) await unenrollStudent(my.enrollmentId);
                    await enrollStudent(currentUser.id, switchEnroll.toOccurrenceId);
                    toast.success("Zápis byl úspěšně přepsán.");
                    router.refresh();

                  } catch (err: any) {
                    toast.error(err.message || "Nepodařilo se přepsat zápis.");
                  } finally {
                    setSwitchEnroll(null);
                  }
                }}
              >
                Přepsat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ALERT: Potvrzení smazání výskytu */}
      {deleteOccurrence && (
        <AlertDialog open onOpenChange={() => setDeleteOccurrence(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu smazat předmět z bloku?</AlertDialogTitle>
              <AlertDialogDescription>
                Tato akce trvale odstraní výskyt předmětu{" "}
                <strong>{deleteOccurrence.subject?.name}</strong>{" "}
                ({deleteOccurrence.fullCode}) z bloku <strong>{block.name}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  try {
                    await deleteSubjectOccurrence(deleteOccurrence.id);
                    toast.success("Předmět byl z bloku smazán.");
                    router.refresh();

                  } catch (err: any) {
                    toast.error(err.message || "Nepodařilo se smazat předmět.");
                  } finally {
                    setDeleteOccurrence(null);
                  }
                }}
              >
                Smazat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ALERT: Potvrzení odepsání */}
      {unenrollConfirm && (
        <AlertDialog open onOpenChange={() => setUnenrollConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu se chcete odhlásit?</AlertDialogTitle>
              <AlertDialogDescription>
                Budete odhlášeni ze semináře{" "}
                <strong>{unenrollConfirm.subjectName}</strong> v bloku{" "}
                <strong>{block.name}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmUnenroll}
              >
                Odhlásit se
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}