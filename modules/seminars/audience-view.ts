import type { Prisma } from "@prisma/client";
import { classLabel, compareClasses } from "@/lib/school";
import { audienceSummary, draftFromEntries, type AudienceView } from "@/modules/seminars/audience";
import { formatName } from "@/lib/names";

// Publikum okna pro zobrazení (jen pro učitele a adminy): s popisky tříd a jmény studentů.

export const audienceInclude = {
  audience: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      classGroup: true,
    },
  },
} satisfies Prisma.EnrollmentWindowInclude;

type AudienceRow = Prisma.EnrollmentWindowAudienceGetPayload<{ include: (typeof audienceInclude)["audience"]["include"] }>;

export function buildAudienceView(rows: readonly AudienceRow[]): AudienceView {
  const draft = draftFromEntries(rows);
  const classes = rows
    .filter((r) => r.type === "CLASS" && r.classGroup)
    .map((r) => r.classGroup!)
    .sort(compareClasses)
    .map((c) => ({ id: c.id, label: classLabel(c) }));
  const person = (r: AudienceRow) => ({ id: r.user!.id, name: formatName(r.user!, "list"), email: r.user!.email });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "cs");
  const users = rows.filter((r) => r.type === "USER" && r.user).map(person).sort(byName);
  const excluded = rows.filter((r) => r.type === "EXCLUDE_USER" && r.user).map(person).sort(byName);
  return { draft, classes, users, excluded, summary: audienceSummary(draft, classes.map((c) => c.label)) };
}
