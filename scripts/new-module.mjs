#!/usr/bin/env node
// Vytvoří kostru nového modulu a zaregistruje ji. Použití:
//   npm run new-module <id> "<Název>"
// např. npm run new-module attendance "Docházka". `id` jsou malá písmena a číslice (začíná písmenem),
// je zároveň prefixem oprávnění (`<id>.view`) a cestou stránky (`/<id>`).
// Bez závislostí, jen Node. Postup dál: Dokumentace/architektura-moduly.md, „Jak přidat modul“.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [id, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();

function fail(msg) {
  console.error(`Chyba: ${msg}\nPoužití: npm run new-module <id> "<Název>"`);
  process.exit(1);
}

if (!id || !name) fail("zadejte id a název modulu.");
if (!/^[a-z][a-z0-9]*$/.test(id)) fail("id smí obsahovat jen malá písmena a číslice a musí začínat písmenem (např. attendance).");
if (["core", "api", "admin", "users", "subjects", "profile", "dashboard", "login", "register"].includes(id)) fail(`id „${id}“ je vyhrazené.`);

const file = (...p) => path.join(root, ...p);
const moduleVar = `${id}Module`;
const serverVar = `${id}Server`;

for (const dir of [file("modules", id), file("app", id)]) {
  if (fs.existsSync(dir)) fail(`${path.relative(root, dir)} už existuje.`);
}
const registry = fs.readFileSync(file("modules", "registry.ts"), "utf8");
const serverRegistry = fs.readFileSync(file("modules", "server-registry.ts"), "utf8");
if (registry.includes(`@/modules/${id}/`) || serverRegistry.includes(`@/modules/${id}/`)) fail(`modul ${id} už je v registrech.`);

// Číslo E2E souboru: další volné
const e2eDir = file("e2e");
const nums = fs.readdirSync(e2eDir).map((f) => /^(\d+)-/.exec(f)?.[1]).filter(Boolean).map(Number);
const e2eNo = String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0");

const write = (p, content) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log(`  vytvořeno ${path.relative(root, p)}`);
};
const q = JSON.stringify;

write(
  file("modules", id, "manifest.ts"),
  `import type { ModuleManifest } from "@/modules/types";

export const ${moduleVar} = {
  id: ${q(id)},
  name: ${q(name)},
  description: ${q(`${name} – doplňte popis modulu.`)},
  enabledByDefault: true,
  permissions: {
    // Oprávnění modulu MUSÍ mít prefix \`${id}.\`
    "${id}.view": ["STUDENT", "TEACHER", "ADMIN"],
  },
  nav: [{ label: ${q(name)}, href: "/${id}", permission: "${id}.view", order: 50 }],
  // Cesty modulu chrání middleware podle těchto pravidel
  routes: [{ prefix: "/${id}", permission: "${id}.view" }],
  // Volitelně: adminSections (menu administrace) a settings (deklarace nastavení)
} as const satisfies ModuleManifest;
`
);

write(
  file("modules", id, "server.tsx"),
  `import type { ModuleServer } from "@/modules/server-types";

// Serverová část modulu: vše je volitelné. Body rozšíření jádra (getDashboardWidget, getSubjectTabs,
// getSubjectBadges, getSubjectUsage, getUserTabs, getAdminTodos, bulkUserActions, getAdminStats,
// onUserDelete, runDailyJob, getEmailEstimates) jsou popsané v modules/server-types.ts.
export const ${serverVar}: ModuleServer = {};
`
);

write(
  file("app", id, "layout.tsx"),
  `import type { ReactNode } from "react";
import { ensureModulePage } from "@/lib/modules";

// Zapnutí modulu se čte z DB při každém požadavku – stránky se nesmí předgenerovat při buildu
export const dynamic = "force-dynamic";

export default async function ${id[0].toUpperCase()}${id.slice(1)}Layout({ children }: { children: ReactNode }) {
  await ensureModulePage(${q(id)});
  return children;
}
`
);

write(
  file("app", id, "page.tsx"),
  `import { PageHeader } from "@/components/page-header";

export default function ${id[0].toUpperCase()}${id.slice(1)}Page() {
  return (
    <div className="space-y-4">
      <PageHeader title={${q(name)}} description="Tady bude obsah modulu." />
    </div>
  );
}
`
);

write(
  file("e2e", `${e2eNo}-${id}.spec.ts`),
  `import { test, expect } from "@playwright/test";
import { resetDb, login, navLabels } from "./helpers";

// Kostra E2E testu modulu ${name}: rozšiřte o scénáře modulu.
test("${id}: modul je v menu a stránka se načte", async ({ browser }) => {
  resetDb();
  const page = await login(browser, "admin@skola.cz");
  expect(await navLabels(page)).toContain(${q(name)});
  await page.goto("/${id}");
  await expect(page.getByRole("heading", { name: ${q(name)} })).toBeVisible();
});
`
);

// Registrace v registrech
function patch(p, edit) {
  const before = fs.readFileSync(p, "utf8");
  const after = edit(before);
  if (after === before) fail(`nepodařilo se upravit ${path.relative(root, p)} – zaregistrujte modul ručně.`);
  fs.writeFileSync(p, after);
  console.log(`  upraveno ${path.relative(root, p)}`);
}

patch(file("modules", "registry.ts"), (s) =>
  s
    .replace(/(import \{ \w+ \} from "@\/modules\/\w+\/manifest";\n)(?!import \{ \w+ \} from "@\/modules\/\w+\/manifest";)/, `$1import { ${moduleVar} } from "@/modules/${id}/manifest";\n`)
    .replace(/(export const MODULES = \[[^\]]*?)(\] as const;)/, `$1, ${moduleVar}$2`)
);
patch(file("modules", "server-registry.ts"), (s) =>
  s
    .replace(/(import \{ \w+ \} from "@\/modules\/\w+\/server";\n)(?!import \{ \w+ \} from "@\/modules\/\w+\/server";)/, `$1import { ${serverVar} } from "@/modules/${id}/server";\n`)
    .replace(/(\n\];)/, `\n  { id: ${q(id)}, server: ${serverVar} },$1`)
);

console.log(`\nModul „${name}“ (${id}) je vytvořen. Dál:
  1. doplňte oprávnění, menu a stránky v modules/${id}/manifest.ts a app/${id}/
  2. nasaďte případnou migraci (prisma/schema.prisma) a napište E2E test
  3. npm run typecheck && npm run lint && npm run test:contract && npm run build
  4. aktualizujte Dokumentace/architektura-moduly.md`);
