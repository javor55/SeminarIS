"use client";

import { unwrap } from "@/lib/action-result";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import type { User } from "@/lib/types";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { OccurrenceForDialog, OccurrencesStudentsDialog } from "@/modules/seminars/components/occurrences/OccurrencesStudentsDialog";
import { EditSubjectOccurrenceDialog } from "@/modules/seminars/components/occurrences/EditSubjectOccurrenceDialog";
import { OccurrenceRow, getOccurrenceColumns } from "@/modules/seminars/components/occurrences/occurrence-columns";
import { updateSubjectOccurrence, deleteSubjectOccurrence } from "@/modules/seminars/actions/windows";

/** Detail předmětu (učitel, admin): zápisy, kde je předmět nabízen, studenti a úpravy výskytů. */
export function SubjectOccurrencesPanel({ occurrences, currentUser }: { occurrences: OccurrenceRow[]; currentUser: User }) {
  const router = useRouter();
  const [selected, setSelected] = useState<OccurrenceRow | null>(null);
  const [edit, setEdit] = useState<OccurrenceRow | null>(null);
  const [toDelete, setToDelete] = useState<OccurrenceRow | null>(null);

  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser,
        showSubjectName: false,
        onStudents: (occ) => setSelected(occ),
        onEdit: (occ) => setEdit(occ),
        onDelete: (occ) => setToDelete(occ),
      }),
    [currentUser]
  );

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      unwrap(await deleteSubjectOccurrence(toDelete.id));
      toast.success("Výskyt byl smazán.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Nepodařilo se smazat výskyt.");
    }
  }

  return (
    <div className="space-y-2" data-testid="subject-occurrences">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Zápisy, kde je předmět nabízen</h2>
        <p className="text-sm text-muted-foreground" data-testid="subject-occurrences-summary">
          {occurrences.length === 0
            ? "Přehled bloků a zápisových oken, kde je tento předmět zařazen."
            : `Výskyty v zápisech: ${occurrences.length} (zápisová okna: ${new Set(occurrences.map((o) => o.enrollmentName)).size}, bloky: ${new Set(occurrences.map((o) => `${o.enrollmentName}/${o.blockName}`)).size}). Obsazenost a studenti jednotlivých výskytů jsou v tabulce.`}
        </p>
      </div>

      {occurrences.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">Tento předmět momentálně není v žádném zápisu nabízen.</p>
      ) : (
        <DataTable<OccurrenceRow>
          data={occurrences}
          columns={columns}
          searchPlaceholder="Hledat podle zápisu, bloku, učitele nebo kódu…"
          searchKeys={["searchText"]}
        />
      )}

      <ConfirmAction
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Smazat výskyt?"
        description="Opravdu smazat tento výskyt předmětu ze zápisu?"
        actionLabel="Smazat"
        onConfirm={confirmDelete}
      />

      {selected && (
        <OccurrencesStudentsDialog
          occurrence={selected as OccurrenceForDialog}
          currentUser={currentUser}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      )}

      {edit && (
        <EditSubjectOccurrenceDialog
          occurrence={edit}
          onOpenChange={(open) => !open && setEdit(null)}
          onSubmit={async (data) => {
            unwrap(await updateSubjectOccurrence(data.id, data));
            toast.success("Výskyt byl upraven.");
            router.refresh();
          }}
          onDelete={async (id) => {
            unwrap(await deleteSubjectOccurrence(id));
            toast.success("Výskyt byl smazán.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
