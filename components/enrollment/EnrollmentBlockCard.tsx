"use client";

import { useState } from "react";
import {
  Block,
  EnrollmentWindowWithBlocks,
  SubjectOccurrence,
  User,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlockHeader } from "@/components/enrollment/BlockHeader";
import { SubjectOccurrenceTable } from "@/components/enrollment/SubjectOccurrenceeTable";
import { StudentsDialog } from "@/components/enrollment/StudentsDialog";
import { EditSubjectOccurrenceDialog } from "@/components/enrollment/EditSubjectOccurrenceDialog";
import { EditBlockDialog } from "@/components/enrollment/EditBlockDialog";

export function EnrollmentBlockCard({
  block,
  index,
  total,
  currentUser,
  enrollment,
}: {
  block: Block & { occurrences: any[]; description?: string };
  index: number;
  total: number;
  currentUser: User;
  enrollment: EnrollmentWindowWithBlocks;
}) {
  const isAdmin = currentUser.role === "ADMIN";
  const isTeacher = currentUser.role === "TEACHER";

  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(
    null
  );
  const [editOccurrence, setEditOccurrence] = useState<SubjectOccurrence | null>(
    null
  );
  const [editBlock, setEditBlock] = useState<Block | null>(null);
  const [deleteOccurrence, setDeleteOccurrence] =
    useState<SubjectOccurrence | null>(null);

  const studentEnrolledInBlock =
    currentUser.role === "STUDENT" &&
    block.occurrences.some((occ: any) =>
      occ.enrollments.some(
        (e: any) => e.studentId === currentUser.id && !e.deletedAt
      )
    );

  return (
    <>
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
          <SubjectOccurrenceTable
            blockId={block.id}
            occurrences={block.occurrences}
            currentUser={currentUser}
            enrollmentStatus={enrollment.status}
            isAdmin={isAdmin}
            isTeacher={isTeacher}
            onShowStudents={(occId) => setSelectedOccurrenceId(occId)}
            onEditOccurrence={(occ) => setEditOccurrence(occ)}
            onDeleteOccurrence={(occ) => setDeleteOccurrence(occ)}
          />
        </div>
      </div>

      {selectedOccurrenceId && (
        <StudentsDialog
          occurrenceId={selectedOccurrenceId}
          enrollment={enrollment}
          currentUser={currentUser}
          onOpenChange={(open) => !open && setSelectedOccurrenceId(null)}
        />
      )}

      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
        />
      )}

      {editBlock && (
        <EditBlockDialog.EditBlock
          block={editBlock}
          onOpenChange={(open) => !open && setEditBlock(null)}
        />
      )}

      {deleteOccurrence && (
        <EditBlockDialog.DeleteOccurrence
          occurrence={deleteOccurrence}
          onOpenChange={(open) => !open && setDeleteOccurrence(null)}
        />
      )}
    </>
  );
}
