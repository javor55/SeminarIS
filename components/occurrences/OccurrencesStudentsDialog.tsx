"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Block, User } from "@/lib/types";
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
import { unenrollStudent, enrollStudent } from "@/lib/data";

export function OccurrencesStudentsDialog({
  occurrenceId,
  block,
  currentUser,
  onOpenChange,
}: {
  occurrenceId: string;
  block: Block & { occurrences: any[] };
  currentUser: User;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  // najdeme výskyt v rámci JEDNOHO bloku
  const occurrence = useMemo(() => {
    return block.occurrences.find((x) => x.id === occurrenceId) ?? null;
  }, [occurrenceId, block]);

  if (!occurrence) return null;

  const [allUsers, setAllUsers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      setAllUsers(await getAllUsers());
    }
    load();
  }, []);
  const isAdmin = currentUser.role === "ADMIN";

  const [localEnrollments, setLocalEnrollments] = useState(
    () => occurrence.enrollments
  );
  const [toUnenroll, setToUnenroll] = useState<string | null>(null);

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

          {isAdmin && (
            <div className="mb-3 rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Ruční zapsání studenta</p>
              {enrollableStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Všichni studenti jsou už zapsáni.
                </p>
              ) : (
                // 🔥 ZMĚNA: Přidán 'flex-col sm:flex-row' pro responzivní layout
                <div className="flex flex-col sm:flex-row gap-2">
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
                    // 🔥 ZMĚNA: Tlačítko se přizpůsobí
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (!selectedStudentId) return;
                      const newEnr = await enrollStudent(
                        selectedStudentId,
                        occurrenceId
                      );
                      setLocalEnrollments((prev) => [...prev, { ...newEnr } as any]);
                      
                      router.refresh();

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
                  // 🔥 ZMĚNA: Přidány responzivní třídy pro layout řádku
                  <div
                    key={enr.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border rounded-md px-3 py-2"
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
                        // 🔥 ZMĚNA: Tlačítko se přizpůsobí
                        className="w-full sm:w-auto"
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
                onClick={async () => {
                  const enrToDelete = toUnenroll;
                  if (!enrToDelete) return;
                  await unenrollStudent(enrToDelete);
                  
                  setLocalEnrollments((prev) =>
                    prev.filter((e) => e.id !== enrToDelete)
                  );
                  router.refresh();
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