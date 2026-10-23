import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllUsers } from "@/modules/core/actions/users";
import { UsersClientView } from "@/modules/core/components/users/UsersClientView";
import { User } from "@/lib/types";
import { UserRow } from "@/modules/core/components/users/users-columns";
import { can } from "@/modules/registry";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const currentUser = session.user as User;

  if (!can(currentUser.role, "core.users.view")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">Pro přístup k této stránce nemáte dostatečné oprávnění.</p>
      </div>
    );
  }

  const dbUsers = await getAllUsers();

  return (
    <UsersClientView 
      users={dbUsers as unknown as UserRow[]} 
      currentUser={currentUser} 
    />
  );
}