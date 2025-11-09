"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSubjects } from "@/lib/data";
import { updateSubject } from "@/lib/mock-db";
import { Input } from "@/components/ui/input";
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
  const subjects = getSubjects();
  const subject = subjects.find((s) => s.id === params.id) as
    | (Subject & { syllabus?: string })
    | undefined;

  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState(subject?.code ?? "");
  const [syllabus, setSyllabus] = useState<string>(subject?.syllabus ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const ok = updateSubject({
        ...subject,
        name,
        code,
        syllabus,
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

        {/* Sylabus (Tiptap) */}
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
