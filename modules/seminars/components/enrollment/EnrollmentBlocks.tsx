"use client";

import { EnrollmentWindowWithBlocks, User } from "@/lib/types";
import { EnrollmentBlockCard } from "@/modules/seminars/components/blocks/EnrollmentBlockCard";

export function EnrollmentBlocks({
  enrollment,
  currentUser,
}: {
  enrollment: EnrollmentWindowWithBlocks;
  currentUser: User;
}) {
  return (
    <div
      className="
        grid gap-4
        grid-cols-1
        md:[grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]
      "
    >
      {/* Vykreslení karet bloků */}
      {enrollment.blocks.map((block, index) => (
        <EnrollmentBlockCard
          key={block.id}
          block={block}
          allBlocks={enrollment.blocks}
          index={index}
          total={enrollment.blocks.length}
          currentUser={currentUser}
          isWindowOpen={enrollment.phase === "OPEN"}
          rules={{
            allowSelfUnenroll: enrollment.allowSelfUnenroll ?? true,
            changesUntil: enrollment.changesUntil ?? null,
            endsAt: enrollment.endsAt,
            namesVisible: enrollment.resultsVisibility === "NAMES",
          }}
        />
      ))}
    </div>
  );
}