"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { getSubjects } from "@/lib/data";
import { users } from "@/lib/mock-db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SubjectsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const subjects = getSubjects();
  const [query, setQuery] = useState("");

  const filtered = subjects.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase())
  );

  function getEditorName(updatedById?: string) {
    if (!updatedById) return "—";
    const u = users.find((x) => x.id === updatedById);
    if (!u) return updatedById;
    return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  return (
    <div className="space-y-6">
      {/* HLAVIČKA */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Předměty</h1>
          <p className="text-sm text-muted-foreground">
            Přehled všech dostupných předmětů.
          </p>
        </div>
        <Input
          placeholder="Hledat předmět..."
          className="w-full md:w-72"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* TABULKA */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b text-left">
            <tr>
              <th className="px-4 py-2">Kód</th>
              <th className="px-4 py-2">Název</th>
              <th className="px-4 py-2 hidden lg:table-cell">Popis</th>
              <th className="px-4 py-2 hidden md:table-cell">Naposledy upravil</th>
              <th className="px-4 py-2 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const editor = getEditorName((s as any).updatedById);
              const editedAt = formatDate((s as any).updatedAt || (s as any).createdAt);

              return (
                <tr
                  key={s.id}
                  className="border-b last:border-0 hover:bg-slate-50 transition"
                >
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {s.code ?? "—"}
                  </td>
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 hidden lg:table-cell text-slate-500 truncate max-w-[280px]">
                    {s.description || "—"}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-slate-500">
                    <div className="flex flex-col">
                      <span>{editor}</span>
                      <span className="text-xs text-slate-400">{editedAt}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">                    
                    {/* Učitel i Admin mají stejné akce */}
                    {(user?.role === "TEACHER" || user?.role === "ADMIN") && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/subjects/${s.id}`)}
                        >
                          Detail
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => router.push(`/subjects/${s.id}/edit`)}
                        >
                          Upravit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            console.log("Smazat předmět", s.id);
                          }}
                        >
                          Smazat
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Žádné předměty neodpovídají hledání.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
