// Unit test ochrany proti robotům (bez databáze): node --experimental-strip-types scripts/antibot-test.ts
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
const core = (await load("lib/antibot-core.ts")) as typeof import("../lib/antibot-core");
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

const key = core.generateKey();
const now = new Date("2026-12-01T10:00:00Z");
const used = new Set<string>();
// „Databáze“ pro jednorázové použití: první zápis projde, další ne
const consume = async (challenge: string) => (used.has(challenge) ? false : (used.add(challenge), true));
const opts = (over: object = {}) => ({ key, consume, now, ...over });

/** Řešení stejně jako prohlížeč: hledá číslo, jehož sha256(salt + číslo) je výzva */
function solve(c: import("../lib/antibot-core").Challenge, overrideNumber?: number): string {
  let number = overrideNumber ?? -1;
  if (overrideNumber === undefined) {
    for (let n = 0; n <= c.maxnumber; n++) {
      if (createHash("sha256").update(c.salt + n).digest("hex") === c.challenge) {
        number = n;
        break;
      }
    }
  }
  return core.encodeSolution({ algorithm: c.algorithm, challenge: c.challenge, number, salt: c.salt, signature: c.signature });
}

const c1 = core.createChallengeWith(key, now, 4321);
check("výzva má tvar ALTCHA", c1.algorithm === "SHA-256" && c1.maxnumber === 100_000 && /^[0-9a-f]{64}$/.test(c1.challenge) && /^[0-9a-f]{64}$/.test(c1.signature) && c1.salt.includes("?expires="), c1);
check("výzva neprozrazuje číslo, challenge = sha256(salt + číslo)", c1.challenge === createHash("sha256").update(c1.salt + 4321).digest("hex"));
check("platnost výzvy 10 minut", new Date(c1.expiresAt).getTime() - now.getTime() === 600_000);
check("dvě výzvy mají různou sůl", core.createChallengeWith(key, now).salt !== core.createChallengeWith(key, now).salt);
const random = core.createChallengeWith(key, now);
check("náhodné číslo je v rozsahu (řešení se najde)", core.decodeSolution(solve(random))!.number >= 0);

check("správné řešení projde", (await core.verifySolutionWith(opts(), solve(c1))).ok);
const again = await core.verifySolutionWith(opts(), solve(c1));
check("opakované použití stejného řešení se odmítne", !again.ok && why(again) === "reused", again);

const c2 = core.createChallengeWith(key, now, 777);
const wrong = await core.verifySolutionWith(opts(), solve(c2, 778));
check("špatné řešení se odmítne", !wrong.ok && why(wrong) === "wrong", wrong);
check("špatné řešení nespotřebuje výzvu (dá se pak vyřešit správně)", (await core.verifySolutionWith(opts(), solve(c2, 777))).ok);

const c3 = core.createChallengeWith(key, now, 5);
const late = await core.verifySolutionWith(opts({ now: new Date(now.getTime() + 601_000) }), solve(c3, 5));
check("prošlá výzva se odmítne", !late.ok && why(late) === "expired", late);
const lastSecond = await core.verifySolutionWith(opts({ now: new Date(now.getTime() + 599_000) }), solve(c3, 5));
check("výzva těsně před vypršením projde", lastSecond.ok, lastSecond);

const other = core.createChallengeWith(core.generateKey(), now, 9);
const forged = await core.verifySolutionWith(opts(), solve(other, 9));
check("výzva podepsaná jiným klíčem se odmítne", !forged.ok && why(forged) === "signature", forged);
const c4 = core.createChallengeWith(key, now, 11);
const tampered = core.encodeSolution({ ...core.decodeSolution(solve(c4, 11))!, salt: c4.salt.replace(/expires=\d+/, "expires=9999999999") });
const t = await core.verifySolutionWith(opts(), tampered);
check("upravená sůl (prodloužená platnost) se odmítne", !t.ok, t);
for (const bad of ["", "nesmysl", "e30=", Buffer.from('{"challenge":1}').toString("base64"), null, undefined]) {
  const r = await core.verifySolutionWith(opts(), bad as string);
  check(`nesmyslný vstup (${JSON.stringify(bad)}) se odmítne`, !r.ok && why(r) === "malformed", r);
}

check("testovací režim přijme „test“", (await core.verifySolutionWith(opts({ testMode: true }), "test")).ok);
check("bez testovacího režimu „test“ neprojde", !(await core.verifySolutionWith(opts({ testMode: false }), "test")).ok);

// Minimální doba vyplnění
const token = core.signRenderTime(key, now);
check("odeslání do 3 s se odmítne", (core.checkRenderTime(key, token, new Date(now.getTime() + 2_900)) as { reason: string }).reason === "too_fast");
check("odeslání po 3 s projde", core.checkRenderTime(key, token, new Date(now.getTime() + 3_000)).ok);
check("podvržený čas se odmítne", (core.checkRenderTime(key, `${now.getTime() - 60_000}.${token.split(".")[1]}`, now) as { reason: string }).reason === "forged");
check("chybějící token se odmítne", (core.checkRenderTime(key, "", now) as { reason: string }).reason === "missing");

// Společná kontrola: honeypot, čas, řešení
const later = new Date(now.getTime() + 10_000);
const sub = (over: object) => core.checkSubmissionWith(opts({ now: later }), { renderToken: token, solution: solve(core.createChallengeWith(key, now, 3), 3), honeypot: "", ...over });
check("odeslání v pořádku", (await sub({})).ok);
const hp = await sub({ honeypot: "http://spam.example" });
check("vyplněný honeypot", !hp.ok && why(hp) === "honeypot", hp);
const fast = await core.checkSubmissionWith(opts({ now: new Date(now.getTime() + 1_000) }), { renderToken: token, solution: solve(core.createChallengeWith(key, now, 3), 3) });
check("příliš rychlé odeslání", !fast.ok && why(fast) === "too_fast", fast);
const noSol = await sub({ solution: null });
check("bez řešení výzvy", !noSol.ok && why(noSol) === "malformed", noSol);

if (failed) {
  console.error(`${failed} testů selhalo`);
  process.exit(1);
}
