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
import { PageHeader } from "@/components/page-header";

type SubjectRegistration = Awaited<ReturnType<typeof getMySubjectRegistrations>>[number];

export function TeacherMakeupView({
  sessions,
  currentUserId,
  subjectRegistrations,
}: {
  sessions: MakeupSessionItem[];
  currentUserId: string;
  subjectRegistrations: SubjectRegistration[] | null;
}) {
  const mine = sessions.filter((s) => s.teacherId === currentUserId);
  const others = sessions.filter((s) => s.teacherId !== currentUserId && !s.cancelledAt);
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

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Moje termíny (dozor)</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionsTable sessions={mine} action={manageLink} empty="Zatím nemáte vypsané žádné termíny." />
        </CardContent>
      </Card>

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

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Termíny ostatních učitelů</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionsTable sessions={others} action={manageLink} empty="Žádné další termíny." />
        </CardContent>
      </Card>
    </div>
  );
}
