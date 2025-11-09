"use client";

import { SubjectOccurrence, User } from "@/lib/types";
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

export function SubjectOccurrenceTable({
  blockId,
  occurrences,
  currentUser,
  enrollmentStatus,
  isAdmin,
  isTeacher,
  onShowStudents,
  onEditOccurrence,
  onDeleteOccurrence,
}: {
  blockId: string;
  occurrences: Array<SubjectOccurrence & any>;
  currentUser: User;
  enrollmentStatus: string;
  isAdmin: boolean;
  isTeacher: boolean;
  onShowStudents: (id: string) => void;
  onEditOccurrence: (occ: SubjectOccurrence & any) => void;
  onDeleteOccurrence: (occ: SubjectOccurrence & any) => void;
}) {
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
            const enrolledCount = occ.enrollments.length;
            const enrolled =
              currentUser.role === "STUDENT"
                ? occ.enrollments.some(
                    (e: any) => e.studentId === currentUser.id && !e.deletedAt
                  )
                : false;
            const capacityText =
              occ.capacity === null
                ? `${enrolledCount}/∞`
                : `${enrolledCount}/${occ.capacity}`;
            const hasStudents = occ.enrollments.length > 0;

            return (
              <TableRow
                key={occ.id || occ.subjectId}
                className={cn(
                  enrolled && "bg-emerald-50 dark:bg-emerald-900/10"
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
                  {occ.subject.code
                    ? `${occ.subject.code}/${occ.subCode ?? ""}`
                    : occ.subCode ?? "—"}
                </TableCell>

                {/* Obsazenost – pouze jako info */}
                <TableCell className="text-center">
                  <Badge variant="outline">{capacityText}</Badge>
                </TableCell>

                {/* Akce podle role */}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    {currentUser.role === "STUDENT" && (
                      <>
                        {enrolled ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={enrollmentStatus !== "OPEN"}
                          >
                            Odhlásit
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={enrollmentStatus !== "OPEN"}
                          >
                            Zapsat
                          </Button>
                        )}
                      </>
                    )}

                    {(isAdmin || isTeacher) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onShowStudents(occ.id)}
                        >
                          Studenti
                        </Button>
                      </>
                    )}

                    {isAdmin && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onEditOccurrence(occ)}
                        >
                          Upravit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDeleteOccurrence(occ)}
                          disabled={hasStudents}
                          title={
                            hasStudents
                              ? "Nelze smazat – jsou zapsaní studenti"
                              : "Smazat předmět"
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
    </div>
  );
}
