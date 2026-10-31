 
import type { User } from "@/lib/types";
import { getEnabledModuleIds } from "@/lib/modules";
import { MODULE_SERVERS } from "@/modules/server-registry";
import type { ModuleId } from "@/modules/registry";
import { getHiddenTodoIds } from "@/modules/core/admin-todo-hidden";
import type { AdminSection, AdminTodo, SubjectBadge, SubjectUsageItem } from "@/modules/types";
import type { AdminStat, BulkUserAction, DashboardCard, ModuleServer, ModuleTab, MySubjectsSection } from "@/modules/server-types";
import { MODULES, can, type Permission } from "@/modules/registry";

// Sběr bodů rozšíření (viz ModuleServer) ze zapnutých modulů. Jádro nesmí importovat moduly
// přímo – vše, co moduly do jádra přispívají, jde přes tyto funkce.

type Provider = { id: ModuleId; server: ModuleServer };

async function enabledServers(): Promise<Provider[]> {
  const enabled = await getEnabledModuleIds();
  return MODULE_SERVERS.filter(({ id }) => enabled.includes(id));
}

/** Zavolá `pick` u každého zapnutého modulu, který bod nabízí; chyba modulu se zaloguje a vynechá. */
async function collect<T>(pick: (server: ModuleServer) => Promise<T> | undefined): Promise<{ id: ModuleId; value: Awaited<T> }[]> {
  const servers = await enabledServers();
  const results = await Promise.all(
    servers.map(async ({ id, server }) => {
      try {
        const value = await pick(server);
        return value === undefined ? null : { id, value };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Bod rozšíření modulu ${id} selhal:`, e);
        return null;
      }
    })
  );
  return results.filter((r): r is { id: ModuleId; value: Awaited<T> } => r !== null);
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

function prefixTabs(id: string, tabs: ModuleTab[]): ModuleTab[] {
  return tabs.map((t) => ({ ...t, id: `${id}.${t.id}` }));
}

/** Záložky detailu předmětu ze zapnutých modulů, seřazené. */
export async function collectSubjectTabs(subjectId: string, user: User): Promise<ModuleTab[]> {
  const parts = await collect((s) => s.getSubjectTabs?.(subjectId, user));
  return parts.flatMap((p) => prefixTabs(p.id, p.value)).sort(byOrder);
}

/** Štítky předmětů (podle id předmětu) ze zapnutých modulů. Předmět bez štítků v mapě není. */
export async function collectSubjectBadges(subjectIds: string[], user: User): Promise<Map<string, SubjectBadge[]>> {
  const parts = await collect((s) => s.getSubjectBadges?.(subjectIds, user));
  const result = new Map<string, SubjectBadge[]>();
  for (const { id: moduleId, value } of parts) {
    for (const [subjectId, badges] of value) {
      const list = result.get(subjectId) ?? [];
      list.push(...badges.map((b) => ({ ...b, id: `${moduleId}.${b.id}` })));
      result.set(subjectId, list);
    }
  }
  return result;
}

/**
 * Použití předmětu v modulech (jen položky s nenulovým počtem). Počítá i vypnuté moduly (jejich data
 * po vypnutí zůstávají a smazání předmětu by je zničilo); u nich se k popisku přidá „(modul je vypnutý)“.
 */
export async function collectSubjectUsage(subjectId: string): Promise<SubjectUsageItem[]> {
  const enabled = await getEnabledModuleIds();
  const parts = await Promise.all(
    MODULE_SERVERS.map(async ({ id, server }) => {
      try {
        const items = (await server.getSubjectUsage?.(subjectId)) ?? [];
        const suffix = enabled.includes(id) ? "" : " (modul je vypnutý)";
        return items.map((u) => ({ ...u, id: `${id}.${u.id}`, label: u.label + suffix }));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Bod rozšíření modulu ${id} selhal:`, e);
        return [];
      }
    })
  );
  return parts.flat().filter((u) => u.count > 0);
}

/** Sekce stránky „Moje předměty“ ze zapnutých modulů, seřazené. */
export async function collectMySubjectsSections(user: User): Promise<MySubjectsSection[]> {
  const parts = await collect((s) => s.getMySubjectsSections?.(user));
  return parts.flatMap((p) => p.value.map((x) => ({ ...x, id: `${p.id}.${x.id}` }))).sort(byOrder);
}

/** Karty dashboardu ze zapnutých modulů (id prefixované id modulu), seřazené. Chyba modulu jeho karty vynechá. */
export async function collectDashboardCards(user: User): Promise<DashboardCard[]> {
  const parts = await collect((s) => s.getDashboardCards?.(user));
  return parts.flatMap((p) => p.value.map((c) => ({ ...c, id: `${p.id}.${c.id}` }))).sort(byOrder);
}

/** Záložky detailu uživatele ze zapnutých modulů, seřazené. */
export async function collectUserTabs(userId: string, viewer: User): Promise<ModuleTab[]> {
  const parts = await collect((s) => s.getUserTabs?.(userId, viewer));
  return parts.flatMap((p) => prefixTabs(p.id, p.value)).sort(byOrder);
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

/**
 * Položky přehledu „co udělat“ ze zapnutých modulů (jen s nenulovým počtem), nejzávažnější první.
 * Uživatel dostane jen položky, na jejichž `permission` má právo (bez ní jen admin).
 */
export async function collectAdminTodos(user: User, opts: { includeHidden?: boolean } = {}): Promise<(AdminTodo & { hidden: boolean })[]> {
  const [parts, hiddenIds] = await Promise.all([collect((s) => s.getAdminTodos?.(user)), getHiddenTodoIds()]);
  const hiddenSet = new Set(hiddenIds);
  return parts
    .flatMap((p) => p.value.map((t) => ({ ...t, id: `${p.id}.${t.id}` })))
    .filter((t) => t.count > 0 && can(user.role, (t.permission ?? "core.admin") as Permission))
    // skrýt jde jen informace; skryté se vracejí jen na požádání (přehled administrace je umí zobrazit znovu)
    .map((t) => ({ ...t, hidden: t.severity === "info" && hiddenSet.has(t.id) }))
    .filter((t) => opts.includeHidden || !t.hidden)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Hromadné akce nad uživateli ze zapnutých modulů, které smí uživatel spustit. */
export async function collectBulkUserActions(user: User): Promise<(BulkUserAction & { moduleId: ModuleId })[]> {
  const servers = await enabledServers();
  return servers.flatMap(({ id, server }) =>
    (server.bulkUserActions ?? [])
      .filter((a) => can(user.role, a.permission as Permission))
      .map((a) => ({ ...a, id: `${id}.${a.id}`, moduleId: id }))
  );
}

/** Sekce bočního menu administrace ze zapnutých modulů (jádro i moduly), které smí uživatel otevřít. */
export async function collectAdminSections(user: User): Promise<AdminSection[]> {
  const enabled = await getEnabledModuleIds();
  return MODULES.filter((m) => enabled.includes(m.id))
    .flatMap((m) => ((m as { adminSections?: readonly AdminSection[] }).adminSections ?? []) as readonly AdminSection[])
    .filter((s) => can(user.role, s.permission as Permission))
    .sort(byOrder);
}

/** Krátké statistiky pro přehled administrace ze zapnutých modulů. */
export async function collectAdminStats(): Promise<AdminStat[]> {
  const parts = await collect((s) => s.getAdminStats?.());
  return parts.flatMap((p) => p.value);
}
