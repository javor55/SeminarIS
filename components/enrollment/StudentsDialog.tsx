// components/enrollment/StudentsDialog.tsx
"use client";

import { useMemo, useState } from "react";
import { EnrollmentWindowWithBlocks, User } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAllUsers } from "@/lib/data";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { unenrollStudent, enrollStudent } from "@/lib/mock-db";

export function StudentsDialog({
  occurrenceId,
  enrollment,
  currentUser,
  onOpenChange,
}: {
  occurrenceId: string;
  enrollment: EnrollmentWindowWithBlocks;
  currentUser: User;
  onOpenChange: (open: boolean) => void;
}) {
  // najdeme výskyt
  const occurrence = useMemo(() => {
    for (const b of enrollment.blocks) {
      const o = b.occurrences.find((x) => x.id === occurrenceId);
      if (o) return o;
    }
    return null;
  }, [occurrenceId, enrollment]);

  if (!occurrence) return null;

  const allUsers = getAllUsers();
  const isAdmin = currentUser.role === "ADMIN";

  // lokální seznam zápisů (aby se UI hned aktualizovalo)
  const [localEnrollments, setLocalEnrollments] = useState(
    () => occurrence.enrollments
  );

  // pro odhlášení
  const [toUnenroll, setToUnenroll] = useState<string | null>(null);

  // pro ruční zapsání
  // vezmeme jen studenty, kteří ještě nejsou na tomhle occurrence
  const alreadyEnrolledIds = new Set(localEnrollments.map((e) => e.studentId));
  const enrollableStudents = allUsers.filter(
    (u) => u.role === "STUDENT" && !alreadyEnrolledIds.has(u.id)
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    enrollableStudents[0]?.id ?? ""
  );

  const enrollmentToDelete =
    toUnenroll && localEnrollments.find((e) => e.id === toUnenroll);

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Studenti – {occurrence.subject.name} (
              {occurrence.subCode ?? "bez kódu"})
            </DialogTitle>
            <DialogDescription>
              Počet zapsaných: {localEnrollments.length}
            </DialogDescription>
          </DialogHeader>

          {/* ADMIN: přidat studenta */}
          {isAdmin && (
            <div className="mb-3 rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Ruční zapsání studenta</p>
              {enrollableStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Všichni studenti jsou už zapsáni.
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    className="flex-1 border rounded-md px-2 py-1 text-sm"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    {enrollableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.email})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedStudentId) return;
                      // 1) zapsat do mock DB
                      const newEnr = enrollStudent(
                        selectedStudentId,
                        occurrenceId
                      );
                      // 2) přidat do lokálního state
                      setLocalEnrollments((prev) => [
                        ...prev,
                        {
                          ...newEnr,
                          // aby měl dialog stejný tvar jako původní data
                        },
                      ]);
                      // 3) vybrat dalšího studenta (pokud nějaký zbývá)
                      const nextStudents = enrollableStudents.filter(
                        (s) => s.id !== selectedStudentId
                      );
                      setSelectedStudentId(nextStudents[0]?.id ?? "");
                    }}
                  >
                    Zapsat
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 max-h-80 overflow-auto">
            {localEnrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nikdo není zapsaný.
              </p>
            ) : (
              localEnrollments.map((enr) => {
                const u = allUsers.find((x) => x.id === enr.studentId);
                return (
                  <div
                    key={enr.id}
                    className="flex items-center justify-between gap-3 border rounded-md px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">
                        {u ? `${u.firstName} ${u.lastName}` : enr.studentId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {u?.email ?? ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        zapsán: {new Date(enr.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setToUnenroll(enr.id)}
                      >
                        Odepsat
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* potvrzení odhlášení */}
      {toUnenroll && enrollmentToDelete && (
        <AlertDialog open onOpenChange={(open) => !open && setToUnenroll(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Odepsat studenta?</AlertDialogTitle>
              <AlertDialogDescription>
                Tato akce v mock režimu skutečně odstraní zápis z paměti.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setToUnenroll(null)}>
                Zrušit
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const ok = unenrollStudent(toUnenroll);
                  if (ok) {
                    setLocalEnrollments((prev) =>
                      prev.filter((e) => e.id !== toUnenroll)
                    );
                  }
                  setToUnenroll(null);
                }}
              >
                Odepsat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
