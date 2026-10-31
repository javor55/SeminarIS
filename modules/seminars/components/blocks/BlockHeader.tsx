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
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { blockRulesLabel } from "@/modules/seminars/window-rules";
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
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium" data-testid="block-name">{block.name}</h2>
          <p className="text-xs text-muted-foreground" data-testid="block-rules">
            {blockRulesLabel({ required: block.required ?? true, minEnrollments: block.minEnrollments ?? 1, maxEnrollments: block.maxEnrollments ?? 1 })}
          </p>
          {block.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {block.description}
            </p>
          ) : null}
        </div>

        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1">
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Akce bloku ${block.name}`} data-testid="block-menu">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditBlock(block)}>Upravit blok</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={blockIndex === 0}
                  onSelect={async () => {
                    try {
                      const ok = unwrap(await moveBlock(block.id, "UP"));
                      if (ok) {
                        toast.success("Blok posunut nahoru");
                        router.refresh();
                      } else toast.error("Blok nelze posunout výš");
                    } catch (e) {
                      toast.error((e as Error).message || "Blok se nepodařilo posunout");
                    }
                  }}
                >
                  Posunout nahoru
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={blockIndex === totalBlocks - 1}
                  onSelect={async () => {
                    try {
                      const ok = unwrap(await moveBlock(block.id, "DOWN"));
                      if (ok) {
                        toast.success("Blok posunut dolů");
                        router.refresh();
                      } else toast.error("Blok nelze posunout níž");
                    } catch (e) {
                      toast.error((e as Error).message || "Blok se nepodařilo posunout");
                    }
                  }}
                >
                  Posunout dolů
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger"
                  disabled={hasOccurrences}
                  onSelect={() => setShowDeleteConfirm(true)}
                >
                  {hasOccurrences ? "Smazat blok (nejdřív odeberte předměty)" : "Smazat blok"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              } catch (e) {
                toast.error((e as Error).message || "Blok se nepodařilo upravit");
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
