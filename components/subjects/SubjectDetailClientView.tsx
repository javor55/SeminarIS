"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OccurrencesStudentsDialog } from "@/components/occurrences/OccurrencesStudentsDialog";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  Block,
  EnrollmentWindowWithBlocks,
  User,
} from "@/lib/types";
import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { DataTable } from "@/components/ui/data-table";
import {
  OccurrenceRow,
  getOccurrenceColumns,
} from "@/components/occurrences/occurrence-columns";
import { toggleSubjectActive, updateSubjectOccurrence, deleteSubjectOccurrence } from "@/lib/data";
import { toast } from "sonner";

export function SubjectDetailClientView({
  subject,
  occurrences,
  usersList,
  currentUser,
}: {
  subject: any;
  occurrences: OccurrenceRow[];
  usersList: any[];
  currentUser: User;
}) {
  const router = useRouter();

  // Dialog "Studenti"
  const [selectedStudents, setSelectedStudents] = useState<{
    occurrenceId: string;
    block: Block & { occurrences: any[] };
  } | null>(null);

  // Dialog "Upravit výskyt"
  const [editOccurrence, setEditOccurrence] = useState<OccurrenceRow | null>(
    null
  );

  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser,
        showSubjectName: false,
        onStudents: (occ) =>
          setSelectedStudents({
            occurrenceId: occ.id,
            block: occ.block,
          }),
        onEdit: (occ) => setEditOccurrence(occ),
        onDelete: async (occ) => {
            if (window.confirm("Opravdu smazat tento výskyt?")) {
                await deleteSubjectOccurrence(occ.id);
                toast.success("Výskyt byl smazán.");
                router.refresh();
            }
        },
        onEnroll: (occ) => {
          // Logic for enrolling from the table if needed
        },
      }),
    [currentUser, router]
  );

  const handleToggleActive = async () => {
    const action = subject.isActive ? "archivovat" : "aktivovat";
    if (!window.confirm(`Opravdu chcete ${action} tento předmět?`)) return;
    try {
      await toggleSubjectActive(subject.id);
      toast.success(`Předmět byl ${subject.isActive ? "archivován" : "aktivován"}.`);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Něco se pokazilo při změně stavu předmětu.");
    }
  };

  const getUserName = (userId?: string) => {
    if (!userId) return "—";
    const u = usersList.find((x) => x.id === userId);
    if (!u) return userId;
    const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return full || u.email || userId;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("cs-CZ");
  };

  const isPrivilegedUser = currentUser.role === "ADMIN" || currentUser.role === "TEACHER";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/subjects" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět na přehled předmětů
        </Link>
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold">{subject.name}</h1>
              <span className={subject.isActive ? "bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs" : "bg-red-100 text-red-800 px-2 py-1 rounded text-xs"}>
                  {subject.isActive ? "Aktivní" : "Archivováno"}
              </span>
              {subject.code ? (
                <span className="text-xs bg-slate-100 px-2 py-1 rounded-md">
                  {subject.code}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {subject.description || "Tento předmět nemá popis."}
            </p>
            <p className="text-xs text-muted-foreground">
              Vytvořil: <strong>{getUserName(subject.createdById)}</strong> dne{" "}
              <strong>{formatDate(subject.createdAt)}</strong>
              <br />
              Poslední úprava: <strong>{getUserName(subject.updatedById)}</strong> dne{" "}
              <strong>{formatDate(subject.updatedAt)}</strong>
            </p>
          </div>

          {isPrivilegedUser && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/subjects/${subject.id}/edit`)}
              >
                Upravit předmět
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/subjects/new/edit?duplicate=${subject.id}`)}
              >
                Duplikovat
              </Button>
              <Button
                size="sm"
                variant={subject.isActive ? "destructive" : "default"}
                onClick={handleToggleActive}
              >
                {subject.isActive ? "Archivovat" : "Obnovit"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
        <h2 className="text-base font-semibold">Sylabus</h2>
        {subject.syllabus ? (
          <div
            className="prose prose-sm max-w-none max-h-96 overflow-y-auto pr-2"
            dangerouslySetInnerHTML={{
              __html: subject.syllabus ?? "",
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sylabus není k dispozici.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            Výskyty předmětu v zápisech
          </h2>
          <p className="text-sm text-muted-foreground">
            {isPrivilegedUser 
              ? "Přehled všech bloků a zápisových oken, kde je tento předmět zařazen."
              : "Seznam termínů a bloků, ve kterých si můžete tento předmět zapsat."}
          </p>
        </div>

        {occurrences.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">
            Tento předmět momentálně není v žádném {isPrivilegedUser ? "zápisu nabízen" : "pro vás dostupném zápisu"}.
          </p>
        ) : (
          <DataTable<OccurrenceRow>
            data={occurrences}
            columns={columns}
            searchPlaceholder="Hledat podle zápisu, bloku, učitele nebo kódu…"
            searchKeys={["searchText"]}
          />
        )}
      </div>

      {isPrivilegedUser && (
        <>
          {selectedStudents && (
            <OccurrencesStudentsDialog
              occurrenceId={selectedStudents.occurrenceId}
              block={selectedStudents.block}
              currentUser={currentUser}
              onOpenChange={(open) => {
                if (!open) setSelectedStudents(null);
              }}
            />
          )}

          {editOccurrence && (
            <EditSubjectOccurrenceDialog
              occurrence={editOccurrence as any}
              onOpenChange={(open) => !open && setEditOccurrence(null)}
              onSubmit={async (data) => {
                await updateSubjectOccurrence(data.id, data);
                toast.success("Výskyt byl upraven.");
                router.refresh();
              }}
              onDelete={async (id) => {
                await deleteSubjectOccurrence(id);
                toast.success("Výskyt byl smazán.");
                router.refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
