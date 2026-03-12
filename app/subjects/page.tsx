import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUsersForFilters, getSubjects } from "@/lib/data";
import { SubjectsClientView } from "@/components/subjects/SubjectsClientView";
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
      subjects={dbSubj as any} 
      users={dbUser} 
      currentUser={currentUser} 
    />
  );
}