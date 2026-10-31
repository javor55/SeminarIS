"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeRange } from "@/lib/datetime";
import type { getMySubjectRegistrations } from "@/modules/makeup/actions/sessions";
import { ATTENDANCE_LABELS, type MakeupSessionItem } from "@/modules/makeup/types";
import { SessionsTable } from "./common";
import { SessionFormDialog } from "./SessionFormDialog";
import { SessionFilters } from "./SessionFilters";
import { PageHeader } from "@/components/page-header";

type SubjectRegistration = Awaited<ReturnType<typeof getMySubjectRegistrations>>[number];

export function TeacherMakeupView({
  upcoming,
  listed,
  truncated,
  currentUserId,
  isAdmin,
  supervises,
  subjectRegistrations,
  filterOptions,
}: {
  // nadcházející termíny (z nich „Moje termíny“)
  upcoming: MakeupSessionItem[];
  // termíny podle filtru z adresy
  listed: MakeupSessionItem[];
  truncated: boolean;
  currentUserId: string;
  isAdmin: boolean;
  // má vypsané termíny (řídí sekci „Moje termíny“)
  supervises: boolean;
  // „Kdo dopisuje moje písemky“; null = uživatel nemá úvazky, sekce se nezobrazuje
  subjectRegistrations: SubjectRegistration[] | null;
  filterOptions: { teachers: { id: string; name: string }[]; subjects: { id: string; name: string }[] };
}) {
  const mine = upcoming.filter((s) => s.teacherId === currentUserId);
  // Učitel vidí v seznamu jen cizí termíny (vlastní má nahoře), admin všechny
  const rows = isAdmin ? listed : listed.filter((s) => s.teacherId !== currentUserId);
  const manageLink = (s: MakeupSessionItem) =>
    s.canManage ? (
      <Button asChild size="sm" variant="outline">
        <Link href={`/makeup/sessions/${s.id}`}>Spravovat</Link>
      </Button>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dopisování písemek"
        description="Vypisujte termíny (svůj čas a učebnu), na které se studenti zapisují k dopsání písemek."
        actions={
          <SessionFormDialog
            trigger={
              <Button data-testid="new-session">
                <Plus className="w-4 h-4 mr-1" /> Nový termín
              </Button>
            }
          />
        }
      />

      {supervises && (
        <Card className="shadow-sm" data-testid="my-sessions">
          <CardHeader>
            <CardTitle>Moje termíny (dozor)</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionsTable sessions={mine} action={manageLink} empty="Žádné nadcházející termíny, které dozorujete." />
          </CardContent>
        </Card>
      )}

      {subjectRegistrations && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Kdo dopisuje moje písemky</CardTitle>
            <CardDescription>
              Podle úvazků: studenti vašich tříd, kteří si zvolili váš předmět (nadcházející a posledních 60 dní).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subjectRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nikdo.</p>
            ) : (
              <Table data-testid="subject-registrations">
                <TableHeader>
                  <TableRow>
                    <TableHead>Kdy</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Předmět</TableHead>
                    <TableHead>Kde / dozor</TableHead>
                    <TableHead>Poznámka</TableHead>
                    <TableHead>Stav</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjectRegistrations.map((r) => (
                    <TableRow key={`${r.registrationId}-${r.subjectName}`}>
                      <TableCell className="whitespace-nowrap">{formatTimeRange(r.startsAt, r.endsAt)}</TableCell>
                      <TableCell>{r.studentName}{r.classLabel && <span className="text-muted-foreground"> ({r.classLabel})</span>}</TableCell>
                      <TableCell>{r.subjectName}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.room} · {r.supervisorName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.note}</TableCell>
                      <TableCell>
                        {r.cancelled ? <Badge variant="destructive">termín zrušen</Badge> : ATTENDANCE_LABELS[r.attendance]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm" data-testid="all-sessions">
        <CardHeader>
          <CardTitle>{isAdmin ? "Všechny termíny" : "Termíny ostatních učitelů"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SessionFilters teachers={filterOptions.teachers} subjects={filterOptions.subjects} />
          <SessionsTable sessions={rows} action={manageLink} empty="Filtru neodpovídá žádný termín." />
          {truncated && <p className="text-xs text-muted-foreground">Zobrazeno prvních 300 termínů, zúžte filtr.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
