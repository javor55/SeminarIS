import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSubjectDetail } from "@/modules/core/actions/subjects";
import { getSubjectTeaching } from "@/modules/core/actions/assignments";
import { SubjectDetailView } from "@/modules/core/components/subjects/SubjectDetailView";
import { collectSubjectTabs } from "@/modules/core/extensions";
import { User } from "@/lib/types";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
        <h1 className="text-xl font-semibold text-red-600">Předmět nenalezen</h1>
        <p className="mt-2 text-muted-foreground">Předmět s tímto ID neexistuje nebo k němu nemáte přístup.</p>
      </div>
    );
  }

  const teaching = await getSubjectTeaching(id);

  // Záložky modulů (např. zápisy z modulu Semináře); do F4 se zobrazují pod sebou
  const tabs = await collectSubjectTabs(id, currentUser);

  return (
    <SubjectDetailView subject={subject} teaching={teaching} currentUser={currentUser}>
      {tabs.map((tab) => (
        <section key={tab.id} data-subject-tab={tab.id}>
          {tab.content}
        </section>
      ))}
    </SubjectDetailView>
  );
}
