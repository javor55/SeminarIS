"use client";

import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { TabLinks, type TabLink } from "@/components/tab-links";
import type { SubjectDetail } from "@/modules/core/actions/subjects";
import { SubjectLifecycleDialogs } from "@/modules/core/components/subjects/SubjectLifecycleDialogs";
import { can } from "@/modules/registry";
import type { User } from "@/lib/types";

export function SubjectDetailView({
  subject,
  currentUser,
  tabs,
  activeTab,
}: {
  subject: SubjectDetail;
  currentUser: User;
  // Záložky (jádro + moduly přes getSubjectTabs) a aktivní záložka; obsah je už vykreslený na serveru
  tabs: (TabLink & { content: ReactNode })[];
  activeTab: string;
}) {
  const router = useRouter();
  const canEdit = can(currentUser.role, "core.subjects.edit");
  const canArchive = can(currentUser.role, "core.subjects.archive");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/subjects", label: "Zpět na přehled předmětů" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {subject.name}
            <Badge variant={subject.isActive ? "success" : "danger"} className="rounded px-2 py-1 font-medium">
              {subject.isActive ? "Aktivní" : "Archivováno"}
            </Badge>
            {subject.code && <span className="text-xs bg-muted px-2 py-1 rounded-md font-normal">{subject.code}</span>}
          </span>
        }
        actions={
          canEdit ? (
            <>
              <Button size="sm" variant="outline" onClick={() => router.push(`/subjects/${subject.id}/edit`)}>
                Upravit předmět
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push(`/subjects/new/edit?duplicate=${subject.id}`)}>
                Duplikovat
              </Button>
              {canArchive && <SubjectLifecycleDialogs subject={subject} />}
            </>
          ) : undefined
        }
      />

      <TabLinks tabs={tabs} activeId={activeTab} baseHref={`/subjects/${subject.id}`} testId="subject-tabs" />

      <section key={activeTab} data-subject-tab={activeTab}>
        {tabs.find((t) => t.id === activeTab)?.content}
      </section>
    </div>
  );
}
