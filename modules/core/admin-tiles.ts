import { prisma } from "@/lib/prisma";
import { getAuthSettings } from "@/lib/auth-settings";
import { getAuditRetentionYears } from "@/lib/audit-settings";
import { getEnabledModuleIds } from "@/lib/modules";
import { formatRemaining } from "@/lib/datetime";
import { plural } from "@/lib/plural";
import { MODULES } from "@/modules/registry";
import { getEmailDiagnostics } from "@/modules/core/system-status";
import { getCurrentSchoolYear } from "@/modules/core/school";
import { schoolYearLabel } from "@/lib/school";

// Dlaždice „Stav systému“ a podtitulek přehledu administrace (F13). Jen čtení z už existujících nastavení a stavů;
// podrobnosti a změny zůstávají v sekcích, kam dlaždice vedou.

export type SystemTile = {
  id: string;
  title: string;
  href: string;
  // ok = vše běží, warn = vyžaduje pozornost, off = vypnuto (neutrálně)
  tone: "ok" | "warn" | "off";
  status: string;
  hint: string;
};

/** „před chvílí“, „před 5 h 12 min“ */
function ago(d: Date): string {
  const ms = Date.now() - d.getTime();
  return ms < 60_000 ? "před chvílí" : `před ${formatRemaining(ms)}`;
}

export async function getSystemTiles(): Promise<SystemTile[]> {
  const [email, auth, lastChange, retention, enabled] = await Promise.all([
    getEmailDiagnostics(),
    getAuthSettings(),
    prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    getAuditRetentionYears(),
    getEnabledModuleIds(),
  ]);

  const emailTile: SystemTile = !email.enabled
    ? { id: "email", title: "E-maily", href: "/admin/notifications", tone: "off", status: "Vypnuto", hint: "hlavní vypínač e-mailů je vypnutý" }
    : !email.status.configured
      ? { id: "email", title: "E-maily", href: "/admin/notifications", tone: "warn", status: "Nenastaveno", hint: `chybí ${email.status.missing.join(", ")}` }
      : {
          id: "email",
          title: "E-maily",
          href: "/admin/notifications",
          tone: email.failed24h > 0 ? "warn" : "ok",
          status: email.failed24h > 0 ? `${email.failed24h} neúspěšných za 24 h` : "Zapnuto",
          hint: `dnes odesláno ${email.usage.today}${email.usage.dailyLimit > 0 ? ` z limitu ${email.usage.dailyLimit}` : ""}`,
        };

  const passwordHint = { ALL: "heslem se smí přihlásit každý", STAFF: "heslem jen učitelé a admini", ADMIN: "heslem jen admini" }[auth.passwordScope];
  const loginTile: SystemTile = !auth.microsoftConfigured
    ? { id: "login", title: "Přihlášení Microsoft 365", href: "/admin/registration", tone: "off", status: "Nenastaveno", hint: "přihlášení heslem" }
    : !auth.microsoftEnabled
      ? { id: "login", title: "Přihlášení Microsoft 365", href: "/admin/registration", tone: "off", status: "Vypnuto", hint: "přihlášení heslem" }
      : { id: "login", title: "Přihlášení Microsoft 365", href: "/admin/registration", tone: "ok", status: "Funguje", hint: passwordHint };

  const historyTile: SystemTile = {
    id: "history",
    title: "Historie změn",
    href: "/admin/history",
    tone: "ok",
    status: lastChange ? `poslední změna ${ago(lastChange.createdAt)}` : "zatím bez změn",
    hint: `historie se drží ${retention} ${plural(retention, "rok", "roky", "let")}`,
  };

  const optional = MODULES.filter((m) => !("core" in m && m.core));
  const on = optional.filter((m) => enabled.includes(m.id));
  const modulesTile: SystemTile = {
    id: "modules",
    title: "Moduly",
    href: "/admin/modules",
    tone: "ok",
    status: on.length === optional.length ? "Všechny zapnuté" : `Zapnuto ${on.length} z ${optional.length}`,
    hint: on.length > 0 ? on.map((m) => m.name).join(", ") : "žádný volitelný modul není zapnutý",
  };

  return [emailTile, loginTile, historyTile, modulesTile];
}

/** „Školní rok 2026/27 · 412 studentů · 38 učitelů“ */
export async function getAdminSubtitle(): Promise<string> {
  const [year, students, teachers] = await Promise.all([
    getCurrentSchoolYear(),
    prisma.user.count({ where: { role: "STUDENT", isActive: true, studyStatus: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TEACHER", isActive: true } }),
  ]);
  return `Školní rok ${schoolYearLabel(year.startYear)} · ${students} ${plural(students, "student", "studenti", "studentů")} · ${teachers} ${plural(teachers, "učitel", "učitelé", "učitelů")}`;
}
