"use client";

import {
  Block,  
  User,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlockHeader } from "@/components/enrollment/BlockHeader";
import { SubjectOccurrenceTable } from "@/components/enrollment/SubjectOccurrenceeTable";

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
        <SubjectOccurrenceTable
          block={block}
          occurrences={block.occurrences}
          currentUser={currentUser}
          isAdmin={isAdmin}
          isTeacher={isTeacher}
          allBlocks={allBlocks}
          onChanged={() => console.log("Změna")}
          onDeleteOccurrence={(id) => console.log("Smazat výskyt:", id)}
        />
      </div>
    </div>
  );
}
