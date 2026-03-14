"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, StudentEnrollment, SubjectOccurrence } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getUsersForFilters, unenrollStudent, enrollStudent } from "@/lib/data";

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

export type OccurrenceForDialog = SubjectOccurrence & {
  subject?: {
    name: string;
    code?: string | null;
  };
  enrollments?: StudentEnrollment[];
};

export function OccurrencesStudentsDialog({
  occurrence,
  currentUser,
  onOpenChange,
}: {
  occurrence: OccurrenceForDialog;
  currentUser: User;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    async function load() {
      setAllUsers(await getUsersForFilters());
    }
    load();
  }, []);

  const [localEnrollments, setLocalEnrollments] = useState<StudentEnrollment[]>(
    () => occurrence.enrollments ?? []
  );
  
  useEffect(() => {
    if (occurrence.enrollments) {
      setLocalEnrollments(occurrence.enrollments);
    }
  }, [occurrence.enrollments]);

  const [toUnenroll, setToUnenroll] = useState<string | null>(null);
  const [hasChanged, setHasChanged] = useState(false);

  const isPrivileged = currentUser.role === "ADMIN" || currentUser.role === "TEACHER";

  const alreadyEnrolledIds = useMemo(() => new Set(localEnrollments.map((e) => e.studentId)), [localEnrollments]);
  
  const enrollableStudents = useMemo(() => allUsers.filter(
    (u) => u.role === "STUDENT" && !alreadyEnrolledIds.has(u.id)
  ), [allUsers, alreadyEnrolledIds]);

  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  useEffect(() => {
    if (enrollableStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(enrollableStudents[0].id);
    }
  }, [enrollableStudents, selectedStudentId]);

  const enrollmentToDelete =
    toUnenroll && localEnrollments.find((e) => e.id === toUnenroll);

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Studenti – {occurrence.subject?.name || "Seminář"} (
              {occurrence.subCode ?? "bez kódu"})
            </DialogTitle>
            <DialogDescription>
              Počet zapsaných: {localEnrollments.length}
            </DialogDescription>
          </DialogHeader>

          {isPrivileged && (
            <div className="mb-3 rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Ruční zapsání studenta</p>
              {enrollableStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Všichni studenti jsou už zapsáni.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    className="flex-1 border rounded-md px-2 py-1 text-sm bg-background text-foreground"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    <option value="" disabled>Vyberte studenta...</option>
                    {enrollableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.email})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (!selectedStudentId) return;
                      try {
                        const newEnr = await enrollStudent(
                          selectedStudentId,
                          occurrence.id
                        );
                        setLocalEnrollments((prev) => [...prev, newEnr]);
                        setHasChanged(true);
                        toast.success("Student byl úspěšně zapsán.");

                        const nextStudents = enrollableStudents.filter(
                          (s) => s.id !== selectedStudentId
                        );
                        setSelectedStudentId(nextStudents[0]?.id ?? "");
                      } catch (err: unknown) {
                        const error = err as Error;
                        toast.error(error.message || "Nepodařilo se zapsat studenta.");
                      }
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
                    {isPrivileged && (
                      <Button
                        variant="destructive"
                        size="sm"
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
            <Button
              variant="outline"
              onClick={() => {
                if (hasChanged) {
                  router.refresh();
                }
                onOpenChange(false);
              }}
            >
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
                Tato akce odebere studenta ze seznamu zapsaných v tomto termínu.
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
                  try {
                    await unenrollStudent(enrToDelete);
                    toast.success("Student byl úspěšně odepsán.");
                    setLocalEnrollments((prev) =>
                      prev.filter((e) => e.id !== enrToDelete)
                    );
                    setHasChanged(true);
                  } catch (err: unknown) {
                    const error = err as Error;
                    toast.error(error.message || "Nepodařilo se odepsat studenta.");
                  } finally {
                    setToUnenroll(null);
                  }
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