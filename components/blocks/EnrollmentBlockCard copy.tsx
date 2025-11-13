"use client";

import { useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Block, SubjectOccurrence, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlockHeader } from "@/components/blocks/BlockHeader";
import { DataTable } from "@/components/common/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { OccurrencesStudentsDialog } from "@/components/occurrences/OccurrencesStudentsDialog";
import { enrollStudent, unenrollStudent } from "@/lib/mock-db";

type OccurrenceRow = (SubjectOccurrence & any) & {
  searchText: string;
};

export function EnrollmentBlockCard({
  block,
  allBlocks,
  index,
  total,
  currentUser,
}: {
  block: Block & { occurrences: any[]; description?: string };
  allBlocks?: Array<Block & { occurrences: any[] }>;
  index: number;
  total: number;
  currentUser: User;
}) {
  const isAdmin = currentUser.role === "ADMIN";
  const isTeacher = currentUser.role === "TEACHER";

  const [version, setVersion] = useState(0);
  const [editOccurrence, setEditOccurrence] = useState<any | null>(null);
  const [studentsOccurrenceId, setStudentsOccurrenceId] = useState<string | null>(null);

  const [switchEnroll, setSwitchEnroll] = useState<{
    fromOccurrenceId: string;
    toOccurrenceId: string;
  } | null>(null);

  const [sameSubjectAlert, setSameSubjectAlert] = useState<{
    subjectName: string;
    subjectCode: string;
    blockName: string;
    occurrenceCode: string;
  } | null>(null);

  // student je v nějakém výskytu v rámci TOHOTO bloku?
  function findMyOccurrenceInBlock() {
    if (currentUser.role !== "STUDENT") return null;
    for (const occ of block.occurrences) {
      const enr = occ.enrollments.find(
        (e: any) => e.studentId === currentUser.id && !e.deletedAt
      );
      if (enr) {
        return { occurrenceId: occ.id, enrollmentId: enr.id };
      }
    }
    return null;
  }

  // zkontroluje, jestli není student už zapsaný na stejný subject.code v jiném bloku
  function findSameSubjectInOtherBlock(targetOccurrenceId: string) {
    if (currentUser.role !== "STUDENT") return null;
    if (!allBlocks || allBlocks.length === 0) return null;

    const currentBlockOcc =
      block.occurrences.find((o: any) => o.id === targetOccurrenceId) ?? null;
    if (!currentBlockOcc || !currentBlockOcc.subject?.code) return null;

    const targetCode = currentBlockOcc.subject.code;

    for (const b of allBlocks) {
      for (const occ of b.occurrences) {
        if (occ.id === targetOccurrenceId) continue;
        if (!occ.subject?.code) continue;
        if (occ.subject.code !== targetCode) continue;

        const isEnrolled = occ.enrollments.some(
          (e: any) => e.studentId === currentUser.id && !e.deletedAt
        );
        if (isEnrolled) {
          const occCode = occ.subject.code
            ? `${occ.subject.code}/${occ.subCode ?? ""}`
            : occ.subCode ?? "—";

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

  function handleEnroll(targetOccurrenceId: string) {
    // 1) stejný subject.code v jiném bloku?
    const same = findSameSubjectInOtherBlock(targetOccurrenceId);
    if (same) {
      setSameSubjectAlert(same);
      return;
    }

    // 2) už jsem zapsaný v jiném výskytu v rámci tohoto bloku?
    const current = findMyOccurrenceInBlock();
    if (current && current.occurrenceId !== targetOccurrenceId) {
      setSwitchEnroll({
        fromOccurrenceId: current.occurrenceId,
        toOccurrenceId: targetOccurrenceId,
      });
      return;
    }

    // 3) normální zápis
    const enr = enrollStudent(currentUser.id, targetOccurrenceId);
    if (enr) {
      setVersion((v) => v + 1);
    }
  }

  function handleUnenroll(occId: string) {
    const occ = block.occurrences.find((o: any) => o.id === occId);
    if (!occ) return;
    const myEnr = occ.enrollments.find(
      (e: any) => e.studentId === currentUser.id && !e.deletedAt
    );
    if (!myEnr) return;
    const ok = unenrollStudent(myEnr.id);
    if (ok) {
      setVersion((v) => v + 1);
    }
  }

  const rows: OccurrenceRow[] = useMemo(() => {
    return block.occurrences.map((occ: any) => {
      const teacherName = occ.teacher
        ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
        : "";

      const code =
        occ.subject?.code
          ? `${occ.subject.code}/${occ.subCode ?? ""}`
          : occ.subCode ?? "—";

      const searchText = [
        occ.subject?.name ?? "",
        teacherName,
        code,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        ...occ,
        searchText,
      } as OccurrenceRow;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block, version, currentUser.id]);

  const columns: ColumnDef<OccurrenceRow>[] = useMemo(
    () => [
      {
        accessorKey: "subject.name",
        header: "Předmět",
        cell: ({ row }) => {
          const occ = row.original as any;
          return (
            <a
              href={`/subjects/${occ.subject.id}`}
              className="font-medium hover:underline"
            >
              {occ.subject.name}
            </a>
          );
        },
      },
      {
        accessorKey: "teacher",
        header: "Vyučující",
        cell: ({ row }) => {
          const occ = row.original as any;
          return (
            <span className="whitespace-nowrap">
              {occ.teacher.firstName} {occ.teacher.lastName}
            </span>
          );
        },
      },
      {
        accessorKey: "code",
        header: "Kód",
        cell: ({ row }) => {
          const occ = row.original as any;
          const code =
            occ.subject?.code
              ? `${occ.subject.code}/${occ.subCode ?? ""}`
              : occ.subCode ?? "—";
          return (
            <span className="text-xs text-muted-foreground font-mono">
              {code}
            </span>
          );
        },
      },
      {
        id: "capacity",
        header: "Obsaz.",
        cell: ({ row }) => {
          const occ = row.original as any;
          const enrolledCount = occ.enrollments.filter(
            (e: any) => !e.deletedAt
          ).length;
          const capacityText =
            occ.capacity === null || occ.capacity === undefined
              ? `${enrolledCount}/∞`
              : `${enrolledCount}/${occ.capacity}`;
          return (
            <div className="text-center">
              <Badge variant="outline">{capacityText}</Badge>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Akce",
        cell: ({ row }) => {
          const occ = row.original as any;
          const enrolledCount = occ.enrollments.filter(
            (e: any) => !e.deletedAt
          ).length;
          const enrolledByMe =
            currentUser.role === "STUDENT" &&
            occ.enrollments.some(
              (e: any) => e.studentId === currentUser.id && !e.deletedAt
            );
          const hasStudents = enrolledCount > 0;
          const isFull =
            occ.capacity !== null &&
            occ.capacity !== undefined &&
            enrolledCount >= occ.capacity;

          return (
            <div className="flex justify-end gap-2 flex-wrap">
              {currentUser.role === "STUDENT" && (
                <>
                  {enrolledByMe ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleUnenroll(occ.id)}
                    >
                      Odepsat
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleEnroll(occ.id)}
                      disabled={isFull}
                      title={
                        isFull
                          ? "Kapacita je plná"
                          : "Zapsat se na tento výskyt"
                      }
                    >
                      Zapsat
                    </Button>
                  )}
                </>
              )}

              {(isAdmin || isTeacher) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStudentsOccurrenceId(occ.id)}
                >
                  Studenti
                </Button>
              )}

              {isAdmin && (
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
                      if (!hasStudents) {
                        // tady můžeš napojit reálné mazání výskytu (zatím jen remove z mocku, pokud chceš)
                        console.log("Smazat výskyt:", occ.id);
                      }
                    }}
                    title={
                      hasStudents
                        ? "Nelze smazat – jsou zapsaní studenti"
                        : "Smazat výskyt"
                    }
                  >
                    Smazat
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [currentUser.id, currentUser.role, isAdmin, isTeacher]
  );

  const studentEnrolledInBlock =
    currentUser.role === "STUDENT" &&
    block.occurrences.some((occ: any) =>
      occ.enrollments.some(
        (e: any) => e.studentId === currentUser.id && !e.deletedAt
      )
    );

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col",
        studentEnrolledInBlock && "border-emerald-400"
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
          searchPlaceholder="Hledat podle předmětu, učitele nebo kódu…"
          searchKeys={["searchText"]}
        />
      </div>

      {/* Dialog se studenty */}
      {studentsOccurrenceId && (
        <OccurrencesStudentsDialog
          occurrenceId={studentsOccurrenceId}
          block={block}
          currentUser={currentUser}
          onOpenChange={(open) => !open && setStudentsOccurrenceId(null)}
        />
      )}

      {/* Dialog pro editaci výskytu */}
      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
        />
      )}

      {/* potvrzení přepsání zápisu v rámci stejného bloku */}
      {switchEnroll && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setSwitchEnroll(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Přepsat zápis?</AlertDialogTitle>
              {(() => {
                const fromOcc = block.occurrences.find(
                  (o: any) => o.id === switchEnroll.fromOccurrenceId
                );
                const toOcc = block.occurrences.find(
                  (o: any) => o.id === switchEnroll.toOccurrenceId
                );

                if (!fromOcc || !toOcc) return null;

                const fromName = fromOcc.subject?.name ?? "Neznámý předmět";
                const toName = toOcc.subject?.name ?? "Neznámý předmět";

                const fromCode = fromOcc.subject?.code
                  ? `${fromOcc.subject.code}/${fromOcc.subCode ?? ""}`
                  : fromOcc.subCode ?? "—";

                const toCode = toOcc.subject?.code
                  ? `${toOcc.subject.code}/${toOcc.subCode ?? ""}`
                  : toOcc.subCode ?? "—";

                return (
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Už jste zapsán na jiný výskyt v tomto bloku. Pokud budete pokračovat,
                      budete z něj odepsán a zapsán na nový výskyt.
                    </p>
                    <div className="bg-muted rounded-md p-3 text-sm">
                      <p>
                        <strong>Současný zápis:</strong> {fromName}{" "}
                        <span className="text-muted-foreground">({fromCode})</span>
                      </p>
                      <p>
                        <strong>Nový zápis:</strong> {toName}{" "}
                        <span className="text-muted-foreground">({toCode})</span>
                      </p>
                    </div>
                  </AlertDialogDescription>
                );
              })()}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSwitchEnroll(null)}>
                Zrušit
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const fromOcc = block.occurrences.find(
                    (o: any) => o.id === switchEnroll.fromOccurrenceId
                  );
                  if (fromOcc) {
                    const myEnr = fromOcc.enrollments.find(
                      (e: any) =>
                        e.studentId === currentUser.id && !e.deletedAt
                    );
                    if (myEnr) {
                      unenrollStudent(myEnr.id);
                    }
                  }

                  enrollStudent(currentUser.id, switchEnroll.toOccurrenceId);
                  setVersion((v) => v + 1);
                  setSwitchEnroll(null);
                }}
              >
                Přepsat zápis
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* info dialog: stejné subject.code v jiném bloku */}
      {sameSubjectAlert && (
        <AlertDialog
          open
          onOpenChange={() => setSameSubjectAlert(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nelze zapsat tento předmět</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Už jste zapsán na předmět{" "}
                  <strong>{sameSubjectAlert.subjectName}</strong>{" "}
                  se stejným kódem{" "}
                  <strong>{sameSubjectAlert.subjectCode}</strong> v jiném bloku.
                </p>
                <p>
                  Aktuálně jste zapsán v bloku{" "}
                  <strong>{sameSubjectAlert.blockName}</strong>{" "}
                  ({sameSubjectAlert.occurrenceCode}).
                </p>
                <p>
                  Nejprve se prosím odepište z předchozího výskytu tohoto předmětu.
                </p>
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
    </div>
  );
}
