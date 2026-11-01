import { prisma } from "@/lib/prisma";
import { can } from "@/modules/registry";
import type { User } from "@/lib/types";
import type { AdminTodo } from "@/modules/types";
import { getCronStatus, getEmailDiagnostics } from "@/modules/core/system-status";

// Položky přehledu „co udělat“, které patří jádru (účty, třídy, denní úloha, e-maily, předměty).
// Položky modulů dodávají jejich `getAdminTodos`. Počet 0 se v přehledu nezobrazuje.

export async function getCoreAdminTodos(user: User): Promise<AdminTodo[]> {
  if (!can(user.role, "core.admin")) return [];
  const todos: AdminTodo[] = [];

  const [pending, withoutClass, withoutGrades, subjectsWithoutAssignment, classesWithoutAssignment, cron, email] = await Promise.all([
    prisma.user.count({ where: { role: "GUEST", isActive: true } }),
    prisma.user.count({ where: { role: "STUDENT", isActive: true, studyStatus: "ACTIVE", classGroupId: null } }),
    prisma.subject.count({ where: { isActive: true, grades: { isEmpty: true } } }),
    prisma.subject.count({ where: { isActive: true, teachingAssignments: { none: { schoolYear: { isCurrent: true } } } } }),
    prisma.classGroup.count({
      where: {
        students: { some: { role: "STUDENT", isActive: true, studyStatus: "ACTIVE" } },
        teachingAssignments: { none: { schoolYear: { isCurrent: true } } },
      },
    }),
    getCronStatus(),
    getEmailDiagnostics(),
  ]);

  todos.push(
    { id: "pending-accounts", label: "Účty čekající na schválení", count: pending, severity: "warning", href: "/users?tab=approvals" },
    { id: "students-without-class", label: "Studenti bez třídy", count: withoutClass, severity: "warning", href: "/users" }
  );

  // Denní úloha
  if (!cron.secretConfigured) {
    todos.push({ id: "cron-secret", label: "Denní úloha se nespustí: chybí proměnná CRON_SECRET", count: 1, severity: "critical", href: "/admin/diagnostics" });
  } else if (cron.lastRunDay === null) {
    todos.push({ id: "cron-never", label: "Denní úloha ještě neběžela", count: 1, severity: "info", href: "/admin/diagnostics" });
  } else if (cron.daysSince !== null && cron.daysSince >= 2) {
    todos.push({ id: "cron-stale", label: `Denní úloha neběžela ${cron.daysSince} dní (naposledy ${cron.lastRunDay})`, count: 1, severity: "warning", href: "/admin/diagnostics" });
  }
  if (cron.lastFailure?.latestRun) {
    todos.push({ id: "cron-failed", label: "Poslední běh denní úlohy skončil chybou", count: 1, severity: "warning", href: "/admin/diagnostics" });
  }

  // E-maily
  if (email.enabled && !email.status.configured) {
    todos.push({ id: "email-missing", label: `E-maily nejdou odesílat: chybí ${email.status.missing.join(", ")}`, count: email.status.missing.length, severity: "warning", href: "/admin/notifications" });
  }
  const { usage } = email;
  for (const [id, used, limit, skipped, name] of [
    ["email-daily", usage.today, usage.dailyLimit, usage.skippedToday, "denní"],
    ["email-monthly", usage.month, usage.monthlyLimit, usage.skippedMonth, "měsíční"],
  ] as const) {
    if (limit <= 0 || used < limit * 0.8) continue;
    todos.push({
      id,
      label: used >= limit ? `Vyčerpán ${name} limit e-mailů (${used}/${limit}), přeskočeno ${skipped}` : `Čerpání ${name}ho limitu e-mailů: ${used}/${limit}`,
      count: used >= limit ? Math.max(skipped, 1) : used,
      severity: used >= limit ? "critical" : "warning",
      href: "/admin/notifications",
    });
  }
  todos.push({ id: "email-failed", label: "Neúspěšně odeslané e-maily za posledních 24 hodin", count: email.failed24h, severity: "warning", href: "/admin/notifications" });

  // Microsoft 365 (nenastavené) tu už není: není to úkol, stav je v Diagnostice → Přihlášení.

  // Jen informativně
  todos.push(
    { id: "subjects-without-grades", label: "Předměty bez určených ročníků (platí pro všechny ročníky)", count: withoutGrades, severity: "info", href: "/subjects" },
    { id: "subjects-without-assignment", label: "Předměty bez úvazku učitele v aktuálním školním roce", count: subjectsWithoutAssignment, severity: "info", href: "/subjects" },
    { id: "classes-without-assignment", label: "Třídy bez úvazků učitelů v aktuálním školním roce", count: classesWithoutAssignment, severity: "info", href: "/admin/school-year" }
  );

  return todos;
}
