"use client";

import * as React from "react";
import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OccurrenceForDialog, OccurrencesStudentsDialog } from "@/components/occurrences/OccurrencesStudentsDialog";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  User,
  StudentEnrollment,
  Subject,
  SubjectOccurrenceWithRelations,
} from "@/lib/types";
import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { DataTable } from "@/components/ui/data-table";
import {
  OccurrenceRow,
  getOccurrenceColumns,
} from "@/components/occurrences/occurrence-columns";
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
import { toast } from "sonner";
import { enrollStudent, unenrollStudent, toggleSubjectActive, updateSubjectOccurrence, deleteSubjectOccurrence } from "@/lib/data";

export function SubjectDetailClientView({
  subject,
  occurrences,
  usersList,
  currentUser,
}: {
  subject: Subject & { isActive: boolean };
  occurrences: OccurrenceRow[];
  usersList: User[];
  currentUser: User;
}) {
  const router = useRouter();

  const [selectedOccurrence, setSelectedOccurrence] = useState<OccurrenceRow | null>(null);

  const [editOccurrence, setEditOccurrence] = useState<OccurrenceRow | null>(
    null
  );

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const [sameSubjectAlert, setSameSubjectAlert] = useState<{
    subjectName: string;
    blockName: string;
  } | null>(null);

  const [switchEnroll, setSwitchEnroll] = useState<{
    fromOccurrenceId: string;
    toOccurrenceId: string;
    occurrence: OccurrenceRow;
  } | null>(null);

  const [unenrollConfirm, setUnenrollConfirm] = useState<OccurrenceRow | null>(null);

  const isStudent = currentUser.role === "STUDENT";

  const findMyEnrollmentInBlock = useCallback((blockOccurrences?: SubjectOccurrenceWithRelations[]): { occurrenceId: string, enrollmentId: string, occurrence: SubjectOccurrenceWithRelations } | null => {
    for (const occ of blockOccurrences || []) {
      const enr = (occ.enrollments as StudentEnrollment[] | undefined)?.find(
        (e) => e.studentId === currentUser.id && !e.deletedAt
      );
      if (enr) return { occurrenceId: occ.id, enrollmentId: enr.id, occurrence: occ };
    }
    return null;
  }, [currentUser.id]);

  const findSameSubjectInOtherBlocks = useCallback((targetOcc: OccurrenceRow) => {
    return occurrences.find(occ => 
      occ.id !== targetOcc.id && 
      occ.enrollmentWindow?.id === targetOcc.enrollmentWindow?.id &&
      occ.enrolledByMe
    );
  }, [occurrences]);

  const handleEnroll = useCallback(async (occ: OccurrenceRow) => {
    if (!isStudent) return;

    const alreadyEnrolled = findSameSubjectInOtherBlocks(occ);
    if (alreadyEnrolled) {
      setSameSubjectAlert({
        subjectName: subject.name,
        blockName: alreadyEnrolled.blockName
      });
      return;
    }

    // Pro účely kontroly v bloku musíme vědět, co dalšího je v bloku.
    // OccurrenceRow má block: Block, ale ne occurrences.
    // V této view (Detail předmětu) ale nemáme přístup ke všem výskytům v bloku snadno.
    // Předpokládáme, že occ.block v db by měl mít occurrences, ale OccurrenceRow má jen Block.
    // Prozatím zkusíme přetypovat, v reálu by to mělo být v datech.
    const inBlock = findMyEnrollmentInBlock((occ.block as unknown as { occurrences?: SubjectOccurrenceWithRelations[] })?.occurrences);
    if (inBlock && inBlock.occurrenceId !== occ.id) {
      setSwitchEnroll({
        fromOccurrenceId: inBlock.occurrenceId,
        toOccurrenceId: occ.id,
        occurrence: occ
      });
      return;
    }

    try {
      const res = await enrollStudent(currentUser.id, occ.id);
      if (res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Zápis byl úspěšně proveden.");
      router.refresh();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Nepodařilo se provést zápis.");
    }
  }, [currentUser.id, isStudent, router, findMyEnrollmentInBlock, findSameSubjectInOtherBlocks, subject.name]);

  const handleUnenroll = useCallback(async (occ: OccurrenceRow) => {
    const enr = occ.enrollments?.find(
      (e) => e.studentId === currentUser.id && !e.deletedAt
    );
    if (!enr) return;

    try {
      const res = await unenrollStudent(enr.id);
      if (res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Odhlášení bylo úspěšně provedeno.");
      router.refresh();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Nepodařilo se odhlásit.");
    } finally {
      setUnenrollConfirm(null);
    }
  }, [currentUser.id, router]);

  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser,
        showSubjectName: false,
        onStudents: (occ) => setSelectedOccurrence(occ),
        onEdit: (occ) => setEditOccurrence(occ),
        onDelete: async (occ) => {
          if (window.confirm("Opravdu smazat tento výskyt?")) {
            await deleteSubjectOccurrence(occ.id);
            toast.success("Výskyt byl smazán.");
            router.refresh();
          }
        },
        onEnroll: (occ) => handleEnroll(occ),
        onUnenroll: (occ) => setUnenrollConfirm(occ),
      }),
    [currentUser, router, handleEnroll]
  );

  const handleToggleActive = async () => {
    try {
      await toggleSubjectActive(subject.id);
      toast.success(`Předmět byl ${subject.isActive ? "archivován" : "aktivován"}.`);
      router.refresh();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Něco se pokazilo při změně stavu předmětu.");
    } finally {
      setShowArchiveConfirm(false);
    }
  };

  const getUserName = (userId?: string) => {
    if (!userId) return "—";
    const u = usersList.find((x) => x.id === userId);
    if (!u) return userId;
    const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return full || u.email || userId;
  };

  const formatDate = (dateStr?: string | Date) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("cs-CZ");
  };

  const isPrivilegedUser = currentUser.role === "ADMIN" || currentUser.role === "TEACHER";
  const isAdmin = currentUser.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/subjects" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět na přehled předmětů
        </Link>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold">{subject.name}</h1>
              <span className={subject.isActive ? "bg-emerald-500/15 text-emerald-600 px-2 py-1 rounded text-xs font-medium" : "bg-red-500/15 text-red-600 px-2 py-1 rounded text-xs font-medium"}>
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
              {isAdmin && (
                <Button
                  size="sm"
                  variant={subject.isActive ? "destructive" : "default"}
                  onClick={() => setShowArchiveConfirm(true)}
                >
                  {subject.isActive ? "Archivovat" : "Obnovit"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {subject.isActive ? "Archivovat předmět?" : "Obnovit předmět?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {subject.isActive
                ? `Opravdu chcete archivovat předmět "${subject.name}"? Předmět se přestane nabízet v aktuálních zápisech, ale jeho data zůstanou zachována.`
                : `Opravdu chcete obnovit předmět "${subject.name}"? Předmět se opět stane aktivním v katalogu.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              className={subject.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={handleToggleActive}
            >
              {subject.isActive ? "Archivovat" : "Obnovit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sameSubjectAlert && (
        <AlertDialog open onOpenChange={() => setSameSubjectAlert(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nelze se zapsat</AlertDialogTitle>
              <AlertDialogDescription>
                Tento předmět (<strong>{sameSubjectAlert.subjectName}</strong>) již máte zapsaný v jiném bloku (<strong>{sameSubjectAlert.blockName}</strong>) v rámci tohoto zápisu. Nejdříve se prosím odepište.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setSameSubjectAlert(null)}>
                Rozumím
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {switchEnroll && (
        <AlertDialog open onOpenChange={() => setSwitchEnroll(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Přepsat zápis?</AlertDialogTitle>
              {(() => {
                const inBlock = findMyEnrollmentInBlock((switchEnroll.occurrence.block as unknown as { occurrences?: SubjectOccurrenceWithRelations[] })?.occurrences);
                return (
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      V bloku <strong>{switchEnroll.occurrence.blockName}</strong> již máte zapsaný jiný seminář. Pokud budete pokračovat, vaše volba se přepíše.
                    </p>
                    {inBlock && (
                      <div className="bg-muted p-3 rounded text-sm space-y-1">
                        <p><strong>Současný:</strong> {inBlock.occurrence.subject.name}</p>
                        <p><strong>Nový:</strong> {subject.name}</p>
                      </div>
                    )}
                  </AlertDialogDescription>
                );
              })()}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const inBlock = findMyEnrollmentInBlock((switchEnroll.occurrence.block as unknown as { occurrences?: SubjectOccurrenceWithRelations[] })?.occurrences);
                    if (inBlock) {
                      const unRes = await unenrollStudent(inBlock.enrollmentId);
                      if (unRes && unRes.error) {
                         toast.error(unRes.error);
                         return;
                      }
                    }
                    const enRes = await enrollStudent(currentUser.id, switchEnroll.toOccurrenceId);
                    if (enRes && enRes.error) {
                      toast.error(enRes.error);
                      return;
                    }
                    toast.success("Zápis byl úspěšně přepsán.");
                    router.refresh();
                  } catch (err: unknown) {
                    const error = err as Error;
                    toast.error(error.message || "Nepodařilo se přepsat zápis.");
                  } finally {
                    setSwitchEnroll(null);
                  }
                }}
              >
                Přepsat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {unenrollConfirm && (
        <AlertDialog open onOpenChange={() => setUnenrollConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Odhlásit se z předmětu?</AlertDialogTitle>
              <AlertDialogDescription>
                Opravdu se chcete odhlásit z předmětu <strong>{subject.name}</strong> v bloku <strong>{unenrollConfirm.blockName}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => handleUnenroll(unenrollConfirm)}
              >
                Odepsat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
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
          {selectedOccurrence && (
            <OccurrencesStudentsDialog
              occurrence={selectedOccurrence as OccurrenceForDialog}
              currentUser={currentUser}
              onOpenChange={(open) => {
                if (!open) setSelectedOccurrence(null);
              }}
            />
          )}

          {editOccurrence && (
            <EditSubjectOccurrenceDialog
              occurrence={editOccurrence}
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
