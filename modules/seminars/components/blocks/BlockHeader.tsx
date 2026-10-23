"use client";

import { unwrap } from "@/lib/action-result";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Block, SubjectOccurrence } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EditBlockDialog } from "@/modules/seminars/components/blocks/EditBlockDialog";
import { EditSubjectOccurrenceDialog } from "@/modules/seminars/components/occurrences/EditSubjectOccurrenceDialog";
import { moveBlock, deleteBlock, updateBlock, createSubjectOccurrence, updateSubjectOccurrence, deleteSubjectOccurrence } from "@/modules/seminars/actions/windows";
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
  block: Block & { description?: string; occurrences?: SubjectOccurrence[] };
  blockIndex: number;
  totalBlocks: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const hasOccurrences = (block.occurrences?.length ?? 0) > 0;

  const [editBlock, setEditBlock] = useState<Block | null>(null);
  const [editOccurrence, setEditOccurrence] = useState<SubjectOccurrence | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium truncate">{block.name}</h2>
          {block.description ? (
            <p className="text-sm text-muted-foreground truncate">
              {block.description}
            </p>
          ) : null}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
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
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  updatedById: "",
                } as SubjectOccurrence)
              }
            >
              Přidat předmět
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditBlock(block)}
            >
              Upravit
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={blockIndex === 0}
              onClick={async () => {
                const ok = unwrap(await moveBlock(block.id, "UP"));
                if (ok) {
                  toast.success("Blok posunut nahoru");
                  router.refresh();
                } else toast.error("Blok nelze posunout výš");
              }}
            >
              ↑
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={blockIndex === totalBlocks - 1}
              onClick={async () => {
                const ok = unwrap(await moveBlock(block.id, "DOWN"));
                if (ok) {
                  toast.success("Blok posunut dolů");
                  router.refresh();
                } else toast.error("Blok nelze posunout níž");
              }}
            >
              ↓
            </Button>

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
                  const res = unwrap(await deleteBlock(block.id));
                  if (res) {
                    toast.success("Blok byl smazán");
                    router.refresh();
                  } else {
                    toast.error("Blok se nepodařilo smazat");
                  }
                } catch (err: unknown) {
                  const error = err as Error;
                  toast.error(error.message || "Nastala chyba při mazání bloku");
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
              if (!open) setEditBlock(null);
            }}
            onSubmit={async (data) => {
              try {
                unwrap(await updateBlock(data));
                toast.success("Blok byl upraven");
                router.refresh();
              } catch {
                toast.error("Blok se nepodařilo upravit");
              }
            }}
          />
      )}

      {editOccurrence && (
        <EditSubjectOccurrenceDialog
          occurrence={editOccurrence}
          onOpenChange={(open) => !open && setEditOccurrence(null)}
          onSubmit={async (data) => {
              if (data.id) {
                unwrap(await updateSubjectOccurrence(data.id, data));
              } else {
                unwrap(await createSubjectOccurrence(data));
              }
              router.refresh();
          }}
          onDelete={async (id) => {
              unwrap(await deleteSubjectOccurrence(id));
              router.refresh();
          }}
        />
      )}
    </>
  );
}
