import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllUsers } from "@/modules/core/actions/users";
import { getClassesOverview } from "@/modules/core/actions/classes";
import { UsersClientView, type UsersTab } from "@/modules/core/components/users/UsersClientView";
import { User } from "@/lib/types";
import { UserRow } from "@/modules/core/components/users/users-columns";
import { can } from "@/modules/registry";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
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

  const { tab } = await searchParams;
  // Správa tříd se přesunula do administrace (staré odkazy zůstávají funkční)
  if (tab === "classes" && can(currentUser.role, "core.admin")) redirect("/admin/school-year");
  const [dbUsers, classes] = await Promise.all([getAllUsers(), getClassesOverview()]);

  return (
    <UsersClientView 
      users={dbUsers as unknown as UserRow[]} 
      currentUser={currentUser} 
      classes={classes}
      initialTab={tab === "approvals" ? (tab as UsersTab) : "users"}
    />
  );
}
