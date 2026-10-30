/* eslint-disable no-unused-vars -- názvy parametrů v typech funkcí */
import { cache } from "react";
import { prisma, type TxClient } from "@/lib/prisma";
import { audit, type AuditEntry } from "@/lib/audit";
import { invalidateModulesCache, isModuleEnabled } from "@/lib/modules";
import { EMAIL_EVENTS } from "@/lib/email/events";
import { MODULES, can, moduleIdOfPermission, type Permission } from "@/modules/registry";
import type { User } from "@/lib/types";
import type { SettingDeclaration } from "@/modules/types";

// Jednotný registr nastavení (F2). Deklarace jsou v manifestech modulů (`settings`), jádro k nim
// přidává dvě odvozené skupiny: zapnutí modulů (`module.<id>.enabled`) a e-mailové události
// (`email.event.<id>.enabled|subject|body`). Hodnoty zůstávají v tabulce SystemSetting pod
// původními klíči a ve stejném formátu, takže se při přechodu na registr nic neztratilo.
//
// - čtení: `getSetting` / `getSettingValues` (jedním dotazem, v rámci požadavku se sdílí),
// - zápis: `saveSettings` (validace podle deklarace, kontrola oprávnění, historie změn ve stejné
//   transakci). Nic jiného do SystemSetting nastavení nezapisuje.
// Interní klíče, které nejsou nastavením (např. `cron.daily.lastRun`), se čtou přes lib/settings.ts.

export type SettingValue = string | number | boolean;

export type RegisteredSetting = SettingDeclaration & {
  // Id modulu, který nastavení deklaroval (odvozená nastavení patří jádru)
  owner: string;
};

let declarations: RegisteredSetting[] | null = null;

function buildDeclarations(): RegisteredSetting[] {
  const list: RegisteredSetting[] = [];
  for (const m of MODULES) {
    const own = (m as { settings?: readonly SettingDeclaration[] }).settings ?? [];
    for (const s of own) list.push({ ...s, owner: m.id });
  }
  // Zapnutí modulů (jádro vypnout nejde, proto bez deklarace)
  for (const m of MODULES) {
    if ("core" in m && m.core) continue;
    list.push({
      key: `module.${m.id}.enabled`,
      type: "boolean",
      default: m.enabledByDefault,
      label: `Modul „${m.name}“`,
      hidden: true,
      owner: "core",
      audit: { action: "settings.module" },
    });
  }
  // Šablony a zapnutí e-mailových událostí
  for (const def of EMAIL_EVENTS) {
    const base = { hidden: true, owner: "core", audit: { action: "settings.notifications.event" } } as const;
    list.push({ ...base, key: `email.event.${def.id}.enabled`, type: "boolean", default: def.defaultEnabled, label: `Upozornění „${def.label}“` });
    list.push({ ...base, key: `email.event.${def.id}.subject`, type: "string", default: "", label: `Předmět upozornění „${def.label}“`, maxLength: 300 });
    list.push({ ...base, key: `email.event.${def.id}.body`, type: "string", default: "", label: `Text upozornění „${def.label}“`, maxLength: 10_000 });
  }
  return list;
}

/** Všechna deklarovaná nastavení (jádro, moduly, odvozená). */
export function getSettingDeclarations(): readonly RegisteredSetting[] {
  return (declarations ??= buildDeclarations());
}

export function getSettingDeclaration(key: string): RegisteredSetting | undefined {
  return getSettingDeclarations().find((d) => d.key === key);
}

// === Převod hodnot ===

function parseStored(decl: SettingDeclaration, raw: string | undefined): SettingValue {
  if (raw === undefined) return decl.default;
  switch (decl.type) {
    case "boolean":
      return raw === "true" ? true : raw === "false" ? false : decl.default;
    case "number": {
      const n = Number(raw);
      const ok = raw.trim() !== "" && Number.isInteger(n) && (decl.min === undefined || n >= decl.min) && (decl.max === undefined || n <= decl.max);
      return ok ? n : decl.default;
    }
    case "enum":
      return decl.options?.some((o) => o.value === raw) ? raw : decl.default;
    case "string":
      return raw.trim();
  }
}

function serialize(value: SettingValue): string {
  return typeof value === "string" ? value : String(value);
}

/** Zkontroluje a normalizuje vstup podle deklarace; při chybě vyhodí Error s českým textem. */
export function validateSettingValue(decl: SettingDeclaration, input: unknown): SettingValue {
  const fail = (msg: string): never => {
    throw new Error(`${decl.label}: ${msg}`);
  };
  let value: SettingValue;
  switch (decl.type) {
    case "boolean":
      if (typeof input !== "boolean") return fail("očekává se zapnuto/vypnuto.");
      value = input;
      break;
    case "number": {
      const n = typeof input === "string" && input.trim() !== "" ? Number(input) : input;
      if (typeof n !== "number" || !Number.isInteger(n)) return fail("zadejte celé číslo.");
      if ((decl.min !== undefined && n < decl.min) || (decl.max !== undefined && n > decl.max)) {
        return fail(`zadejte celé číslo ${decl.min ?? "−∞"}–${decl.max ?? "∞"}.`);
      }
      value = n;
      break;
    }
    case "enum":
      if (typeof input !== "string" || !decl.options?.some((o) => o.value === input)) return fail("neplatná volba.");
      value = input;
      break;
    case "string": {
      if (typeof input !== "string") return fail("očekává se text.");
      const text = input.trim();
      if (decl.maxLength !== undefined && text.length > decl.maxLength) return fail(`text je příliš dlouhý (nejvýš ${decl.maxLength} znaků).`);
      value = text;
      break;
    }
  }
  const custom = decl.validate?.(value);
  if (custom) throw new Error(custom);
  return value;
}

/** Čitelný zápis hodnoty do historie změn a hlášek. */
export function formatSettingValue(decl: SettingDeclaration, value: SettingValue): string {
  if (decl.type === "boolean") return value ? "zapnuto" : "vypnuto";
  if (decl.type === "enum") return decl.options?.find((o) => o.value === value)?.label.toLowerCase() ?? String(value);
  if (value === "") return "—";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

// === Čtení ===

// Čerstvost: výsledek se v rámci jednoho požadavku sdílí (React cache). Po zápisu se zvýší
// `generation`, takže další čtení ve stejném požadavku načte nové hodnoty.
let generation = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const loadRows = cache(async (_generation: number): Promise<Map<string, string>> => {
  const rows = await prisma.systemSetting.findMany();
  return new Map(rows.map((r) => [r.key, r.value]));
});

/** Hodnoty vybraných nastavení (výchozí hodnoty doplněné); bez filtru všechna deklarovaná. */
export async function getSettingValues(filter?: (decl: RegisteredSetting) => boolean): Promise<Record<string, SettingValue>> {
  const rows = await loadRows(generation);
  const result: Record<string, SettingValue> = {};
  for (const decl of getSettingDeclarations()) {
    if (filter && !filter(decl)) continue;
    result[decl.key] = parseStored(decl, rows.get(decl.key));
  }
  return result;
}

export async function getSetting<T extends SettingValue = SettingValue>(key: string): Promise<T> {
  const decl = getSettingDeclaration(key);
  if (!decl) throw new Error(`Neznámé nastavení „${key}“.`);
  const rows = await loadRows(generation);
  return parseStored(decl, rows.get(key)) as T;
}

/** Popis nastavení pro vykreslení formuláře (klientská komponenta `SettingsForm`). */
export type SettingField = {
  key: string;
  type: SettingDeclaration["type"];
  label: string;
  description?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  value: SettingValue;
  // Smí aktuální uživatel hodnotu měnit?
  canEdit: boolean;
};

/** Pole formuláře pro nastavení vybraná `filter`em (skrytá se nikdy nevrací). */
export async function describeSettings(user: User, filter: (decl: RegisteredSetting) => boolean): Promise<SettingField[]> {
  const wanted = getSettingDeclarations().filter((d) => !d.hidden && filter(d));
  const values = await getSettingValues((d) => wanted.includes(d));
  return wanted.map((d) => ({
    key: d.key,
    type: d.type,
    label: d.label,
    description: d.description,
    options: d.options ? [...d.options] : undefined,
    min: d.min,
    max: d.max,
    maxLength: d.maxLength,
    placeholder: d.placeholder,
    value: values[d.key],
    canEdit: can(user.role, (d.permission ?? "core.admin") as Permission),
  }));
}

// === Zápis ===

export type SaveSettingsOptions = {
  // Vlastní záznam do historie místo vygenerovaného (jeden záznam za celé volání)
  audit?: Pick<AuditEntry, "action" | "entityType" | "entityId" | "summary" | "data">;
};

async function writeSettings(db: TxClient, actor: User, changes: Record<string, unknown>, opts: SaveSettingsOptions): Promise<string[]> {
  const keys = Object.keys(changes);
  if (keys.length === 0) return [];
  const rows = new Map((await db.systemSetting.findMany({ where: { key: { in: keys } } })).map((r) => [r.key, r.value]));

  type Change = { decl: RegisteredSetting; before: SettingValue; after: SettingValue };
  const changed: Change[] = [];
  for (const key of keys) {
    const decl = getSettingDeclaration(key);
    if (!decl) throw new Error("Neznámé nastavení.");
    const permission = (decl.permission ?? "core.admin") as Permission;
    if (!can(actor.role, permission) || !(await isModuleEnabled(moduleIdOfPermission(permission)))) {
      throw new Error("Unauthorized: Access denied");
    }
    const after = validateSettingValue(decl, changes[key]);
    const before = parseStored(decl, rows.get(key));
    if (before === after) continue;
    await db.systemSetting.upsert({ where: { key }, update: { value: serialize(after) }, create: { key, value: serialize(after) } });
    changed.push({ decl, before, after });
  }
  if (changed.length === 0) return [];

  if (opts.audit) {
    await audit(db, actor, opts.audit);
  } else {
    // Nastavení se stejnou skupinou (audit.group) se zapíšou jedním záznamem
    const groups = new Map<string, Change[]>();
    for (const c of changed) {
      const id = c.decl.audit?.group ? `${c.decl.audit.action}|${c.decl.audit.group}` : c.decl.key;
      groups.set(id, [...(groups.get(id) ?? []), c]);
    }
    for (const list of groups.values()) {
      const first = list[0].decl;
      const parts = list.map((c) => `${c.decl.label}: ${formatSettingValue(c.decl, c.before)} → ${formatSettingValue(c.decl, c.after)}`);
      const group = first.audit?.group;
      await audit(db, actor, {
        action: first.audit?.action ?? "settings.value",
        entityType: "setting",
        entityId: group ? first.key.split(".")[0] : first.key,
        summary: group ? `${group}: ${parts.join("; ")}` : parts.join("; "),
        data: {
          before: Object.fromEntries(list.map((c) => [c.decl.key, c.before])),
          after: Object.fromEntries(list.map((c) => [c.decl.key, c.after])),
        },
      });
    }
  }
  return changed.map((c) => c.decl.key);
}

/**
 * Jediná cesta zápisu nastavení: ověří oprávnění a hodnoty podle deklarací, uloží změněné
 * hodnoty a zapíše historii v jedné transakci. Vrací klíče, které se skutečně změnily
 * (beze změny se nezapíše nic). Volající (server action) zajistí přihlášení a `safeAction`.
 */
export async function saveSettings(actor: User, changes: Record<string, unknown>, opts: SaveSettingsOptions = {}): Promise<string[]> {
  const changed = await prisma.$transaction((tx) => writeSettings(tx, actor, changes, opts));
  if (changed.length > 0) {
    generation++;
    if (changed.some((k) => k.startsWith("module."))) invalidateModulesCache();
  }
  return changed;
}
