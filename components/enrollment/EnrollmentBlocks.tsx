"use client";

import { EnrollmentWindowWithBlocks, User } from "@/lib/types";
import { EnrollmentBlockCard } from "@/components/enrollment/EnrollmentBlockCard";
import { Button } from "@/components/ui/button";

export function EnrollmentBlocks({
  enrollment,
  currentUser,
}: {
  enrollment: EnrollmentWindowWithBlocks;
  currentUser: User;
}) {
  const isAdmin = currentUser.role === "ADMIN";

  return (
    <>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              // tady by v reálu bylo "přidat blok"
              // teď to jen ukážeme v konzoli
              console.log("TODO: přidat blok do zápisu", enrollment.id);
            }}
          >
            Přidat blok
          </Button>
        </div>
      )}

      <div
        className="
          grid gap-4
          grid-cols-1
          md:[grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]
        "
      >
        {enrollment.blocks.map((block, index) => (
          <EnrollmentBlockCard
            key={block.id}
            block={block}
            index={index}
            total={enrollment.blocks.length}
            currentUser={currentUser}            
          />
        ))}
      </div>
    </>
  );
}
