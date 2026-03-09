"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSubjects, updateSubject, createSubject } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Subject } from "@/lib/types";

function EditSubjectForm({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [subject, setSubject] = useState<(Subject & { syllabus?: string }) | undefined>();
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
           // Tvorba nového nebo duplikace
           if (duplicateId) {
             const subjects = await getSubjects();
             const found = subjects.find((s) => s.id === duplicateId) as any;
             if (found) {
               setName((found.name ?? "") + " (Kopie)");
               setCode(found.code ?? "");
               setDescription(found.description ?? ""); // Local descriptive UI property only
               setSyllabus(found.syllabus ?? "");
             }
           }
         } else {
           // Úprava stávajícího
           const subjects = await getSubjects();
           const found = subjects.find((s) => s.id === params.id) as any;
           if (found) {
             setSubject(found);
             setName(found.name ?? "");
             setCode(found.code ?? "");
             setDescription(found.description ?? "");
             setSyllabus(found.syllabus ?? "");
           }
         }
       } catch (err) {
         console.error(err);
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
        <h1 className="text-2xl font-semibold">Předmět nenalezen</h1>
        <p className="text-muted-foreground">
          Předmět s ID <code>{params.id}</code> nebyl nalezen.
        </p>
      </div>
    );
  }

  if (!user || (user.role !== "ADMIN" && user.role !== "TEACHER")) {
    return <p>Nemáte oprávnění upravovat tento předmět.</p>;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const isNew = params.id === "new";
      let ok: any;
      if (isNew) {
        ok = await createSubject({
          name,
          code,
          syllabus,
          description,
        } as any);
      } else {
        ok = await updateSubject({
          ...subject,
          name,
          code,
          syllabus,
          description,
          updatedAt: new Date().toISOString(),
          updatedById: user.id,
        } as any);
      }

      if (!ok) {
        setError("Nepodařilo se uložit předmět.");
      } else {
        const redirectId = isNew ? ok.id : subject?.id;
        router.push(`/subjects/${redirectId}`);
      }
    } catch (e: any) {
      setError(e.message ?? "Chyba při ukládání.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{params.id === "new" ? "Nový předmět" : "Upravit předmět"}</h1>
        {subject && <p className="text-sm text-muted-foreground">{subject.name}</p>}
      </div>

      <div className="grid gap-4">
        {/* Název */}
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

        {/* Kód */}
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

        {/* Popis (Pozn. pro autora: UI ho vykresluje, ale databáze ho nepodporuje, slouží jako local stash) */}
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

        {/* Sylabus */}
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
