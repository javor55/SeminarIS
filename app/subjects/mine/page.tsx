import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";
import { schoolYearLabel } from "@/lib/school";
import { can } from "@/modules/registry";
import { getCurrentSchoolYear } from "@/modules/core/school";
import { collectMySubjectsSections } from "@/modules/core/extensions";
import { getMyGradeSubjects, getMyTeaching } from "@/modules/core/my-subjects";

export default async function MySubjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!can(user.role, "core.subjects.mine")) redirect("/subjects");

  const isStudent = user.role === "STUDENT";
  const [year, teaching, grade, sections] = await Promise.all([
    getCurrentSchoolYear(),
    isStudent ? null : getMyTeaching(user.id),
    isStudent ? getMyGradeSubjects(user) : null,
    collectMySubjectsSections(user),
  ]);

  return (
    <div className="space-y-6" data-testid="my-subjects">
      <PageHeader
        title="Moje předměty"
        description={isStudent ? "Předměty vašeho ročníku, vaše semináře a dopisování." : `Předměty, které učíte ve školním roce ${schoolYearLabel(year.startYear)}, a co se k nim zrovna děje.`}
        back={{ href: "/subjects", label: "Všechny předměty" }}
      />

      <Card data-testid="my-subjects-core">
        <CardHeader>
          <CardTitle className="text-lg">{isStudent ? `Předměty ročníku${grade?.classLabel ? ` (třída ${grade.classLabel})` : ""}` : "Moje úvazky"}</CardTitle>
          <CardDescription>
            {isStudent ? "Aktivní předměty, které se ve vašem ročníku vyučují, a vyučující vaší třídy." : "Předměty a třídy z vašich úvazků v aktuálním školním roce."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isStudent ? (
            !grade || grade.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{grade?.classLabel ? "Pro váš ročník zatím nejsou žádné předměty." : "Zatím nemáte zařazenou třídu."}</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm" data-testid="my-grade-subjects">
                {grade.subjects.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="my-subject" data-subject={s.id}>
                    <Link href={`/subjects/${s.id}`} className="font-medium hover:underline">{s.name}{s.code ? ` (${s.code})` : ""}</Link>
                    <span className="text-xs text-muted-foreground">{s.teachers.length > 0 ? s.teachers.join(", ") : "vyučující neuveden"}</span>
                  </li>
                ))}
              </ul>
            )
          ) : !teaching || teaching.length === 0 ? (
            <p className="text-sm text-muted-foreground">V tomto školním roce nemáte žádný úvazek.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm" data-testid="my-teaching">
              {teaching.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="my-subject" data-subject={s.id}>
                  <Link href={`/subjects/${s.id}`} className="font-medium hover:underline">{s.name}{s.code ? ` (${s.code})` : ""}{!s.isActive ? " – archivováno" : ""}</Link>
                  <span className="text-xs text-muted-foreground">{s.classes.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {sections.map((s) => (
        <Card key={s.id} data-testid="my-subjects-section" data-section={s.id}>
          <CardHeader>
            <CardTitle className="text-lg">{s.title}</CardTitle>
            {s.description && <CardDescription>{s.description}</CardDescription>}
          </CardHeader>
          <CardContent>{s.content}</CardContent>
        </Card>
      ))}
    </div>
  );
}
