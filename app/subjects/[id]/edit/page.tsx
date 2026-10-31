"use client";

import { unwrap } from "@/lib/action-result";
import * as React from "react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSubjectDetail, updateSubject, createSubject } from "@/modules/core/actions/subjects";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { toast } from "sonner";
import { can } from "@/modules/registry";
import { PageHeader } from "@/components/page-header";
import { GRADES } from "@/lib/school";
import { Checkbox } from "@/components/ui/checkbox";

function EditSubjectForm({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [found, setFound] = useState(false);
  const [title, setTitle] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [grades, setGrades] = useState<number[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const duplicateId = searchParams.get("duplicate");
  const isNew = params.id === "new";

  useEffect(() => {
    async function loadData() {
       setDataLoading(true);
       try {
         const sourceId = isNew ? duplicateId : params.id;
         if (sourceId) {
           const subject = await getSubjectDetail(sourceId);
           if (subject) {
             setFound(true);
             setTitle(subject.name);
             setName(isNew ? (subject.name ?? "") + " (Kopie)" : subject.name ?? "");
             // zkratka je jedinečná, kopie ji proto nepřebírá
             setCode(isNew ? "" : subject.code ?? "");
             setDescription(subject.description ?? "");
             setSyllabus(subject.syllabus ?? "");
             setGrades(subject.grades);
           }
         }
       } catch {
         // Silently fail or log to error reporting
       } finally {
         setDataLoading(false);
       }
    }
    loadData();
  }, [params.id, duplicateId, isNew]);

  if (authLoading || dataLoading) {
    return <p>Načítám...</p>;
  }

  if (!found && !isNew) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Předmět nenalezen</h1>
        <p className="text-muted-foreground">
          Předmět s ID <code>{params.id}</code> nebyl nalezen.
        </p>
      </div>
    );
  }

  if (!user || !can(user.role, "core.subjects.edit")) {
    return <p>Nemáte oprávnění upravovat tento předmět.</p>;
  }

  const toggleGrade = (g: number) => setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      const payload = { name, code, syllabus, description, grades };
      const saved = isNew ? unwrap(await createSubject(payload)) : unwrap(await updateSubject(params.id, payload));
      toast.success(isNew ? "Předmět byl úspěšně vytvořen." : "Předmět byl úspěšně uložen.");
      router.push(`/subjects/${saved.id}`);
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
        back={{ href: isNew ? "/subjects" : `/subjects/${params.id}`, label: "Zpět" }}
        title={isNew ? "Nový předmět" : "Upravit předmět"}
        description={isNew ? undefined : title}
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
            Zkratka (nepovinná)
          </label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Ročníky</label>
          <div className="flex flex-wrap items-center gap-3" id="subject-grades">
            {GRADES.map((g) => (
              <Checkbox key={g} data-grade={g} checked={grades.includes(g)} onChange={() => toggleGrade(g)} label={`${g}. ročník`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Ročníky, ve kterých se předmět vyučuje. Nic nezaškrtnuto = všechny.</p>
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
            placeholder="Krátký hlavičkový popis předmětu před sylabem..."
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Sylabus</label>
          <TiptapEditor value={syllabus} onChange={setSyllabus} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Ukládám..." : "Uložit"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(isNew ? "/subjects" : `/subjects/${params.id}`)}
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
