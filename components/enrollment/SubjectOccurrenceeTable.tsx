"use client";

import { useState } from "react";
import { SubjectOccurrence, User, Block } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EditSubjectOccurrenceDialog } from "@/components/enrollment/EditSubjectOccurrenceDialog";
import { StudentsDialog } from "@/components/enrollment/StudentsDialog";
import { enrollStudent, unenrollStudent } from "@/lib/mock-db";
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

export function SubjectOccurrenceTable({
  block,
  occurrences,
  currentUser,
  isAdmin,
  isTeacher,
  onChanged,
  onDeleteOccurrence,
}: {
  block: Block & { occurrences: any[] };
  occurrences: Array<SubjectOccurrence & any>;
  currentUser: User;
  isAdmin: boolean;
  isTeacher: boolean;
  onChanged?: () => void;
  onDeleteOccurrence?: (id: string) => void;
}) {
  const [editOccurrence, setEditOccurrence] = useState<(SubjectOccurrence & any) | null>(null);
  const [studentsOccurrenceId, setStudentsOccurrenceId] = useState<string | null>(null);

  // pro případ „jsem zapsaný jinde, ale chci se zapsat sem“
  const [switchEnroll, setSwitchEnroll] = useState<{
    fromOccurrenceId: string;
    toOccurrenceId: string;
  } | null>(null);

  // pomocná funkce – najdi, jestli je student někde v tomhle bloku zapsaný
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

  function handleEnroll(targetOccurrenceId: string) {
    // zjistíme, jestli už jsem v tomhle bloku zapsaný
    const current = findMyOccurrenceInBlock();
    if (current && current.occurrenceId !== targetOccurrenceId) {
      // už jsem zapsaný jinde → zeptat se
      setSwitchEnroll({
        fromOccurrenceId: current.occurrenceId,
        toOccurrenceId: targetOccurrenceId,
      });
      return;
    }

    // nejsem zapsaný nebo se zapisuju do stejného
    const enr = enrollStudent(currentUser.id, targetOccurrenceId);
    if (enr) {
      onChanged?.();
    }
  }

  function handleUnenroll(occ: any) {
    // najdu svoji enrollment
    const myEnr = occ.enrollments.find(
      (e: any) => e.studentId === currentUser.id && !e.deletedAt
    );
    if (!myEnr) return;
    const ok = unenrollStudent(myEnr.id);
    if (ok) {
      onChanged?.();
    }
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Předmět</TableHead>
            <TableHead>Vyučující</TableHead>
            <TableHead>Kód</TableHead>
            <TableHead className="text-center">Obsaz.</TableHead>
            <TableHead className="text-right">Akce</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {occurrences.map((occ) => {
            const enrolledCount = occ.enrollments.filter((e: any) => !e.deletedAt).length;
            const enrolledByMe =
              currentUser.role === "STUDENT" &&
              occ.enrollments.some((e: any) => e.studentId === currentUser.id && !e.deletedAt);

            const capacityText =
              occ.capacity === null
                ? `${enrolledCount}/∞`
                : `${enrolledCount}/${occ.capacity}`;

            const code =
              occ.subject?.code
                ? `${occ.subject.code}/${occ.subCode ?? ""}`
                : occ.subCode ?? "—";

            const hasStudents = enrolledCount > 0;

            return (
              <TableRow
                key={occ.id}
                className={cn(
                  enrolledByMe && "bg-emerald-50 dark:bg-emerald-900/10"
                )}
              >
                <TableCell>
                  <a
                    href={`/subjects/${occ.subject.id}`}
                    className="font-medium hover:underline"
                  >
                    {occ.subject.name}
                  </a>
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {occ.teacher.firstName} {occ.teacher.lastName}
                </TableCell>

                <TableCell className="text-xs text-muted-foreground">
                  {code}
                </TableCell>

                <TableCell className="text-center">
                  <Badge variant="outline">{capacityText}</Badge>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    {/* student – zapsat / odepsat */}
                    {currentUser.role === "STUDENT" && (
                      <>
                        {enrolledByMe ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUnenroll(occ)}
                          >
                            Odepsat
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleEnroll(occ.id)}
                            disabled={occ.capacity !== null && enrolledCount >= occ.capacity}
                            title={
                              occ.capacity !== null && enrolledCount >= occ.capacity
                                ? "Kapacita je plná"
                                : "Zapsat se"
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
                              onDeleteOccurrence?.(occ.id);
                              onChanged?.();
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* dialog pro editaci výskytu */}
      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          open={!!editOccurrence}
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
          onSubmit={() => {
            onChanged?.();
            setEditOccurrence(null);
          }}
          onDelete={(id) => {
            onChanged?.();
            setEditOccurrence(null);
            onDeleteOccurrence?.(id);
          }}
          onShowStudents={(id) => setStudentsOccurrenceId(id)}
        />
      )}

      {/* dialog se studenty */}
      {studentsOccurrenceId && (
        <StudentsDialog
          occurrenceId={studentsOccurrenceId}
          block={block}
          currentUser={currentUser}
          onOpenChange={(open) => !open && setStudentsOccurrenceId(null)}
        />
      )}

      {/* potvrzení přepsání zápisu */}
      
      {switchEnroll && (
        <AlertDialog open onOpenChange={(open) => !open && setSwitchEnroll(null)}>
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
                      (e: any) => e.studentId === currentUser.id && !e.deletedAt
                    );
                    if (myEnr) {
                      unenrollStudent(myEnr.id);
                    }
                  }

                  enrollStudent(currentUser.id, switchEnroll.toOccurrenceId);
                  onChanged?.();
                  setSwitchEnroll(null);
                }}
              >
                Přepsat zápis
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}      
    </div>
  );
}
