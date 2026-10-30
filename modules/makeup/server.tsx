import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatTimeRange } from "@/lib/datetime";
import { can } from "@/modules/registry";
import type { ModuleServer } from "@/modules/server-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMakeupEmailEstimates, runMakeupDailyJob } from "@/modules/makeup/notifications";

export const makeupServer: ModuleServer = {
  runDailyJob: runMakeupDailyJob,
  getEmailEstimates: () => getMakeupEmailEstimates(),

  async getDashboardWidget(user) {
    const now = new Date();

    // Student: nejbližší vlastní zápisy
    if (can(user.role, "makeup.register")) {
      const regs = await prisma.makeupRegistration.findMany({
        where: { studentId: user.id, session: { endsAt: { gte: now } } },
        include: { session: true, subjects: { include: { subject: true } } },
        orderBy: { session: { startsAt: "asc" } },
        take: 3,
      });
      if (regs.length === 0) return null;
      return (
        <Card data-testid="makeup-widget">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Moje dopisování</CardTitle>
            <Button asChild variant="outline" size="sm"><Link href="/makeup">Všechny termíny</Link></Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {regs.map((r) => (
                <li key={r.id} className={r.session.cancelledAt ? "text-destructive" : ""}>
                  <strong>{formatTimeRange(r.session.startsAt, r.session.endsAt)}</strong>, učebna {r.session.room}
                  {" – "}
                  {r.subjects.map((x) => x.subject.name).join(", ")}
                  {r.session.cancelledAt && " (termín zrušen – přepište se jinam)"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      );
    }

    // Učitel: nejbližší vlastní termíny (dozor)
    if (can(user.role, "makeup.sessions.manage")) {
      const sessions = await prisma.makeupSession.findMany({
        where: { teacherId: user.id, endsAt: { gte: now }, cancelledAt: null },
        include: { _count: { select: { registrations: true } } },
        orderBy: { startsAt: "asc" },
        take: 3,
      });
      if (sessions.length === 0) return null;
      return (
        <Card data-testid="makeup-widget">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Moje termíny dopisování</CardTitle>
            <Button asChild variant="outline" size="sm"><Link href="/makeup">Dopisování</Link></Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/makeup/sessions/${s.id}`} className="hover:underline">
                    <strong>{formatTimeRange(s.startsAt, s.endsAt)}</strong>, učebna {s.room} – zapsáno {s._count.registrations}/{s.capacity}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      );
    }
    return null;
  },

  async getSubjectUsage(subjectId) {
    const [sessions, registrations] = await Promise.all([
      prisma.makeupSession.count({ where: { subjects: { some: { subjectId } } } }),
      prisma.makeupRegistration.count({ where: { subjects: { some: { subjectId } } } }),
    ]);
    return [
      { id: "sessions", label: "Termíny dopisování s tímto předmětem", count: sessions },
      { id: "registrations", label: "Zápisy studentů na dopisování tohoto předmětu", count: registrations },
    ];
  },

  async getAdminStats() {
    const upcoming = await prisma.makeupSession.count({ where: { endsAt: { gte: new Date() }, cancelledAt: null } });
    return [{ label: "Termíny dopisování", value: upcoming, hint: "Nadcházející vypsané termíny", icon: "calendar" }];
  },

  async onUserDelete(tx, userId, replacementUserId) {
    // Termíny, které uživatel dozoroval nebo vytvořil, převezme admin, který maže
    await tx.makeupSession.updateMany({ where: { teacherId: userId }, data: { teacherId: replacementUserId } });
    await tx.makeupSession.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    await tx.makeupRegistration.updateMany({ where: { createdById: userId }, data: { createdById: replacementUserId } });
    // Zápisy studenta a vazby „vyučující“ řeší databáze (onDelete: Cascade / SetNull)
  },
};
