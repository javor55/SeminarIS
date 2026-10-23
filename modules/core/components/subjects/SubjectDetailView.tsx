"use client";

import { unwrap } from "@/lib/action-result";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/modules/core/components/users/ConfirmAction";
import { SubjectTeachingGrid } from "@/modules/core/components/subjects/SubjectTeachingGrid";
import { toggleSubjectActive, deleteSubjectPermanently, type SubjectDetail } from "@/modules/core/actions/subjects";
import type { SubjectTeaching } from "@/modules/core/actions/assignments";
import { subjectGradesLabel } from "@/lib/school";
import { formatDateTime } from "@/lib/datetime";
import { can } from "@/modules/registry";
import type { User } from "@/lib/types";

export function SubjectDetailView({
  subject,
  teaching,
  currentUser,
  children,
}: {
  subject: SubjectDetail;
  teaching: SubjectTeaching;
  currentUser: User;
  // Zápisy, kde je předmět nabízen (modul Semináře) – jen pro učitele a admina
  children?: ReactNode;
}) {
  const router = useRouter();
  const canEdit = can(currentUser.role, "core.subjects.edit");
  const canArchive = can(currentUser.role, "core.subjects.archive");

  async function toggleActive() {
    try {
      unwrap(await toggleSubjectActive(subject.id));
      toast.success(`Předmět byl ${subject.isActive ? "archivován" : "obnoven"}.`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Něco se pokazilo při změně stavu předmětu.");
    }
  }

  async function deletePermanently() {
    try {
      unwrap(await deleteSubjectPermanently(subject.id));
      toast.success("Předmět byl trvale smazán.");
      router.push("/subjects");
    } catch (err) {
      toast.error((err as Error).message || "Nepodařilo se smazat předmět.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/subjects", label: "Zpět na přehled předmětů" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {subject.name}
            <span
              className={
                subject.isActive
                  ? "bg-emerald-500/15 text-emerald-600 px-2 py-1 rounded text-xs font-medium"
                  : "bg-red-500/15 text-red-600 px-2 py-1 rounded text-xs font-medium"
              }
            >
              {subject.isActive ? "Aktivní" : "Archivováno"}
            </span>
            {subject.code && <span className="text-xs bg-muted px-2 py-1 rounded-md font-normal">{subject.code}</span>}
          </span>
        }
        description={subject.description || "Tento předmět nemá popis."}
        actions={
          canEdit ? (
            <>
              <Button size="sm" variant="outline" onClick={() => router.push(`/subjects/${subject.id}/edit`)}>
                Upravit předmět
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push(`/subjects/new/edit?duplicate=${subject.id}`)}>
                Duplikovat
              </Button>
              {canArchive && (
                <>
                  <ConfirmAction
                    title={subject.isActive ? "Archivovat předmět?" : "Obnovit předmět?"}
                    description={
                      subject.isActive
                        ? `Opravdu chcete archivovat předmět "${subject.name}"? Přestane se nabízet v nových zápisech a dopisování, ale jeho data zůstanou zachována.`
                        : `Opravdu chcete obnovit předmět "${subject.name}"? Opět se stane aktivním.`
                    }
                    actionLabel={subject.isActive ? "Archivovat" : "Obnovit"}
                    onConfirm={toggleActive}
                    trigger={
                      <Button size="sm" variant={subject.isActive ? "destructive" : "default"}>
                        {subject.isActive ? "Archivovat" : "Obnovit"}
                      </Button>
                    }
                  />
                  {!subject.isActive && (
                    <ConfirmAction
                      title="Trvale smazat předmět?"
                      description={`Opravdu chcete trvale a nevratně smazat předmět "${subject.name}"? Smažou se i jeho výskyty v zápisových oknech, zápisy studentů a úvazky.`}
                      actionLabel="Trvale smazat"
                      onConfirm={deletePermanently}
                      trigger={
                        <Button size="sm" variant="destructive">
                          Trvale smazat
                        </Button>
                      }
                    />
                  )}
                </>
              )}
            </>
          ) : undefined
        }
      />

      <Card className="shadow-sm">
        <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase font-semibold text-muted-foreground">Ročníky</div>
            <div data-testid="subject-grades">{subjectGradesLabel(subject.grades)}</div>
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-muted-foreground">V zápisu</div>
            {subject.windows.length === 0 ? (
              <div className="text-muted-foreground">Momentálně není nabízen v žádném zápisu.</div>
            ) : (
              <div className="flex flex-wrap gap-1" data-testid="subject-windows">
                {subject.windows.map((w) => (
                  <span key={w.id} className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/30">
                    v zápisu: {w.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Vytvořil: <strong>{subject.createdByName ?? "—"}</strong> dne <strong>{formatDateTime(subject.createdAt)}</strong>
              {" · "}
              Poslední úprava: <strong>{subject.updatedByName ?? "—"}</strong> dne <strong>{formatDateTime(subject.updatedAt)}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sylabus</CardTitle>
        </CardHeader>
        <CardContent>
          {subject.syllabus ? (
            <div
              className="prose prose-sm max-w-none max-h-96 overflow-y-auto pr-2"
              dangerouslySetInnerHTML={{ __html: subject.syllabus }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sylabus není k dispozici.</p>
          )}
        </CardContent>
      </Card>

      <SubjectTeachingGrid subjectId={subject.id} teaching={teaching} />

      {children}
    </div>
  );
}
