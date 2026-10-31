"use client";

import { unwrap } from "@/lib/action-result";
import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Block, SubjectOccurrence, User, StudentEnrollment, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

import { BlockHeader } from "@/modules/seminars/components/blocks/BlockHeader";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import {
  getOccurrenceColumns,
  OccurrenceRow,
} from "@/modules/seminars/components/occurrences/occurrence-columns";
import { OccurrenceForDialog, OccurrencesStudentsDialog } from "@/modules/seminars/components/occurrences/OccurrencesStudentsDialog";

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

import { EditSubjectOccurrenceDialog } from "@/modules/seminars/components/occurrences/EditSubjectOccurrenceDialog";

import { enrollStudent, switchEnrollment, unenrollStudent } from "@/modules/seminars/actions/enrollment";
import { ParticipantsDialog } from "@/modules/seminars/components/occurrences/ParticipantsDialog";
import { checkStudentCanChange } from "@/modules/seminars/window-rules";
import { classLabel, compareClasses } from "@/lib/school";
import { updateSubjectOccurrence, deleteSubjectOccurrence } from "@/modules/seminars/actions/windows";

type BlockWithOccurrences = Block & { occurrences: (SubjectOccurrence & { subject: Subject, teacher?: User | null, enrollments: StudentEnrollment[], enrolledCount?: number })[] };

export function EnrollmentBlockCard({
  block,
  allBlocks,
  index,
  total,
  currentUser,
  isWindowOpen = true,
  rules,
}: {
  block: BlockWithOccurrences;
  allBlocks: BlockWithOccurrences[];
  index: number;
  total: number;
  currentUser: User;
  isWindowOpen?: boolean;
  // Pravidla okna: smí se student odepsat / přepsat, do kdy, vidí jména zapsaných
  rules?: { allowSelfUnenroll: boolean; changesUntil: string | Date | null; endsAt: string | Date; namesVisible: boolean };
}) {
  const router = useRouter();
  const isAdmin = currentUser.role === "ADMIN"; 
  const isStudent = currentUser.role === "STUDENT";

  const [editOccurrence, setEditOccurrence] = useState<OccurrenceRow | null>(null);
  const [studentsOccurrenceId, setStudentsOccurrenceId] = useState<string | null>(null);
  const [deleteOccurrence, setDeleteOccurrence] = useState<OccurrenceRow | null>(null);
  const [namesOccurrence, setNamesOccurrence] = useState<{ id: string; title: string } | null>(null);
  const [unenrollConfirm, setUnenrollConfirm] = useState<{ occId: string; subjectName: string } | null>(null);

  const [sameSubjectAlert, setSameSubjectAlert] = useState<{
    subjectName: string;
    blockName: string;
    occurrenceCode: string;
  } | null>(null);

  const [switchEnroll, setSwitchEnroll] = useState<{
    fromOccurrenceId: string;
    toOccurrenceId: string;
  } | null>(null);

  const findMyOccurrenceInThisBlock = React.useCallback(() => {
    for (const occ of block.occurrences) {
      const enr = occ.enrollments?.find(
        (e) => e.studentId === currentUser.id && !e.deletedAt
      );
      if (enr) {
        return {
          occurrenceId: occ.id,
          enrollmentId: enr.id,
        };
      }
    }
    return null;
  }, [block.occurrences, currentUser.id]);

  const myCountInBlock = block.occurrences.filter((occ) => occ.enrollments?.some((e) => e.studentId === currentUser.id && !e.deletedAt)).length;
  const minEnrollments = block.minEnrollments ?? 1;
  const maxEnrollments = block.maxEnrollments ?? 1;
  // Pravidla změn zápisu pro studenta (stejná funkce jako na serveru, server je ale rozhodující)
  const change = React.useMemo(
    () => (rules ? checkStudentCanChange({ allowSelfUnenroll: rules.allowSelfUnenroll, changesUntil: rules.changesUntil, endsAt: rules.endsAt }) : { ok: true, reason: undefined as string | undefined }),
    [rules]
  );

  const findSameSubjectInOtherBlocks = React.useCallback((targetOccurrenceId: string) => {
    const target = block.occurrences.find((o) => o.id === targetOccurrenceId);
    if (!target || !target.subject?.id) return null;

    const subjectId = target.subject.id;

    for (const b of allBlocks) {
      for (const occ of b.occurrences) {
        if (occ.id === targetOccurrenceId) continue;
        if (occ.subject?.id !== subjectId) continue;

        const already = occ.enrollments?.some(
          (e) => e.studentId === currentUser.id && !e.deletedAt
        );
        if (already) {
          const occCode = occ.subject.code ? `${occ.subject.code}/${occ.subCode ?? ""}` : occ.subCode ?? "—";
          return {
            subjectName: occ.subject.name,
            blockName: b.name,
            occurrenceCode: occCode,
          };
        }
      }
    }

    return null;
  }, [allBlocks, block.occurrences, currentUser.id]);

  const handleEnroll = React.useCallback(async (occId: string) => {
    if (!isStudent) return;

    const sameSubject = findSameSubjectInOtherBlocks(occId);
    if (sameSubject) {
      setSameSubjectAlert(sameSubject);
      return;
    }

    const my = findMyOccurrenceInThisBlock();
    if (my && my.occurrenceId !== occId && maxEnrollments === 1) {
      if (!change.ok) {
        toast.error(change.reason ?? "Zápis v tomto bloku už nelze změnit.");
        return;
      }
      setSwitchEnroll({
        fromOccurrenceId: my.occurrenceId,
        toOccurrenceId: occId,
      });
      return;
    }

    try {
      const res = await enrollStudent(currentUser.id, occId);
      if (res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Zápis byl úspěšně proveden.");
      router.refresh();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Nepodařilo se provést zápis.");
    }
  }, [currentUser.id, isStudent, router, findSameSubjectInOtherBlocks, findMyOccurrenceInThisBlock, maxEnrollments, change]);

  const handleUnenroll = React.useCallback(async (occId: string) => {
    const occ = block.occurrences.find((o) => o.id === occId);
    if (!occ) return;
    setUnenrollConfirm({ occId, subjectName: occ.subject?.name || "předmět" });
  }, [block.occurrences]);

  async function confirmUnenroll() {
    if (!unenrollConfirm) return;
    const occ = block.occurrences.find((o) => o.id === unenrollConfirm.occId);
    if (!occ) return;
    const enr = occ.enrollments?.find(
      (e) => e.studentId === currentUser.id && !e.deletedAt
    );
    if (!enr) return;
    try {
      const res = await unenrollStudent(enr.id);
      if (res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Odhlášení bylo úspěšně provedeno.");
      router.refresh();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Nepodařilo se zrušit zápis.");
    } finally {
      setUnenrollConfirm(null);
    }
  }

  const rows: OccurrenceRow[] = useMemo(() => {
    return block.occurrences.map((occ) => {
      const activeEnrollments =
        occ.enrollments?.filter((e) => !e.deletedAt) ?? [];
      const enrolledCount = occ.enrolledCount ?? activeEnrollments.length;
      const enrolledByMe =
        isStudent &&
        activeEnrollments.some((e) => e.studentId === currentUser.id);

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
        block: block as Block,
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
        isWindowOpen,
        canUnenroll: change.ok,
        unenrollBlockedReason: change.reason,
        canSeeNames: !!rules?.namesVisible,
        restrictionLabel: isStudent
          ? ""
          : [
              occ.restrictGrades?.length ? `${occ.restrictGrades.map((g) => `${g}.`).join(", ")} ročník` : "",
              occ.restrictClasses?.length ? [...occ.restrictClasses].sort(compareClasses).map(classLabel).join(", ") : "",
            ]
              .filter(Boolean)
              .join(" + "),
      } as unknown as OccurrenceRow;
    });
  }, [block, currentUser.id, isStudent, isWindowOpen, change.ok, change.reason, rules?.namesVisible]);

  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser,
        onStudents: (row) => setStudentsOccurrenceId(row.id),
        onEdit: (row) => setEditOccurrence(row),
        onDelete: (row) => setDeleteOccurrence(row),
        onEnroll: (row) => handleEnroll(row.id),
        onUnenroll: (row) => handleUnenroll(row.id),
        onNames: (row) => setNamesOccurrence({ id: row.id, title: `${row.subject?.name ?? "Předmět"}${row.subCode ? ` (${row.subCode})` : ""}` }),
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
        (e) => e.studentId === currentUser.id && !e.deletedAt
      )
    );

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col",
        studentEnrolledInBlock && "border-success"
      )}
    >
      <BlockHeader
        block={block}
        blockIndex={index}
        totalBlocks={total}
        isAdmin={isAdmin}
      />

      {isStudent && (
        <p className="px-4 pt-2 text-xs text-muted-foreground" data-testid="block-progress">
          Zapsáno {myCountInBlock} z {minEnrollments === maxEnrollments ? maxEnrollments : `${minEnrollments}–${maxEnrollments}`}
          {block.required === false ? " (nepovinný blok)" : ""}
        </p>
      )}

      <div className="p-2">
        <DataTable<OccurrenceRow>
          data={rows}
          columns={columns}
          hideToolbar
          hideFooter
        />
      </div>

      {studentsOccurrenceId && (
        <OccurrencesStudentsDialog
          occurrence={rows.find((r) => r.id === studentsOccurrenceId) as OccurrenceForDialog}
          currentUser={currentUser}
          onOpenChange={(open) => !open && setStudentsOccurrenceId(null)}
        />
      )}

      {namesOccurrence && <ParticipantsDialog occurrenceId={namesOccurrence.id} title={namesOccurrence.title} onClose={() => setNamesOccurrence(null)} />}

      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
          onSubmit={async (data) => {
              unwrap(await updateSubjectOccurrence(data.id, data));
              router.refresh();
          }}
          onDelete={async (id) => {
              unwrap(await deleteSubjectOccurrence(id));
              router.refresh();
          }}
        />
      )}

      {sameSubjectAlert && (
        <AlertDialog open onOpenChange={() => setSameSubjectAlert(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nelze se zapsat</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Už jste zapsán na předmět{" "}
                  <strong>{sameSubjectAlert.subjectName}</strong> v jiném
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
                  <div className="text-sm text-muted-foreground space-y-2">
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
                  </div>
                );
              })()}
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const my = findMyOccurrenceInThisBlock();
                    if (my) {
                      // jedna transakce na serveru: když se nový zápis nepovede, původní zůstane
                      const res = await switchEnrollment(my.enrollmentId, switchEnroll.toOccurrenceId);
                      if (res && res.error) {
                        toast.error(res.error);
                        return;
                      }
                    }
                    toast.success("Zápis byl úspěšně přepsán.");
                    router.refresh();
                  } catch (err: unknown) {
                    const error = err as Error;
                    toast.error(error.message || "Nepodařilo se přepsat zápis.");
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

      {deleteOccurrence && (
        <AlertDialog open onOpenChange={() => setDeleteOccurrence(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu smazat předmět z bloku?</AlertDialogTitle>
              <AlertDialogDescription>
                Tato akce trvale odstraní výskyt předmětu{" "}
                <strong>{deleteOccurrence.teacherName}</strong>{" "}
                (nebo code) z bloku <strong>{block.name}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  try {
                    unwrap(await deleteSubjectOccurrence(deleteOccurrence.id));
                    toast.success("Předmět byl z bloku smazán.");
                    router.refresh();
                  } catch (err: unknown) {
                    const error = err as Error;
                    toast.error(error.message || "Nepodařilo se smazat předmět.");
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

      {unenrollConfirm && (
        <AlertDialog open onOpenChange={() => setUnenrollConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Opravdu se chcete odhlásit?</AlertDialogTitle>
              <AlertDialogDescription>
                Budete odhlášeni z předmětu{" "}
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