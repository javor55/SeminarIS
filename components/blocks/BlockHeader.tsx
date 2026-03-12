"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Block, SubjectOccurrence } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EditBlockDialog } from "@/components/blocks/EditBlockDialog";
import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { moveBlock, deleteBlock, updateBlock, createSubjectOccurrence, updateSubjectOccurrence, deleteSubjectOccurrence } from "@/lib/data";
import { toast } from "sonner";
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


export function BlockHeader({
  block,
  blockIndex,
  totalBlocks,
  isAdmin,
}: {
  block: Block & { description?: string; occurrences?: any[] };
  blockIndex: number;
  totalBlocks: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const hasOccurrences = (block.occurrences?.length ?? 0) > 0;


  // lokální stavy pro dialogy
  const [editBlock, setEditBlock] = useState<Block | null>(null);
  const [editOccurrence, setEditOccurrence] = useState<SubjectOccurrence | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        {/* Název + popis */}
        <div className="min-w-0 flex-1">
          <h2 className="font-medium truncate">{block.name}</h2>
          {block.description ? (
            <p className="text-sm text-muted-foreground truncate">
              {block.description}
            </p>
          ) : null}
        </div>

        {/* Akce – jen pro admina */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Přidat nový předmět do bloku */}
            <Button
              variant="default"
              size="sm"
              onClick={() =>
                setEditOccurrence({
                  id: "",
                  blockId: block.id,
                  subjectId: "",
                  teacherId: "",
                  subCode: "",
                  capacity: 0,
                  createdById: "",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  updatedById: "",
                } as any)
              }
            >
              Přidat předmět
            </Button>

            {/* Upravit blok */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditBlock(block)}
            >
              Upravit
            </Button>

            {/* Posunout blok nahoru */}
            <Button
              variant="outline"
              size="sm"
              disabled={blockIndex === 0}
              onClick={async () => {
                const ok = await moveBlock(block.id, "UP");
                if (ok) {
                  toast.success("Blok posunut nahoru");
                  router.refresh();
                } else toast.error("Blok nelze posunout výš");

              }}
            >
              ↑
            </Button>

            {/* Posunout blok dolů */}
            <Button
              variant="outline"
              size="sm"
              disabled={blockIndex === totalBlocks - 1}
              onClick={async () => {
                const ok = await moveBlock(block.id, "DOWN");
                if (ok) {
                  toast.success("Blok posunut dolů");
                  router.refresh();
                } else toast.error("Blok nelze posunout níž");

              }}
            >
              ↓
            </Button>

            {/* Smazat blok */}
            <Button
              variant="destructive"
              size="sm"
              disabled={hasOccurrences}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Smazat
            </Button>
          </div>
        )}
      </div>

      {/* ALERT: Potvrzení smazání bloku */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu smazat tento blok?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce trvale odstraní blok <strong>{block.name}</strong>. Tato akce je nevratná.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  const res = await deleteBlock(block.id);
                  if (res) {
                    toast.success("Blok byl smazán");
                    router.refresh();
                  } else {

                    toast.error("Blok se nepodařilo smazat");
                  }
                } catch (e: any) {
                  toast.error(e.message || "Nastala chyba při mazání bloku");
                } finally {
                  setShowDeleteConfirm(false);
                }
              }}
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editBlock && (
          <EditBlockDialog
            open={!!editBlock}
            block={editBlock}
            onOpenChange={(open) => {
              // když se dialog zavře, smažeme vybraný blok
              if (!open) setEditBlock(null);
            }}
            onSubmit={async (data) => {
              try {
                await updateBlock(data);
                toast.success("Blok byl upraven");
                router.refresh();

              } catch (e) {
                toast.error("Blok se nepodařilo upravit");
              }
            }}
          />
      )}

      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence as any}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
          onSubmit={async (data) => {
              if (data.id) {
                await updateSubjectOccurrence(data.id, data);
              } else {
                await createSubjectOccurrence(data);
              }
              router.refresh();
          }}

          onDelete={async (id) => {
              await deleteSubjectOccurrence(id);
              router.refresh();
          }}

        />
      )}
    </>
  );
}
