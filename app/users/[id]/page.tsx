import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TabLinks } from "@/components/tab-links";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/school";
import { can } from "@/modules/registry";
import { collectUserTabs } from "@/modules/core/extensions";
import { getUserAudit, getUserDetail, getUserEmails } from "@/modules/core/user-detail";
import type { UserListRow } from "@/modules/core/users-query";
import { AssignmentsTab, ClassesTab, EmailsTab, HistoryTab, ProfileTab } from "@/modules/core/components/users/detail/UserDetailTabs";
import { UserActions } from "@/modules/core/components/users/detail/UserActions";
import { TeacherAssignmentsDialog } from "@/modules/core/components/users/TeacherAssignmentsDialog";
import { ImpersonateButton } from "@/modules/core/components/users/ImpersonateButton";

type Tab = { id: string; label: string; order: number; content: React.ReactNode };

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // Student (a host) cizí detail nevidí; učitel čte, správce upravuje
  if (!can(viewer.role, "core.users.view")) redirect("/dashboard");

  const { id } = await params;
  const { tab: requested } = await searchParams;
  const user = await getUserDetail(id);
  if (!user) {
    return (
      <div className="space-y-4" data-testid="user-not-found">
        <PageHeader title="Uživatel nenalezen" back={{ href: "/users", label: "Uživatelé" }} />
        <p className="text-muted-foreground">Uživatel s tímto ID neexistuje (možná byl smazán).</p>
      </div>
    );
  }

  const canManage = can(viewer.role, "core.users.manage");
  const isAdminView = can(viewer.role, "core.admin");
  const isSelf = viewer.id === user.id;
  const name = `${user.firstName} ${user.lastName}`;

  // Řádek pro dialogy (úprava, studium, úvazky) – stejný tvar jako řádek seznamu
  const row: UserListRow = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    classGroupId: user.classGroupId,
    classLabel: user.classLabel,
    requestedClassGroupId: null,
    studyLabel: user.studyLabel,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    assignmentCount: user.assignmentCount,
  };
  const canImpersonate = can(viewer.role, "core.impersonate") && !viewer.impersonatedBy && !isSelf && user.role !== "ADMIN" && user.isActive;

  const tabs: Tab[] = [
    {
      id: "profile",
      label: "Profil",
      order: 0,
      content: <ProfileTab user={user} actions={canManage ? <UserActions user={row} isSelf={isSelf} /> : undefined} />,
    },
  ];
  if (user.role === "STUDENT" || user.classHistory.length > 0) {
    tabs.push({ id: "classes", label: "Třídy", order: 10, content: <ClassesTab user={user} /> });
  }
  if (user.role === "TEACHER" || user.role === "ADMIN" || user.assignments.length > 0) {
    tabs.push({
      id: "assignments",
      label: "Úvazky",
      order: 20,
      content: (
        <AssignmentsTab
          user={user}
          editor={can(viewer.role, "core.school.manage") && (user.role === "TEACHER" || user.role === "ADMIN") ? <TeacherAssignmentsDialog user={row} editable /> : undefined}
        />
      ),
    });
  }
  // Historie změn a e-maily vidí jen správce (stejně jako Administraci → Historie a Upozornění)
  if (isAdminView) {
    const [audit, emails] = await Promise.all([getUserAudit(user.id), getUserEmails(user.id, user.email)]);
    tabs.push({ id: "history", label: "Historie", order: 30, content: <HistoryTab userId={user.id} audit={audit} /> });
    tabs.push({ id: "emails", label: "E-maily", order: 40, content: <EmailsTab emails={emails} /> });
  }
  // Záložky modulů (Semináře, Dopisování …): jen ze zapnutých modulů, oprávnění si hlídají samy
  tabs.push(...(await collectUserTabs(user.id, viewer)));
  tabs.sort((a, b) => a.order - b.order);

  const active = tabs.find((t) => t.id === requested) ?? tabs[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {name}
            <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
            {user.classLabel && <Badge variant="secondary">{user.classLabel}</Badge>}
            {!user.isActive && <Badge variant="secondary">neaktivní</Badge>}
          </span>
        }
        description={user.email}
        back={{ href: "/users", label: "Uživatelé" }}
        actions={canImpersonate ? <ImpersonateButton userId={user.id} name={name} label="Zobrazit jako" /> : undefined}
      />

      <TabLinks tabs={tabs} activeId={active.id} baseHref={`/users/${user.id}`} testId="user-tabs" />

      <section key={active.id} data-user-tab={active.id}>
        {active.content}
      </section>
    </div>
  );
}
