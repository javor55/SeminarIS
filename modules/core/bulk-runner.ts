import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { classLabel } from "@/lib/school";
import type { User } from "@/lib/types";
import type { BulkActionParam, BulkPreview, BulkUserAction, BulkUserInfo } from "@/modules/server-types";
import { collectBulkUserActions } from "@/modules/core/extensions";
import { BULK_MAX, type BulkActionDescriptor, type BulkPreviewResult, type BulkRunOutcome, type BulkSelection } from "@/modules/core/bulk-runner-types";
import { parseUserFilter, serializeUserListQuery } from "@/modules/core/users-filter";
import { userFilterWhere } from "@/modules/core/users-query";

// Společný běh hromadných akcí nad uživateli (F3): výběr (id nebo filtr vyhodnocený na serveru),
// náhled dopadu, potvrzení počtů, jedna transakce a jeden souhrnný záznam v historii.
// Oprávnění a režim „zobrazit jako“ hlídá volající server action (`actions/user-bulk.ts`).

export type ResolvedAction = BulkUserAction & { moduleId: string };

/** Akce, které smí uživatel spustit (jádro i zapnuté moduly). */
export async function getBulkActions(actor: User): Promise<ResolvedAction[]> {
  return collectBulkUserActions(actor);
}

/** Popis akcí pro klienta (funkce se přes hranici server/klient nepřenášejí). */
export async function describeBulkActions(actor: User): Promise<BulkActionDescriptor[]> {
  const actions = await getBulkActions(actor);
  return Promise.all(
    actions.map(async (a) => ({ id: a.id, label: a.label, confirm: a.confirm, danger: !!a.danger, params: a.params ? await a.params(actor) : [] }))
  );
}

/** Zkontroluje tvar výběru z klienta (nic mu nevěříme) a vyhodnotí ho na serveru na id uživatelů. */
export async function resolveSelection(raw: BulkSelection, db: TxClient = prisma): Promise<string[]> {
  if (raw?.mode === "ids") {
    const ids = [...new Set((raw.ids ?? []).filter((x) => typeof x === "string" && x.length > 0 && x.length < 64))];
    if (ids.length === 0) throw new Error("Nikdo není vybrán.");
    if (ids.length > BULK_MAX) throw new Error(`Výběr je příliš velký (nejvýš ${BULK_MAX} uživatelů). Zúžte ho filtrem.`);
    const found = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return found.map((u) => u.id);
  }
  if (raw?.mode === "filter") {
    // filtr se znovu přečte z parametrů adresy, takže neplatné hodnoty zmizí
    const filter = parseUserFilter(serializeUserListQuery(raw.filter ?? {}));
    const excluded = new Set((raw.excluded ?? []).filter((x) => typeof x === "string"));
    const found = await db.user.findMany({ where: userFilterWhere(filter), select: { id: true }, orderBy: { id: "asc" }, take: BULK_MAX + 1 });
    if (found.length > BULK_MAX) throw new Error(`Filtru odpovídá víc než ${BULK_MAX} uživatelů. Zúžte ho (třída, role …).`);
    const ids = found.map((u) => u.id).filter((id) => !excluded.has(id));
    if (ids.length === 0) throw new Error("Nikdo není vybrán.");
    return ids;
  }
  throw new Error("Neplatný výběr.");
}

export async function loadBulkUsers(ids: string[], db: TxClient = prisma): Promise<BulkUserInfo[]> {
  const users = await db.user.findMany({ where: { id: { in: ids } }, include: { classGroup: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  return users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    classGroupId: u.classGroupId,
    classLabel: u.classGroup ? classLabel(u.classGroup) : null,
    studyStatus: u.studyStatus,
  }));
}

function findAction(actions: ResolvedAction[], id: string): ResolvedAction {
  const action = actions.find((a) => a.id === id);
  if (!action) throw new Error("Tuto hromadnou akci nemáte k dispozici.");
  return action;
}

function cleanParams(raw: Record<string, string> | undefined, defs: BulkActionParam[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const d of defs) {
    let v = typeof raw?.[d.key] === "string" ? raw[d.key] : "";
    if (d.maxLength) v = v.slice(0, d.maxLength);
    if (d.type === "select" && v && d.options && !d.options.some((o) => o.value === v)) throw new Error(`Neplatná hodnota pole „${d.label}“.`);
    params[d.key] = v;
  }
  return params;
}

async function planFor(action: BulkUserAction, users: BulkUserInfo[], actor: User, params: Record<string, string>): Promise<BulkPreview> {
  if (action.preview) return action.preview(users, actor, params);
  return { eligibleIds: users.map((u) => u.id), lines: [], skipped: [] };
}

export async function previewBulkAction(actor: User, actionId: string, selection: BulkSelection, rawParams: Record<string, string> | undefined): Promise<BulkPreviewResult> {
  const action = findAction(await getBulkActions(actor), actionId);
  const defs = action.params ? await action.params(actor) : [];
  const params = cleanParams(rawParams, defs);
  const ids = await resolveSelection(selection);
  const users = await loadBulkUsers(ids);
  const plan = await planFor(action, users, actor, params);
  const eligible = new Set(plan.eligibleIds);
  return {
    selected: users.length,
    eligible: eligible.size,
    lines: plan.lines,
    skipped: plan.skipped,
    blocked: plan.blocked ?? (eligible.size === 0 ? "Akce se nikoho netýká." : undefined),
    sample: users.filter((u) => eligible.has(u.id)).slice(0, 5).map((u) => `${u.lastName} ${u.firstName}`.trim()),
  };
}

/**
 * Provede akci. `expected` jsou počty, které uživatel viděl v náhledu; pokud se mezitím změnily
 * (někdo upravil uživatele, přibyli noví), akce se neprovede a uživatel si musí náhled zkontrolovat znovu.
 */
export async function runBulkAction(
  actor: User,
  actionId: string,
  selection: BulkSelection,
  rawParams: Record<string, string> | undefined,
  expected: { selected: number; eligible: number }
): Promise<BulkRunOutcome> {
  const action = findAction(await getBulkActions(actor), actionId);
  const defs = action.params ? await action.params(actor) : [];
  const params = cleanParams(rawParams, defs);
  for (const d of defs) if (d.required && !params[d.key]?.trim()) throw new Error(`Vyplňte pole „${d.label}“.`);

  const stale = () => new Error("Výběr se od náhledu změnil. Zkontrolujte náhled a potvrďte znovu.");
  const fullId = action.id;
  // „core.class“ → „users.bulk.class“, „seminars.audience“ → „users.bulk.seminars.audience“
  const auditAction = `users.bulk.${fullId.replace(/^core\./, "")}`;

  const execute = async (db: TxClient) => {
    const ids = await resolveSelection(selection, db);
    const users = await loadBulkUsers(ids, db);
    const plan = await planFor(action, users, actor, params);
    if (plan.blocked) throw new Error(plan.blocked);
    if (users.length !== expected.selected || plan.eligibleIds.length !== expected.eligible) throw stale();
    if (plan.eligibleIds.length === 0) throw new Error("Akce se nikoho netýká.");
    const result = await action.run(db, plan.eligibleIds, actor, params);
    const skipped = users.length - plan.eligibleIds.length;
    await audit(db, actor, {
      action: auditAction,
      entityType: "user",
      summary: result.summary + (skipped ? ` (přeskočeno ${skipped})` : ""),
      data: {
        action: fullId,
        userIds: plan.eligibleIds,
        selected: users.length,
        skipped,
        selection: selection.mode === "filter" ? { mode: "filter", filter: JSON.parse(JSON.stringify(parseUserFilter(serializeUserListQuery(selection.filter ?? {})))), excluded: selection.excluded?.length ?? 0 } : { mode: "ids" },
        // hesla, text e-mailu apod. do historie nepatří; parametry akce jsou jen výběry a krátké texty
        params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== "body" && k !== "confirmWord")),
        ...(result.data ?? {}),
      } as Prisma.InputJsonValue,
    });
    return { result, skipped };
  };

  const done =
    action.transactional === false
      ? await execute(prisma)
      : // velké výběry (stovky uživatelů) nestihnou výchozí 5 s
        await prisma.$transaction((tx) => execute(tx), { timeout: 120_000, maxWait: 10_000 });
  await done.result.afterCommit?.();
  return { affected: done.result.affected, summary: done.result.summary, skipped: done.skipped };
}
