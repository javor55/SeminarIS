import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSubjectDetail } from "@/modules/core/actions/subjects";
import { getSubjectTeaching } from "@/modules/core/actions/assignments";
import { SubjectDetailView } from "@/modules/core/components/subjects/SubjectDetailView";
import { SubjectOverviewTab } from "@/modules/core/components/subjects/SubjectOverviewTab";
import { SubjectTeachingGrid } from "@/modules/core/components/subjects/SubjectTeachingGrid";
import { can } from "@/modules/registry";
import { collectSubjectTabs } from "@/modules/core/extensions";
import { User } from "@/lib/types";

export default async function SubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  if (id === "new") {
    redirect("/subjects/new/edit");
  }

  const subject = await getSubjectDetail(id);

  if (!subject) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-danger">Předmět nenalezen</h1>
        <p className="mt-2 text-muted-foreground">Předmět s tímto ID neexistuje nebo k němu nemáte přístup.</p>
      </div>
    );
  }

  const teaching = await getSubjectTeaching(id);

  // Záložky: Přehled a Vyučující z jádra, další dodávají zapnuté moduly (oprávnění si hlídají samy)
  const tabs = [
    {
      id: "overview",
      label: "Přehled",
      order: 0,
      content: <SubjectOverviewTab subject={subject} showAudit={can(currentUser.role, "core.subjects.edit")} />,
    },
    { id: "teaching", label: "Vyučující", order: 10, content: <SubjectTeachingGrid subjectId={subject.id} teaching={teaching} /> },
    ...(await collectSubjectTabs(id, currentUser)),
  ].sort((a, b) => a.order - b.order);
  const active = tabs.find((t) => t.id === requested) ?? tabs[0];

  return <SubjectDetailView subject={subject} currentUser={currentUser} tabs={tabs} activeTab={active.id} />;
}
