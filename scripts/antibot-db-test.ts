// Ověření DB části ochrany proti robotům (klíč, jednorázové řešení, limity); pouští ho E2E s DATABASE_URL: node --experimental-strip-types scripts/antibot-db-test.ts
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Moduly aplikace importují přes alias „@/“ a bez přípony; pro samostatný běh v Node je přeložíme.
const root = path.resolve(import.meta.dirname, "..");
register(
  "data:text/javascript," +
    encodeURIComponent(`
      import fs from "node:fs";
      import path from "node:path";
      import { pathToFileURL, fileURLToPath } from "node:url";
      const root = ${JSON.stringify(root)};
      const withExt = (p) => [p + ".ts", p + ".tsx", path.join(p, "index.ts")].find((c) => fs.existsSync(c));
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith("@/")) {
          const f = withExt(path.join(root, specifier.slice(2)));
          if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
        } else if (specifier.startsWith(".") && context.parentURL && !path.extname(specifier)) {
          const f = withExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
          if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
        }
        return next(specifier, context);
      }
    `),
);

const load = async (rel: string) => import(pathToFileURL(path.resolve(import.meta.dirname, "..", rel)).href);
const antibot = (await load("lib/antibot.ts")) as typeof import("../lib/antibot");
const core = (await load("lib/antibot-core.ts")) as typeof import("../lib/antibot-core");
const { prisma } = (await load("lib/prisma.ts")) as typeof import("../lib/prisma");
const { createHash } = await import("node:crypto");

// (bez strict se union podle `ok` nezužuje)
const why = (r: object) => (r as { reason?: string }).reason;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
  } else console.log(`ok: ${name}`);
}

function solve(c: import("../lib/antibot-core").Challenge): string {
  for (let n = 0; n <= c.maxnumber; n++) {
    if (createHash("sha256").update(c.salt + n).digest("hex") === c.challenge) return core.encodeSolution({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature });
  }
  throw new Error("řešení nenalezeno");
}

const run = Date.now();
try {
  const c = await antibot.createChallenge();
  const key = await prisma.systemSetting.findUnique({ where: { key: "antibot.key" } });
  check("klíč se vygeneroval a uložil do SystemSetting", !!key && /^[0-9a-f]{64}$/.test(key.value));
  const payload = solve(c);
  check("správné řešení projde", (await antibot.verifySolution(payload)).ok);
  const again = await antibot.verifySolution(payload);
  check("opakované použití se odmítne", !again.ok && why(again) === "reused", again);
  check("řešení je uložené jako pow:<hash>", (await prisma.eventRateLimit.count({ where: { key: `pow:${c.challenge}` } })) === 1);
  const bad = await antibot.verifySolution(core.encodeSolution({ ...core.decodeSolution(solve(await antibot.createChallenge()))!, number: 1 }));
  check("špatné číslo se odmítne", !bad.ok && why(bad) === "wrong", bad);
  check("v testovacím režimu projde „test“", process.env.ANTIBOT_TEST_MODE === "1" ? (await antibot.verifySolution("test")).ok : true);

  const sub = await antibot.checkSubmission({ honeypot: "x", renderToken: await antibot.createRenderToken(), solution: "test" });
  check("honeypot přes DB část", !sub.ok && why(sub) === "honeypot", sub);

  const now = new Date("2026-12-01T10:00:00Z");
  const r = [];
  for (let i = 0; i < 4; i++) r.push(await antibot.checkRateLimit(`ip:test:${run}`, 3, 3600, prisma, now));
  check("limit: první 3 projdou, čtvrtý ne", r.map((x) => x.allowed).join() === "true,true,true,false" && r[3].count === 4, r);
  check("limit: v dalším okně se počítá znovu", (await antibot.checkRateLimit(`ip:test:${run}`, 3, 3600, prisma, new Date(now.getTime() + 3600_000))).allowed);
  check("limit: jiný klíč má vlastní počítadlo", (await antibot.checkRateLimit(`ip:jiny:${run}`, 3, 3600, prisma, now)).count === 1);
  const par = await Promise.all(Array.from({ length: 10 }, () => antibot.checkRateLimit(`ip:par:${run}`, 5, 60, prisma, now)));
  check("limit: souběžné požadavky se nezapomenou", par.filter((x) => x.allowed).length === 5, par.map((x) => x.count));
} finally {
  await prisma.$disconnect();
}
if (failed) {
  console.error(`${failed} testů selhalo`);
  process.exit(1);
}
