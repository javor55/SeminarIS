"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSubjects, updateSubject } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Subject } from "@/lib/types";

export default function EditSubjectPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [subject, setSubject] = useState<(Subject & { syllabus?: string }) | undefined>();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
       setDataLoading(true);
       const subjects = await getSubjects();
       const found = subjects.find((s) => s.id === params.id) as unknown as (Subject & { syllabus?: string }) | undefined;
       if (found) {
         setSubject(found);
         setName(found.name ?? "");
         setCode(found.code ?? "");
         setDescription(found.description ?? "");
         setSyllabus(found.syllabus ?? "");
       }
       setDataLoading(false);
    }
    loadData();
  }, [params.id]);

  if (dataLoading) {
    return <p>Načítám...</p>;
  }

  if (!subject) {
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
      const ok = await updateSubject({
        ...subject,
        name,
        code,
        syllabus,
        description,
        updatedAt: new Date().toISOString(),
        updatedById: user.id,
      } as any);

      if (!ok) {
        setError("Nepodařilo se uložit předmět.");
      } else {
        router.push(`/subjects/${subject.id}`);
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
        <h1 className="text-2xl font-semibold">Upravit předmět</h1>
        <p className="text-sm text-muted-foreground">{subject.name}</p>
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

        {/* Popis */}
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="description">
            Popis
          </label>
          <Textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Krátký popis předmětu..."
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
            onClick={() => router.push(`/subjects/${subject.id}`)}
          >
            Zrušit
          </Button>
        </div>
      </div>
    </div>
  );
}
