import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUsersForFilters } from "@/modules/core/actions/users";
import { getSubjects } from "@/modules/seminars/actions/subjects";
import { SubjectsClientView } from "@/modules/seminars/components/subjects/SubjectsClientView";
import { User } from "@/lib/types";

export default async function SubjectsPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  // Načítáme data přímo na serveru
  const [dbSubj, dbUser] = await Promise.all([
    getSubjects(),
    getUsersForFilters()
  ]);

  return (
    <SubjectsClientView 
      subjects={dbSubj} 
      users={dbUser} 
      currentUser={currentUser} 
    />
  );
}