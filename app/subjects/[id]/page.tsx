import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSubjectDetail } from "@/modules/core/actions/subjects";
import { getSubjectTeaching } from "@/modules/core/actions/assignments";
import { SubjectDetailView } from "@/modules/core/components/subjects/SubjectDetailView";
import { SubjectOccurrencesPanel } from "@/modules/seminars/components/subjects/SubjectOccurrencesPanel";
import { getSubjectOccurrences } from "@/modules/seminars/actions/occurrences";
import { isModuleEnabled } from "@/lib/modules";
import { User } from "@/lib/types";
import { can } from "@/modules/registry";

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

  // Zápisy, kde je předmět nabízen (modul Semináře) – jen pro učitele a admina
  const showOccurrences = can(currentUser.role, "seminars.windows.view") && (await isModuleEnabled("seminars"));
  const occurrences = showOccurrences ? await getSubjectOccurrences(id) : null;

  return (
    <SubjectDetailView subject={subject} teaching={teaching} currentUser={currentUser}>
      {occurrences && <SubjectOccurrencesPanel occurrences={occurrences} currentUser={currentUser} />}
    </SubjectDetailView>
  );
}
