// Unit test čekací listiny a duplikace (bez databáze): node --experimental-strip-types scripts/events-waitlist-test.ts
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

const w = (await import(pathToFileURL(path.resolve(root, "modules/events/waitlist-core.ts")).href)) as typeof import("../modules/events/waitlist-core");
const d = (await import(pathToFileURL(path.resolve(root, "modules/events/duplicate-core.ts")).href)) as typeof import("../modules/events/duplicate-core");
let failed = 0;
const ok = (cond: boolean, name: string) => {
  console.log(`${cond ? "ok" : "FAIL"}: ${name}`);
  if (!cond) failed++;
};

// --- výběr z čekací listiny ---
const caps = new Map<string, number | null>([["a", 2], ["b", 1], ["c", null]]);
const c = (id: string, guests: number, ...itemIds: string[]) => ({ id, guests, itemIds });
ok(w.selectPromotions([c("1", 0, "a")], caps, new Map([["a", 1]])).join() === "1", "volné místo: čekající se posune");
ok(w.selectPromotions([c("1", 0, "a")], caps, new Map([["a", 2]])).length === 0, "plno: nikdo se neposune");
ok(w.selectPromotions([c("1", 1, "a"), c("2", 0, "a")], caps, new Map([["a", 1]])).join() === "2", "nejstarší s doprovodem se nevejde, přeskočí se; menší za ním ano");
ok(w.selectPromotions([c("1", 0, "a"), c("2", 0, "a")], caps, new Map([["a", 1]])).join() === "1", "jedno místo = jen nejstarší");
ok(w.selectPromotions([c("1", 0, "a"), c("2", 0, "a")], caps, new Map()).join() === "1,2", "dvě místa = dva nejstarší v pořadí");
ok(w.selectPromotions([c("1", 0, "a", "b")], caps, new Map([["b", 1]])).length === 0, "víc termínů: musí se vejít na všechny");
ok(w.selectPromotions([c("1", 0, "a", "b")], caps, new Map()).join() === "1", "víc termínů: vejde se na všechny");
ok(w.selectPromotions([c("1", 5, "c")], caps, new Map([["c", 100]])).join() === "1", "bez omezení se vejde vždy");
ok(w.selectPromotions([c("1", 0, "x")], caps, new Map()).length === 0, "neznámý termín (smazaný) se neposune");
ok(w.selectPromotions([c("1", 0)], caps, new Map()).length === 0, "bez termínů se neposune");
ok(w.selectPromotions([c("1", 0, "a")], new Map([["a", 0]]), new Map()).length === 0, "zrušený termín (kapacita 0) nepřijme nikoho");
ok(w.waitlistImpossible(["b"], [{ id: "b", capacity: 1 }], 1) !== null, "doprovod nevejde ani na prázdný termín: čekací listina nemá smysl");
ok(w.waitlistImpossible(["a"], [{ id: "a", capacity: 2 }], 1) === null, "doprovod se na prázdný termín vejde");
ok(w.waitlistImpossible(["c"], [{ id: "c", capacity: null }], 9) === null, "bez omezení vždy jde");

// --- duplikace ---
const t = new Date("2027-03-01T08:00:00Z"); // 9:00 SEČ
ok(d.shiftByDays(t, 7).toISOString() === "2027-03-08T08:00:00.000Z", "posun o týden zachová čas");
ok(d.shiftByDays(t, 0).getTime() === t.getTime(), "posun o 0 dní");
ok(d.shiftByDays(t, -1).toISOString() === "2027-02-28T08:00:00.000Z", "posun do minulosti");
ok(d.shiftByDays(t, 60).toISOString() === "2027-04-30T07:00:00.000Z", "přes přechod na letní čas zůstane 9:00 na hodinách (7:00 UTC)");
ok(d.shiftByDays(new Date("2027-03-01T08:00:30.250Z"), 1).toISOString() === "2027-03-02T08:00:30.250Z", "sekundy zůstanou");
ok(d.cleanDuplicateInput({ title: "  Kopie  ", shiftDays: 14 }).title === "Kopie", "název se ořízne");
const bad = (i: { title: string; shiftDays: number }) => { try { d.cleanDuplicateInput(i); return false; } catch { return true; } };
ok(bad({ title: " ", shiftDays: 1 }), "prázdný název se odmítne");
ok(bad({ title: "x", shiftDays: 1.5 }), "desetinný posun se odmítne");
ok(bad({ title: "x", shiftDays: 99999 }), "příliš velký posun se odmítne");
ok(!bad({ title: "x", shiftDays: -30 }), "záporný posun je v pořádku");
process.exit(failed ? 1 : 0);
