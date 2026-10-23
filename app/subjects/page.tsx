import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSubjects } from "@/modules/core/actions/subjects";
import { SubjectsClientView } from "@/modules/core/components/subjects/SubjectsClientView";
import { User } from "@/lib/types";

export default async function SubjectsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;
  const subjects = await getSubjects();

  return <SubjectsClientView subjects={subjects} currentUser={currentUser} />;
}
