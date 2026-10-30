// Kontraktový test modulů: rychlá statická kontrola manifestů a registrů bez databáze a bez buildu.
// Spuštění: npm run test:contract (běží v CI v jobu „checks“).
// Importuje manifesty přímo (jsou to čistá data), seznam modulů čte z modules/registry.ts.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");
const ROLES = ["STUDENT", "TEACHER", "ADMIN", "GUEST"];

type Manifest = {
  id: string;
  core?: boolean;
  permissions: Record<string, string[]>;
  nav: { label: string; href: string; permission: string; order: number }[];
  routes: { prefix: string; permission: string }[];
  adminSections?: { label: string; href: string; permission: string; order: number }[];
  settings?: { key: string; type: string; default: unknown; label: string; options?: { value: string }[] }[];
};

// Moduly podle registrů (pořadí = pořadí v registru)
const registry = read("modules", "registry.ts");
const serverRegistry = read("modules", "server-registry.ts");
const manifestDirs = [...registry.matchAll(/from "@\/modules\/(\w+)\/manifest"/g)].map((m) => m[1]);
const serverDirs = [...serverRegistry.matchAll(/from "@\/modules\/(\w+)\/server"/g)].map((m) => m[1]);

if (manifestDirs.length === 0) fail("modules/registry.ts neobsahuje žádný modul.");
if (JSON.stringify(manifestDirs) !== JSON.stringify(serverDirs)) {
  fail(`registry.ts (${manifestDirs.join(", ")}) a server-registry.ts (${serverDirs.join(", ")}) mají různé moduly nebo pořadí.`);
}
for (const id of manifestDirs) {
  if (!new RegExp(`id: "${id}"`).test(serverRegistry)) fail(`server-registry.ts nemá záznam { id: "${id}" }.`);
}

const manifests: Manifest[] = [];
for (const dir of manifestDirs) {
  const mod = await import(pathToFileURL(path.join(root, "modules", dir, "manifest.ts")).href);
  const manifest = Object.values(mod).find((v): v is Manifest => typeof v === "object" && v !== null && "permissions" in v);
  if (!manifest) {
    fail(`modules/${dir}/manifest.ts nic nevyexportoval.`);
    continue;
  }
  if (manifest.id !== dir) fail(`modules/${dir}: id manifestu je „${manifest.id}“, má být „${dir}“.`);
  manifests.push(manifest);
}

// unikátní id, přesně jedno jádro
const ids = manifests.map((m) => m.id);
if (new Set(ids).size !== ids.length) fail(`Id modulů nejsou unikátní: ${ids.join(", ")}.`);
const cores = manifests.filter((m) => m.core);
if (cores.length !== 1 || cores[0].id !== "core") fail("Právě jeden modul (id „core“) musí být označen jako jádro.");

const allPermissions = new Map<string, string>();
const covered = (m: Manifest, href: string) => m.routes.some((r) => href === r.prefix || href.startsWith(r.prefix + "/"));
// stránky jádra, které chrání jen přihlášení, ne oprávnění cesty
const CORE_OPEN_HREFS = ["/", "/dashboard", "/profile"];

for (const m of manifests) {
  const where = `modul ${m.id}`;
  if (!/^[a-z][a-z0-9]*$/.test(m.id)) fail(`${where}: id musí být malá písmena a číslice.`);

  // oprávnění: prefix modulu, platné role, unikátní napříč moduly
  for (const [perm, roles] of Object.entries(m.permissions)) {
    if (!perm.startsWith(`${m.id}.`)) fail(`${where}: oprávnění „${perm}“ nemá prefix „${m.id}.“.`);
    if (allPermissions.has(perm)) fail(`${where}: oprávnění „${perm}“ už má modul ${allPermissions.get(perm)}.`);
    allPermissions.set(perm, m.id);
    for (const r of roles) if (!ROLES.includes(r)) fail(`${where}: oprávnění „${perm}“ má neznámou roli „${r}“.`);
  }

  // cesty chráněné oprávněním vlastního modulu
  if (m.routes.length === 0 && !m.core) fail(`${where}: modul nemá žádná pravidla cest (routes).`);
  for (const r of m.routes) {
    if (!r.prefix.startsWith("/")) fail(`${where}: prefix cesty „${r.prefix}“ musí začínat „/“.`);
    if (!(r.permission in m.permissions)) fail(`${where}: cesta „${r.prefix}“ vyžaduje cizí/neexistující oprávnění „${r.permission}“.`);
  }

  // menu: oprávnění modulu, odkaz pod chráněnou cestou
  for (const n of m.nav) {
    if (!(n.permission in m.permissions)) fail(`${where}: menu „${n.label}“ používá cizí/neexistující oprávnění „${n.permission}“.`);
    if (!(m.core && CORE_OPEN_HREFS.includes(n.href)) && !covered(m, n.href)) {
      fail(`${where}: menu „${n.label}“ vede na „${n.href}“, které nechrání žádné pravidlo cesty.`);
    }
  }

  for (const s of m.adminSections ?? []) {
    if (!(s.permission in m.permissions)) fail(`${where}: sekce administrace „${s.label}“ používá cizí/neexistující oprávnění „${s.permission}“.`);
    if (!s.href.startsWith("/")) fail(`${where}: sekce administrace „${s.label}“ má neplatný odkaz.`);
  }

  const keys = new Set<string>();
  for (const s of m.settings ?? []) {
    if (!s.key.startsWith(`${m.id}.`)) fail(`${where}: nastavení „${s.key}“ nemá prefix „${m.id}.“.`);
    if (keys.has(s.key)) fail(`${where}: nastavení „${s.key}“ je deklarované dvakrát.`);
    keys.add(s.key);
    if (s.type === "enum" && !s.options?.some((o) => o.value === s.default)) fail(`${where}: výchozí hodnota nastavení „${s.key}“ není mezi možnostmi.`);
  }

  // nejádrový modul: každá cesta má layout s ensureModulePage + force-dynamic (vypnutý modul = 404)
  if (!m.core) {
    const folders = new Set(m.routes.map((r) => r.prefix.split("/")[1]));
    for (const folder of folders) {
      const layoutPath = path.join("app", folder, "layout.tsx");
      if (!fs.existsSync(path.join(root, layoutPath))) {
        fail(`${where}: chybí ${layoutPath} (ensureModulePage).`);
        continue;
      }
      const layout = read(layoutPath);
      if (!layout.includes(`ensureModulePage("${m.id}")`)) fail(`${layoutPath}: chybí ensureModulePage("${m.id}").`);
      if (!/export const dynamic = "force-dynamic"/.test(layout)) fail(`${layoutPath}: chybí export const dynamic = "force-dynamic".`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Kontraktový test modulů selhal (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`Kontraktový test modulů v pořádku (${manifests.length} modulů: ${ids.join(", ")}).`);
