"use client";

import { unwrap } from "@/lib/action-result";
import * as React from "react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSubjects, updateSubject, createSubject } from "@/modules/seminars/actions/subjects";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Subject } from "@/lib/types";
import { toast } from "sonner";
import { can } from "@/modules/registry";
import { PageHeader } from "@/components/page-header";

function EditSubjectForm({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [subject, setSubject] = useState<Subject | undefined>();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const duplicateId = searchParams.get("duplicate");

  useEffect(() => {
    async function loadData() {
       setDataLoading(true);
       try {
         if (params.id === "new") {
           if (duplicateId) {
             const subjects = await getSubjects();
             const found = subjects.find((s) => s.id === duplicateId);
             if (found) {
               setName((found.name ?? "") + " (Kopie)");
               setCode(found.code ?? "");
               setDescription(found.description ?? "");
               setSyllabus(found.syllabus ?? "");
             }
           }
         } else {
           const subjects = await getSubjects();
           const found = subjects.find((s) => s.id === params.id);
           if (found) {
             setSubject(found);
             setName(found.name ?? "");
             setCode(found.code ?? "");
             setDescription(found.description ?? "");
             setSyllabus(found.syllabus ?? "");
           }
         }
       } catch {
         // Silently fail or log to error reporting
       } finally {
         setDataLoading(false);
       }
    }
    loadData();
  }, [params.id, duplicateId]);

  if (authLoading || dataLoading) {
    return <p>Načítám...</p>;
  }

  if (!subject && params.id !== "new") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Seminář nenalezen</h1>
        <p className="text-muted-foreground">
          Seminář s ID <code>{params.id}</code> nebyl nalezen.
        </p>
      </div>
    );
  }

  if (!user || !can(user.role, "seminars.subjects.edit")) {
    return <p>Nemáte oprávnění upravovat tento seminář.</p>;
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      const isNew = params.id === "new";
      let ok: Subject | null = null;
      
      const payload = {
        name,
        code,
        syllabus,
        description,
      };

      if (isNew) {
        ok = unwrap(await createSubject(payload));
      } else if (subject) {
        ok = unwrap(await updateSubject({
          id: subject.id,
          ...payload,
        }));
      }

      if (!ok) {
        setError("Nepodařilo se uložit seminář.");
      } else {
        toast.success(isNew ? "Seminář byl úspěšně vytvořen." : "Seminář byl úspěšně uložen.");
        const redirectId = ok.id;
        router.push(`/subjects/${redirectId}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message ?? "Chyba při ukládání.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: params.id === "new" ? "/subjects" : `/subjects/${params.id}`, label: "Zpět" }}
        title={params.id === "new" ? "Nový seminář" : "Upravit seminář"}
        description={subject?.name}
      />

      <div className="grid gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="name">
            Název
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="code">
            Kód
          </label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="description">
            Popis
          </label>
          <Textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Krátký hlavičkový popis semináře před sylabem..."
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Sylabus</label>
          <TiptapEditor value={syllabus} onChange={setSyllabus} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Ukládám..." : "Uložit"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => params.id === "new" ? router.push(`/subjects`) : router.push(`/subjects/${subject?.id}`)}
          >
            Zrušit
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function EditSubjectPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<p>Načítám formulář...</p>}>
      <EditSubjectForm params={params} />
    </Suspense>
  );
}
