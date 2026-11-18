// Unit test odeslání registrace (bez databáze): node --experimental-strip-types scripts/events-registration-test.ts
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const c = (await import(pathToFileURL(path.resolve(root, "modules/events/registration-core.ts")).href)) as typeof import("../modules/events/registration-core");
let failed = 0;
const ok = (cond: boolean, name: string) => {
  console.log(`${cond ? "ok" : "FAIL"}: ${name}`);
  if (!cond) failed++;
};

const t = c.generateToken();
ok(c.TOKEN_RE.test(t) && Buffer.from(t, "base64url").length === 32, "token má 32 bajtů v base64url");
ok(c.generateToken() !== t, "tokeny jsou různé");
ok(/^[0-9a-f]{64}$/.test(c.hashToken(t)) && c.hashToken(t) !== t, "hash tokenu je SHA-256 hex");
const codes = Array.from({ length: 500 }, () => c.generateCode());
ok(codes.every((x) => c.CODE_RE.test(x)), "kód má tvar XXX-XXXX z abecedy bez záměnných znaků");
ok(!codes.some((x) => /[01OIL]/.test(x)), "kód neobsahuje 0, 1, O, I, L");
ok(c.normalizeCode("k7m 4qx2") === "K7M-4QX2" && c.normalizeCode("k7m-4qx2") === "K7M-4QX2", "zadaný kód se normalizuje");
ok(c.hashIp("1.2.3.4") !== "1.2.3.4" && c.hashIp("1.2.3.4") === c.hashIp("1.2.3.4") && c.hashIp("1.2.3.4") !== c.hashIp("1.2.3.5"), "IP se ukládá jen jako hash");
ok(c.clientIp((n) => (n === "x-forwarded-for" ? "9.9.9.9, 10.0.0.1" : null)) === "9.9.9.9", "IP z x-forwarded-for");
ok(c.consentError(true) === null && c.consentError(false) !== null && c.consentError("true") !== null && c.consentError(undefined) !== null, "souhlas je povinný");

const items = [
  { id: "a", label: null, startsAt: null, capacity: 2, cancelledAt: null },
  { id: "b", label: null, startsAt: null, capacity: null, cancelledAt: null },
  { id: "x", label: null, startsAt: null, capacity: 5, cancelledAt: new Date() },
];
ok(c.checkSelectedItems(["a"], items, 1).ok, "jeden termín projde");
ok(!c.checkSelectedItems([], items, 1).ok, "žádný termín neprojde");
ok(!c.checkSelectedItems(["a", "b"], items, 1).ok, "víc termínů než povoleno neprojde");
ok(c.checkSelectedItems(["a", "a"], items, 1).ok, "duplicitní id se sloučí");
ok(!c.checkSelectedItems(["zzz"], items, 1).ok, "neexistující termín neprojde");
ok(!c.checkSelectedItems(["x"], items, 1).ok, "zrušený termín neprojde");
ok(!c.checkSelectedItems("a", items, 1).ok, "špatný tvar neprojde");
ok(c.capacityError(["a"], items, new Map([["a", 1]]), 0) === null, "poslední místo je volné");
ok(c.capacityError(["a"], items, new Map([["a", 2]]), 0) !== null, "plný termín");
ok(c.capacityError(["a"], items, new Map([["a", 1]]), 1) !== null, "doprovod se počítá do kapacity");
ok(c.capacityError(["b"], items, new Map([["b", 999]]), 3) === null, "bez omezení kapacity");
const a = c.answersToStore({ email: "a@b.cz", name: "J", guests: "2", phone: "123", note: "", custom_1: true, custom_2: false });
ok(JSON.stringify(a) === JSON.stringify({ phone: "123", custom_1: true }), "ukládají se jen neprázdné odpovědi mimo e-mail, jméno a osoby");
process.exit(failed ? 1 : 0);
