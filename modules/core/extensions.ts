/* eslint-disable no-unused-vars -- názvy parametrů v typech funkcí */
import type { User } from "@/lib/types";
import { getEnabledModuleIds } from "@/lib/modules";
import { MODULE_SERVERS } from "@/modules/server-registry";
import type { ModuleId } from "@/modules/registry";
import type { AdminTodo, SubjectBadge, SubjectUsageItem } from "@/modules/types";
import type { BulkUserAction, ModuleServer, ModuleTab } from "@/modules/server-types";
import { can, type Permission } from "@/modules/registry";

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

/** Použití předmětu ve všech zapnutých modulech (jen položky s nenulovým počtem). */
export async function collectSubjectUsage(subjectId: string): Promise<SubjectUsageItem[]> {
  const parts = await collect((s) => s.getSubjectUsage?.(subjectId));
  return parts.flatMap((p) => p.value.map((u) => ({ ...u, id: `${p.id}.${u.id}` }))).filter((u) => u.count > 0);
}

/** Záložky detailu uživatele ze zapnutých modulů, seřazené. */
export async function collectUserTabs(userId: string, viewer: User): Promise<ModuleTab[]> {
  const parts = await collect((s) => s.getUserTabs?.(userId, viewer));
  return parts.flatMap((p) => prefixTabs(p.id, p.value)).sort(byOrder);
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

/** Položky přehledu „co udělat“ ze zapnutých modulů (jen s nenulovým počtem), nejzávažnější první. */
export async function collectAdminTodos(user: User): Promise<AdminTodo[]> {
  const parts = await collect((s) => s.getAdminTodos?.(user));
  return parts
    .flatMap((p) => p.value.map((t) => ({ ...t, id: `${p.id}.${t.id}` })))
    .filter((t) => t.count > 0)
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
