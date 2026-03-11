"use client";

// ZMĚNA 1: Přidáváme 'useEffect'
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getSubjects,
  getEnrollmentWindowsWithDetails,
  getUsersForFilters,
  toggleSubjectActive,
  updateSubjectOccurrence,
  deleteSubjectOccurrence
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import { OccurrencesStudentsDialog } from "@/components/occurrences/OccurrencesStudentsDialog";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  Block,
  EnrollmentWindowWithBlocks,
} from "@/lib/types";
import { EditSubjectOccurrenceDialog } from "@/components/occurrences/EditSubjectOccurrenceDialog";
import { DataTable } from "@/components/ui/data-table";
import {
  OccurrenceRow,
  getOccurrenceColumns,
} from "@/components/occurrences/occurrence-columns";
import { computeEnrollmentStatus } from "@/lib/utils";
// Mock users are no longer imported directly

// Status funkce nyní používá centralizovanou utilitu
function getWindowStatusLabel(
  ew: EnrollmentWindowWithBlocks,
  now = new Date()
) {
  return computeEnrollmentStatus(ew.status as any, ew.startsAt, ew.endsAt, now).label;
}

function getUserName(userId?: string, usersList: any[] = []) {
  if (!userId) return "—";
  const u = usersList.find((x) => x.id === userId);
  if (!u) return userId;
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.email || userId;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}


export default function SubjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // ZMĚNA 2: Načítáme 'user' A 'isLoading'
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // --- Začátek úpravy "Auth Guard" ---

  // ZMĚNA 3: useEffect nyní čeká na 'isLoading'
  useEffect(() => {
    // Přesměrujeme, POUZE POKUD:
    // 1. Načítání skončilo (isLoading === false)
    // 2. A ZÁROVEŇ uživatel neexistuje (user === null)
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]); // Sledujeme obě proměnné

  const [usersList, setUsersList] = useState<any[]>([]);
  const [subject, setSubject] = useState<any | null>(null);
  const [enrollmentWindows, setEnrollmentWindows] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Dialog "Studenti"
  const [selectedStudents, setSelectedStudents] = useState<{
    occurrenceId: string;
    block: Block & { occurrences: any[] };
  } | null>(null);

  // Dialog "Upravit výskyt"
  const [editOccurrence, setEditOccurrence] = useState<OccurrenceRow | null>(
    null
  );

  useEffect(() => {
     async function loadData() {
        setDataLoading(true);
        try {
          // 1. Získáme najednou vše
          const [u, allSubjs, ewWithDetails] = await Promise.all([
            getUsersForFilters(),
            getSubjects(),
            getEnrollmentWindowsWithDetails(true) // Viditelné zápisy strukturovaně - REPREZENTUJE N+1 FIX
          ]);
          setUsersList(u);
          
          const foundSubject = allSubjs.find((s) => s.id === params.id);
          setSubject(foundSubject || null);
          
          if (!foundSubject) {
             setDataLoading(false);
             return;
          }

          setEnrollmentWindows(ewWithDetails);

          // 3. Occurrences
          const occs: OccurrenceRow[] = ewWithDetails.flatMap((ew: any) =>
            ew.blocks.flatMap((block: any) =>
              block.occurrences
                .filter((occ: any) => occ.subject.id === params.id)
                .map((occ: any) => {
                  const enrolledCount = occ.enrollments
                    ? occ.enrollments.filter((e: any) => !e.deletedAt).length
                    : 0;

                  const capacityText =
                    occ.capacity == null
                      ? `${enrolledCount}/∞`
                      : `${enrolledCount}/${occ.capacity}`;

                  const hasStudents = enrolledCount > 0;

                  const fullCode = occ.subject?.code
                    ? `${occ.subject.code}${occ.subCode ? "/" + occ.subCode : ""}`
                    : occ.subCode ?? "—";

                  const teacherName = occ.teacher
                    ? `${occ.teacher.firstName} ${occ.teacher.lastName}`
                    : "—";

                  const statusLabel = getWindowStatusLabel(ew);

                  const searchText = [
                    ew.name,
                    block.name,
                    fullCode,
                    teacherName,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return {
                    ...(occ as any),
                    blockName: block.name,
                    block: block,
                    enrollmentWindow: ew,
                    enrollmentName: ew.name,
                    statusLabel,
                    capacityText,
                    hasStudents,
                    fullCode,
                    teacherName,
                    searchText,
                  } as OccurrenceRow;
                })
            )
          ) || [];
          setOccurrences(occs);

        } catch (err) {
          console.error(err);
        } finally {
          setDataLoading(false);
        }
     }
     loadData();
  }, [params.id]);

  const columns = useMemo(
    () =>
      getOccurrenceColumns({
        currentUser: user,
        showSubjectName: false,
        onStudents: (occ) =>
          setSelectedStudents({
            occurrenceId: occ.id,
            block: occ.block,
          }),
        onEdit: (occ) => setEditOccurrence(occ),
        onDelete: (occ) => {
          console.log("Smazat výskyt (TODO):", occ.id);
        },
        onEnroll: (occ) => {
          console.log("Zapsat studenta (TODO) do:", occ.id);
        },
      }),
    [user]
  );
  
  // ZMĚNA 4: "Guard" (Hlídač)
  // Pokud se data ještě načítají, NEBO pokud uživatel neexistuje,
  // tak nic nevykreslíme a počkáme.
  if (isLoading || !user) {
    return null; // Můžete sem dát i spinner, např. <p>Načítám...</p>
  }

  // --- Konec úpravy "Auth Guard" ---

  // OD TOHOTO BODU NÍŽE:
  // Máme 100% jistotu, že 'isLoading' je 'false' A 'user' je 'objekt'.
  
  if (dataLoading) return <p>Načítám detaily předmětu...</p>;

  if (!subject) {
    // (Tato logika je v pořádku, protože je až po 'user' guardu)
    return <p>Předmět nenalezen.</p>; // Lepší než nic
  }

  const createdByName = getUserName((subject as any).createdById, usersList);
  const updatedByName = getUserName((subject as any).updatedById, usersList);
  const createdAt = formatDate((subject as any).createdAt);
  const updatedAt = formatDate((subject as any).updatedAt);

  const isPrivilegedUser = user.role === "ADMIN" || user.role === "TEACHER";

  const handleToggleActive = async () => {
    if (!window.confirm(`Opravdu chcete ${subject.isActive ? "archivovat" : "Aktivovat"} tento předmět?`)) return;
    try {
      await toggleSubjectActive(subject.id);
      window.location.reload(); // Musí být tvrdé protože používáme useEffect state
    } catch (err) {
      console.error(err);
      alert("Něco se pokazilo při archivaci předmětu.");
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <Link href="/subjects" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zpět na přehled předmětů
          </Link>
        </div>

        {/* Karta: název + popis + audit (viditelná pro všechny) */}
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              {/* ... (zobrazení názvu, popisu, atd.) ... */}
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
                Vytvořil: <strong>{createdByName}</strong> dne{" "}
                <strong>{createdAt}</strong>
                <br />
                Poslední úprava: <strong>{updatedByName}</strong> dne{" "}
                <strong>{updatedAt}</strong>
              </p>
            </div>

            {/* Tlačítka (už nepotřebuje 'user?.') */}
            {(user.role === "ADMIN" || user.role === "TEACHER") && (
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

        {/* Karta: Sylabus (viditelná pro všechny) */}
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
          {/* ... (kód pro sylabus) ... */}
          <h2 className="text-base font-semibold">Sylabus</h2>
          {subject.syllabus ? (
            <div
              className="prose prose-sm max-w-none max-h-96 overflow-y-auto pr-2"
              dangerouslySetInnerHTML={{
                __html: (subject as any).syllabus ?? "",
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Sylabus není k dispozici.
            </p>
          )}
        </div>

        {/* Celá tato sekce je nyní podmíněná 'isPrivilegedUser' */}
        {isPrivilegedUser && (
          <div className="space-y-2">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Výskyty předmětu v zápisech
              </h2>
              <p className="text-sm text-muted-foreground">
                Přehled všech bloků a zápisových oken, kde je tento předmět
                zařazen.
              </p>
            </div>

            {occurrences.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">
                Tento předmět momentálně není v žádném zápisu nabízen.
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
        )}
      </div>

      {isPrivilegedUser && (
        <>
          {/* Dialog se studenty */}
          {selectedStudents && user && (
            <OccurrencesStudentsDialog
              occurrenceId={selectedStudents.occurrenceId}
              block={selectedStudents.block}
              currentUser={user} // 'user' zde 100% existuje
              onOpenChange={(open) => {
                if (!open) setSelectedStudents(null);
              }}
            />
          )}

          {/* Dialog pro editaci výskytu */}
          {editOccurrence && (
            <EditSubjectOccurrenceDialog
              occurrence={editOccurrence as any}
              onOpenChange={(open) => !open && setEditOccurrence(null)}
              onSubmit={async (data) => {
                await updateSubjectOccurrence(data.id, data);
                window.location.reload();
              }}
              onDelete={async (id) => {
                await deleteSubjectOccurrence(id);
                window.location.reload();
              }}
            />
          )}
        </>
      )}
    </>
  );
}