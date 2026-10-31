import { prisma } from "@/lib/prisma";
import { classLabel, compareClasses, ROLE_LABELS, STUDY_END_REASON_LABELS, type StudyEndReasonValue } from "@/lib/school";
import { sendEventEmail } from "@/lib/email/send";
import { isValidEmail } from "@/lib/email/transport";
import { getEmailUsage, loadEmailConfig } from "@/lib/email/settings";
import type { BulkActionParam, BulkPreview, BulkUserAction, BulkUserInfo } from "@/modules/server-types";
import { approveGuest } from "@/modules/core/approve";
import { ensureCurrentSchoolYear, setStudentClass } from "@/modules/core/school";
import { notifyAccountsApproved } from "@/modules/core/notifications";

// Hromadné akce jádra nad uživateli (F3). Registrují se přes `coreServer.bulkUserActions` stejným bodem
// rozšíření, jaký mají moduly; spouští je `bulk-runner.ts`. Neověřují oprávnění (udělá runner).
// Každá akce má dvě části: `preview` (kdo je dotčen, kdo se přeskočí, co se stane) a `run`.

export const NO_CLASS = "__none";
export const DELETE_CONFIRM_WORD = "SMAZAT";

const NOUN_USERS: [string, string, string] = ["uživatel", "uživatelé", "uživatelů"];

/** České skloňování podle počtu: 1 / 2–4 / ostatní. */
export function plural(n: number, forms: [string, string, string]): string {
  return n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2];
}

const countOf = (n: number, forms: [string, string, string] = NOUN_USERS) => `${n} ${plural(n, forms)}`;

/** Rozdělí uživatele na dotčené a přeskočené podle důvodu (první pravidlo, které sedí, vyhrává). */
/* eslint-disable no-unused-vars -- názvy parametrů v typech funkcí */
function triage(users: BulkUserInfo[], rules: { reason: string; skip: (u: BulkUserInfo) => boolean }[]) {
  const eligible: BulkUserInfo[] = [];
  const skipped = new Map<string, number>();
  for (const u of users) {
    const rule = rules.find((r) => r.skip(u));
    if (rule) skipped.set(rule.reason, (skipped.get(rule.reason) ?? 0) + 1);
    else eligible.push(u);
  }
  return { eligible, skipped: [...skipped].map(([reason, count]) => ({ reason, count })) };
}

function groupCounts(users: BulkUserInfo[], key: (u: BulkUserInfo) => string): string {
  const map = new Map<string, number>();
  for (const u of users) map.set(key(u), (map.get(key(u)) ?? 0) + 1);
  return [...map].map(([k, n]) => `${k} (${n})`).join(", ");
}

const isSelf = (actor: { id: string }) => (u: BulkUserInfo) => u.id === actor.id;

async function classOptions(): Promise<{ value: string; label: string }[]> {
  const classes = await prisma.classGroup.findMany();
  return classes.sort(compareClasses).map((c) => ({ value: c.id, label: classLabel(c) }));
}

function requireParam(params: Record<string, string>, key: string, label: string): string {
  const v = params[key]?.trim();
  if (!v) throw new Error(`Vyplňte pole „${label}“.`);
  return v;
}

function preview(eligible: BulkUserInfo[], skipped: BulkPreview["skipped"], lines: string[], blocked?: string): BulkPreview {
  return { eligibleIds: eligible.map((u) => u.id), lines, skipped, ...(blocked ? { blocked } : {}) };
}

const ROLE_PARAM_OPTIONS = (["STUDENT", "TEACHER", "ADMIN", "GUEST"] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));

// === Přesun do třídy ===

const moveToClass: BulkUserAction = {
  id: "class",
  label: "Přesunout do třídy",
  permission: "core.users.manage",
  confirm: "Studenti se přesunou do vybrané třídy (v historii zařazení „přeřazen“).",
  params: async () => [
    {
      key: "classGroupId",
      label: "Cílová třída",
      type: "select",
      required: true,
      options: [{ value: NO_CLASS, label: "Bez třídy (vyřadit ze třídy)" }, ...(await classOptions())],
    },
  ],
  async preview(users, _actor, params) {
    const target = params.classGroupId;
    if (!target) return preview([], [], [], "Vyberte cílovou třídu.");
    const cls = target === NO_CLASS ? null : await prisma.classGroup.findUnique({ where: { id: target } });
    if (target !== NO_CLASS && !cls) return preview([], [], [], "Třída nenalezena.");
    const { eligible, skipped } = triage(users, [
      { reason: "nejsou studenti", skip: (u) => u.role !== "STUDENT" },
      { reason: "už jsou v cílové třídě", skip: (u) => (target === NO_CLASS ? !u.classGroupId : u.classGroupId === target) },
    ]);
    const lines = eligible.length
      ? [`${cls ? `Do třídy ${classLabel(cls)}` : "Ze třídy"} se přesune ${countOf(eligible.length, ["student", "studenti", "studentů"])}: ${groupCounts(eligible, (u) => `z ${u.classLabel ?? "bez třídy"}`)}.`]
      : [];
    return preview(eligible, skipped, lines);
  },
  async run(tx, userIds, _actor, params) {
    const target = params.classGroupId === NO_CLASS ? null : params.classGroupId;
    const schoolYear = await ensureCurrentSchoolYear();
    const before = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, classGroupId: true } });
    for (const id of userIds) await setStudentClass(tx, { userId: id, classGroupId: target, schoolYear });
    const cls = target ? await tx.classGroup.findUnique({ where: { id: target } }) : null;
    const label = cls ? classLabel(cls) : "bez třídy";
    return {
      affected: userIds.length,
      summary: `Hromadný přesun do třídy ${label}: ${countOf(userIds.length, ["student", "studenti", "studentů"])}`,
      data: { classGroupId: target, class: label, before: Object.fromEntries(before.map((b) => [b.id, b.classGroupId])) },
    };
  },
};

// === Změna role ===

const changeRole: BulkUserAction = {
  id: "role",
  label: "Změnit roli",
  permission: "core.users.manage",
  confirm: "Uživatelům se změní role (a tím i oprávnění a menu).",
  params: async () => [{ key: "role", label: "Nová role", type: "select", required: true, options: ROLE_PARAM_OPTIONS }],
  async preview(users, actor, params) {
    const role = params.role;
    if (!role || !ROLE_PARAM_OPTIONS.some((o) => o.value === role)) return preview([], [], [], "Vyberte novou roli.");
    const { eligible, skipped } = triage(users, [
      { reason: "vy sami (vlastní roli měnit nelze)", skip: isSelf(actor) },
      { reason: "už mají tuto roli", skip: (u) => u.role === role },
    ]);
    const lines = eligible.length ? [`Role se změní na „${ROLE_LABELS[role]}“: ${countOf(eligible.length)} (dosud: ${groupCounts(eligible, (u) => ROLE_LABELS[u.role] ?? u.role)}).`] : [];
    return preview(eligible, skipped, lines);
  },
  async run(tx, userIds, _actor, params) {
    const role = params.role as BulkUserInfo["role"];
    const before = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true } });
    await tx.user.updateMany({
      where: { id: { in: userIds } },
      // žádost o třídu má smysl jen u hosta čekajícího na schválení
      data: { role, ...(role !== "GUEST" ? { requestedClassGroupId: null } : {}) },
    });
    return {
      affected: userIds.length,
      summary: `Hromadná změna role na ${ROLE_LABELS[role]}: ${countOf(userIds.length)}`,
      data: { role, before: Object.fromEntries(before.map((b) => [b.id, b.role])) },
    };
  },
};

// === Aktivace / deaktivace ===

function activeAction(active: boolean): BulkUserAction {
  return {
    id: active ? "activate" : "deactivate",
    label: active ? "Aktivovat účty" : "Deaktivovat účty",
    permission: "core.users.manage",
    confirm: active ? "Účty se aktivují, uživatelé se budou moci přihlásit." : "Účty se deaktivují, uživatelé se nebudou moci přihlásit.",
    async preview(users, actor) {
      const { eligible, skipped } = triage(users, [
        ...(active ? [] : [{ reason: "vy sami (vlastní účet deaktivovat nelze)", skip: isSelf(actor) }]),
        { reason: active ? "už jsou aktivní" : "už jsou neaktivní", skip: (u: BulkUserInfo) => u.isActive === active },
      ]);
      return preview(eligible, skipped, eligible.length ? [`${active ? "Aktivuje" : "Deaktivuje"} se ${countOf(eligible.length)}.`] : []);
    },
    async run(tx, userIds) {
      await tx.user.updateMany({ where: { id: { in: userIds } }, data: { isActive: active } });
      return { affected: userIds.length, summary: `Hromadně ${active ? "aktivováno" : "deaktivováno"}: ${countOf(userIds.length)}`, data: { isActive: active } };
    },
  };
}

// === Schválení hostů ===

const approve: BulkUserAction = {
  id: "approve",
  label: "Schválit (hosté)",
  permission: "core.users.manage",
  confirm: "Hosté se stanou studenty a dostanou e-mail o schválení.",
  params: async () => [
    {
      key: "classGroupId",
      label: "Třída",
      type: "select",
      options: [{ value: "", label: "Podle žádosti uživatele (bez žádosti: bez třídy)" }, ...(await classOptions())],
    },
  ],
  async preview(users) {
    const { eligible, skipped } = triage(users, [{ reason: "nejsou hosté", skip: (u) => u.role !== "GUEST" }]);
    return preview(eligible, skipped, eligible.length ? [`Schválí se ${countOf(eligible.length, ["host", "hosté", "hostů"])} jako studenti.`] : []);
  },
  async run(tx, userIds, _actor, params) {
    const schoolYear = await ensureCurrentSchoolYear();
    const requested = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, requestedClassGroupId: true } });
    const requestedBy = new Map(requested.map((r) => [r.id, r.requestedClassGroupId]));
    for (const id of userIds) await approveGuest(tx, id, params.classGroupId || requestedBy.get(id) || null, schoolYear);
    return {
      affected: userIds.length,
      summary: `Hromadné schválení hostů jako studentů: ${userIds.length}`,
      data: { classGroupId: params.classGroupId || null },
      afterCommit: () => notifyAccountsApproved(userIds),
    };
  },
};

// === Stav studia ===

const END_STUDY_REASONS: StudyEndReasonValue[] = ["TRANSFER", "WITHDRAWAL", "EXPULSION", "GRADUATED", "OTHER"];

const endStudy: BulkUserAction = {
  id: "study.end",
  label: "Ukončit studium",
  permission: "core.users.manage",
  confirm: "Účty studentů se deaktivují. Třída, historie a zápisy zůstanou zachovány.",
  params: async () => [
    { key: "reason", label: "Důvod", type: "select", required: true, options: END_STUDY_REASONS.map((r) => ({ value: r, label: STUDY_END_REASON_LABELS[r] })) },
    { key: "note", label: "Poznámka (nepovinná)", type: "text", maxLength: 300 },
  ],
  async preview(users, _actor, params) {
    if (!END_STUDY_REASONS.includes(params.reason as StudyEndReasonValue)) return preview([], [], [], "Vyberte důvod ukončení.");
    const { eligible, skipped } = triage(users, [
      { reason: "nejsou studenti", skip: (u) => u.role !== "STUDENT" },
      { reason: "už nestudují", skip: (u) => u.studyStatus !== "ACTIVE" },
    ]);
    return preview(
      eligible,
      skipped,
      eligible.length ? [`Studium se ukončí (${STUDY_END_REASON_LABELS[params.reason as StudyEndReasonValue]}) a účet se deaktivuje: ${countOf(eligible.length, ["student", "studenti", "studentů"])}.`] : []
    );
  },
  async run(tx, userIds, _actor, params) {
    const reason = params.reason as StudyEndReasonValue;
    const note = params.note?.trim() || null;
    await tx.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        studyStatus: reason === "GRADUATED" ? "GRADUATED" : "LEFT",
        studyEndReason: reason,
        studyEndedAt: new Date(),
        studyEndNote: note,
        isActive: false,
      },
    });
    return {
      affected: userIds.length,
      summary: `Hromadné ukončení studia (${STUDY_END_REASON_LABELS[reason]}): ${countOf(userIds.length, ["student", "studenti", "studentů"])}${note ? ` – ${note}` : ""}`,
      data: { reason, note },
    };
  },
};

const restoreStudy: BulkUserAction = {
  id: "study.restore",
  label: "Obnovit studium",
  permission: "core.users.manage",
  confirm: "Studium se obnoví a účty se znovu aktivují.",
  async preview(users) {
    const { eligible, skipped } = triage(users, [
      { reason: "nejsou studenti", skip: (u) => u.role !== "STUDENT" },
      { reason: "studují", skip: (u) => u.studyStatus === "ACTIVE" },
    ]);
    return preview(eligible, skipped, eligible.length ? [`Studium se obnoví: ${countOf(eligible.length, ["student", "studenti", "studentů"])}.`] : []);
  },
  async run(tx, userIds) {
    await tx.user.updateMany({
      where: { id: { in: userIds } },
      data: { studyStatus: "ACTIVE", studyEndReason: null, studyEndedAt: null, studyEndNote: null, isActive: true },
    });
    return { affected: userIds.length, summary: `Hromadné obnovení studia: ${countOf(userIds.length, ["student", "studenti", "studentů"])}` };
  },
};

// === E-mail ===

const sendEmail: BulkUserAction = {
  id: "email",
  label: "Poslat e-mail",
  permission: "core.users.manage",
  confirm: "E-mail se pošle přes e-mailovou vrstvu aplikace (platí denní a měsíční limit, zapíše se do záznamů o e-mailech).",
  transactional: false,
  params: async (): Promise<BulkActionParam[]> => [
    { key: "subject", label: "Předmět", type: "text", required: true, maxLength: 300 },
    { key: "body", label: "Text (můžete použít {{jmeno}} – křestní jméno příjemce)", type: "textarea", required: true, maxLength: 10_000 },
  ],
  async preview(users, _actor, params) {
    const { eligible, skipped } = triage(users, [
      { reason: "mají neaktivní účet", skip: (u) => !u.isActive },
      { reason: "nemají platný e-mail", skip: (u) => !isValidEmail(u.email.trim()) },
    ]);
    const cfg = await loadEmailConfig();
    if (!cfg.settings.enabled) {
      return preview(eligible, skipped, [], "E-mailová upozornění jsou vypnutá (hlavní vypínač v sekci Upozornění), hromadný e-mail se neodešle.");
    }
    if (!cfg.status.configured) {
      return preview(eligible, skipped, [], `Odesílání e-mailů není nastavené (chybí ${cfg.status.missing.join(", ")}).`);
    }
    const usage = await getEmailUsage(cfg.settings);
    const room = Math.max(0, Math.min(usage.dailyLimit - usage.today, usage.monthlyLimit - usage.month));
    const lines: string[] = [];
    if (eligible.length) {
      const sendable = Math.min(eligible.length, room);
      lines.push(`Odhad: odešle se ${sendable} z ${eligible.length} e-mailů.`);
      lines.push(`Limity: dnes odesláno ${usage.today} z ${usage.dailyLimit}, tento měsíc ${usage.month} z ${usage.monthlyLimit}; vejde se ještě ${room}.`);
      if (eligible.length > room) lines.push(`Kvůli limitu se ${eligible.length - sendable} e-mailů neodešle (zapíše se jako „přeskočeno – limit“).`);
    }
    const blocked = eligible.length > 0 && room === 0 ? "Denní nebo měsíční limit e-mailů je vyčerpán, nic by se neodeslo." : undefined;
    if (params.subject?.trim() === "" || params.body?.trim() === "") lines.push("Vyplňte předmět i text e-mailu.");
    return preview(eligible, skipped, lines, blocked);
  },
  async run(_db, userIds, _actor, params) {
    const subject = requireParam(params, "subject", "Předmět");
    const body = requireParam(params, "body", "Text");
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, firstName: true } });
    const res = await sendEventEmail(
      "manual.bulk",
      users.map((u) => ({ email: u.email, userId: u.id, vars: { jmeno: u.firstName } })),
      { content: { subject, body } }
    );
    const parts = [`odesláno ${res.sent} z ${users.length}`];
    if (res.skippedDisabled) parts.push(`přeskočeno ${res.skippedDisabled} (vypnuté e-maily nebo odhlášení příjemce)`);
    if (res.skippedLimit) parts.push(`přeskočeno kvůli limitu ${res.skippedLimit}`);
    if (res.failed) parts.push(`selhalo ${res.failed}${res.firstError ? ` (${res.firstError})` : ""}`);
    return {
      affected: res.sent,
      summary: `Hromadný e-mail „${subject.slice(0, 80)}“: ${parts.join(", ")}`,
      data: { subject, sent: res.sent, failed: res.failed, skippedLimit: res.skippedLimit },
    };
  },
};

// === Trvalé smazání ===

const deleteUsers: BulkUserAction = {
  id: "delete",
  label: "Trvale smazat",
  permission: "core.users.manage",
  danger: true,
  confirm: "Uživatelé se trvale a nevratně smažou včetně zápisů a dalších dat v modulech. Data, která vytvořili (předměty, zápisová okna), zůstanou.",
  params: async () => [{ key: "confirmWord", label: `Pro potvrzení opište ${DELETE_CONFIRM_WORD}`, type: "text", required: true, placeholder: DELETE_CONFIRM_WORD }],
  async preview(users, actor) {
    const { eligible, skipped } = triage(users, [{ reason: "vy sami (vlastní účet smazat nelze)", skip: isSelf(actor) }]);
    const lines = eligible.length ? [`Trvale se smaže ${countOf(eligible.length)} (${groupCounts(eligible, (u) => ROLE_LABELS[u.role] ?? u.role)}).`] : [];
    return preview(eligible, skipped, lines);
  },
  async run(tx, userIds, actor, params) {
    if (params.confirmWord?.trim() !== DELETE_CONFIRM_WORD) throw new Error(`Pro smazání opište ${DELETE_CONFIRM_WORD}.`);
    const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true, role: true } });
    // Až tady (ne na úrovni modulu), aby nevznikla závislost registru modulů na jádru
    const { MODULE_SERVERS } = await import("@/modules/server-registry");
    for (const u of users) {
      // Úklid běží i pro vypnuté moduly, jinak by jejich data blokovala smazání
      for (const { server } of MODULE_SERVERS) await server.onUserDelete?.(tx, u.id, actor.id);
      await tx.user.delete({ where: { id: u.id } });
    }
    return {
      affected: users.length,
      summary: `Hromadně trvale smazáno: ${countOf(users.length)}`,
      // uživatelé po smazání neexistují, proto se do historie zapíše, kdo to byl
      data: { users: users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role })) },
    };
  },
};

export const CORE_BULK_ACTIONS: readonly BulkUserAction[] = [
  moveToClass,
  changeRole,
  activeAction(true),
  activeAction(false),
  approve,
  endStudy,
  restoreStudy,
  sendEmail,
  deleteUsers,
];
