import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/modules/registry";
import { getClassesOverview } from "@/modules/core/actions/classes";
import { describeBulkActions } from "@/modules/core/bulk-runner";
import { getPendingApprovals, getUserCounts, queryUsers } from "@/modules/core/users-query";
import { parseUserListQuery } from "@/modules/core/users-filter";
import { UsersView } from "@/modules/core/components/users/UsersView";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/");

  if (!can(currentUser.role, "core.users.view")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Přístup odepřen</h1>
        <p className="text-muted-foreground">Pro přístup k této stránce nemáte dostatečné oprávnění.</p>
      </div>
    );
  }

  const params = await searchParams;
  // Správa tříd se přesunula do administrace (staré odkazy zůstávají funkční)
  if (params.tab === "classes" && can(currentUser.role, "core.admin")) redirect("/admin/school-year");
  const canManage = can(currentUser.role, "core.users.manage");
  const tab = params.tab === "approvals" && canManage ? "approvals" : "users";

  const query = parseUserListQuery(params);
  const [classes, counts] = await Promise.all([getClassesOverview(), getUserCounts()]);
  const [list, approvals, actions] = await Promise.all([
    tab === "users" ? queryUsers(query) : null,
    tab === "approvals" ? getPendingApprovals() : null,
    tab === "users" ? describeBulkActions(currentUser) : [],
  ]);

  return (
    <UsersView
      tab={tab}
      query={query}
      list={list}
      approvals={approvals}
      classes={classes}
      counts={counts}
      actions={actions}
      currentUser={{ id: currentUser.id, role: currentUser.role }}
    />
  );
}
