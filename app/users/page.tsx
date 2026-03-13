import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { 
  getAllUsers, 
  getGlobalCohort 
} from "@/lib/data";
import { UsersClientView } from "@/components/users/UsersClientView";
import { User } from "@/lib/types";
import { UserRow } from "@/components/users/users-columns";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  if (currentUser.role !== "ADMIN" && currentUser.role !== "TEACHER") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">Pro přístup k této stránce nemáte dostatečné oprávnění.</p>
      </div>
    );
  }

  const [dbUsers, cohort] = await Promise.all([
    getAllUsers(),
    getGlobalCohort()
  ]);

  return (
    <UsersClientView 
      users={dbUsers as unknown as UserRow[]} 
      globalCohortInitial={cohort} 
      currentUser={currentUser} 
    />
  );
}