// Unit test formuláře a termínů událostí (bez databáze): node --experimental-strip-types scripts/events-form-test.ts
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
const form = (await load("modules/events/form.ts")) as typeof import("../modules/events/form");
const items = (await load("modules/events/items.ts")) as typeof import("../modules/events/items");
const format = (await load("modules/events/format.ts")) as typeof import("../modules/events/format");

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
  } else console.log(`ok: ${name}`);
}

const f = (key: string, type: "TEXT" | "TEXTAREA" | "SELECT" | "CHECKBOX", mode: "REQUIRED" | "OPTIONAL" | "HIDDEN", options: string[] = []) => ({ key, type, label: key, mode, options });
const fields = [f("name", "TEXT", "REQUIRED"), f("phone", "TEXT", "OPTIONAL"), f("school", "TEXT", "HIDDEN"), f("note", "TEXTAREA", "OPTIONAL"), f("custom_1", "SELECT", "REQUIRED", ["A", "B"]), f("custom_2", "CHECKBOX", "REQUIRED")];
const good = { email: "a@b.cz", name: "Jan Novák", custom_1: "A", custom_2: true };

let r = form.validateAnswers(fields, good);
check("platná odpověď projde", r.ok && Object.keys(r.errors).length === 0, r);

r = form.validateAnswers(fields, { ...good, email: "" });
check("chybí e-mail", !r.ok && !!r.errors.email, r);
r = form.validateAnswers(fields, { ...good, email: "bez-zavinace" });
check("špatný formát e-mailu", !r.ok && !!r.errors.email, r);
r = form.validateAnswers(fields, { ...good, name: "  " });
check("chybí povinné pole", !r.ok && !!r.errors.name, r);
r = form.validateAnswers(fields, { ...good, name: "x".repeat(201) });
check("text přes 200 znaků", !r.ok && !!r.errors.name, r);
r = form.validateAnswers(fields, { ...good, name: "x".repeat(200) });
check("text přesně 200 znaků projde", r.ok, r);
r = form.validateAnswers(fields, { ...good, note: "x".repeat(2000) });
check("dlouhý text 2000 znaků projde", r.ok, r);
r = form.validateAnswers(fields, { ...good, note: "x".repeat(2001) });
check("dlouhý text přes 2000 znaků", !r.ok && !!r.errors.note, r);
r = form.validateAnswers(fields, { ...good, custom_1: "C" });
check("výběr mimo možnosti", !r.ok && !!r.errors.custom_1, r);
r = form.validateAnswers(fields, { ...good, custom_1: "" });
check("povinný výběr bez hodnoty", !r.ok && !!r.errors.custom_1, r);
r = form.validateAnswers(fields, { ...good, custom_2: false });
check("povinné zaškrtnutí bez zaškrtnutí", !r.ok && !!r.errors.custom_2, r);
r = form.validateAnswers(fields, { ...good, phone: "abc" });
check("špatný telefon", !r.ok && !!r.errors.phone, r);
r = form.validateAnswers(fields, { ...good, phone: "+420 123 456 789" });
check("platný telefon", r.ok, r);
r = form.validateAnswers(fields, { ...good, school: "x".repeat(500) });
check("skryté pole se ignoruje", r.ok && !("school" in r.values), r);

const withGuests = [...fields, f("guests", "TEXT", "OPTIONAL")];
r = form.validateAnswers(withGuests, { ...good, guests: "2" }, { maxGuests: 3 });
check("počet osob v mezích", r.ok && r.values.guests === "2", r);
r = form.validateAnswers(withGuests, { ...good, guests: "4" }, { maxGuests: 3 });
check("počet osob nad limit", !r.ok && !!r.errors.guests, r);
r = form.validateAnswers(withGuests, { ...good, guests: "-1" }, { maxGuests: 3 });
check("záporný počet osob", !r.ok && !!r.errors.guests, r);
const eff = form.effectiveFields(withGuests, false).find((x) => x.key === "guests");
check("doprovod vypnutý skryje pole osob", eff?.mode === "HIDDEN", eff);
check("doprovod zapnutý ho zobrazí jako volitelné", form.effectiveFields([f("guests", "TEXT", "HIDDEN")], true)[0].mode === "OPTIONAL");

check("definice pole: výběr potřebuje 2 možnosti", (() => { try { form.cleanFieldDefinition({ type: "SELECT", label: "x", options: ["a", "a", " "] }); return false; } catch { return true; } })());
check("definice pole: ořez a deduplikace", JSON.stringify(form.cleanFieldDefinition({ type: "SELECT", label: " L ", options: [" a ", "b", "a"] })) === '{"label":"L","options":["a","b"]}');
check("klíč vlastního pole", form.nextCustomKey(["name", "custom_1", "custom_7"]) === "custom_8" && form.nextCustomKey(["name"]) === "custom_1");
check("pevná pole: e-mail mezi nimi není", !form.FIXED_FIELDS.some((x) => x.key === "email") && form.FIXED_FIELDS.length === 6);

// Termíny
const gen = (over: object = {}) => items.generateSlots({ date: "2026-12-01", from: "09:00", to: "12:00", stepMinutes: 30, durationMinutes: 30, capacity: 20, ...over });
const slots = gen();
check("generátor 9:00–12:00 po 30 min = 6 termínů", slots.length === 6, slots.length);
check("generátor: první 9:00–9:30, poslední 11:30–12:00", format.itemTimeRange({ label: null, ...slots[0] }) === "9:00–9:30" && format.itemTimeRange({ label: null, ...slots[5] }) === "11:30–12:00");
check("generátor: délka kratší než rozestup", gen({ durationMinutes: 20 }).length === 6);
check("generátor: poslední se musí vejít", gen({ to: "11:45" }).length === 5);
check("generátor: letní čas (UTC+2)", gen({ date: "2026-07-01" })[0].startsAt.toISOString() === "2026-07-01T07:00:00.000Z");
check("generátor: zimní čas (UTC+1)", slots[0].startsAt.toISOString() === "2026-12-01T08:00:00.000Z");
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
check("generátor odmítne víc než 100 termínů", throws(() => gen({ from: "00:00", to: "23:59", stepMinutes: 10, durationMinutes: 10 })));
check("generátor povolí přesně 100 termínů", gen({ from: "00:00", to: "10:00", stepMinutes: 6, durationMinutes: 6 }).length === 100);
check("generátor odmítne konec před začátkem", throws(() => gen({ from: "12:00", to: "09:00" })));
check("generátor odmítne nulový rozestup", throws(() => gen({ stepMinutes: 0 })));

const ci = (over: object = {}) => items.cleanItemInput({ label: "", date: "", start: "", end: "", capacity: null, note: "", ...over });
check("termín bez času potřebuje název", throws(() => ci()) && ci({ label: "Kdykoli" }).startsAt === null);
check("termín s časem", ci({ date: "2026-12-01", start: "09:00", end: "09:30", capacity: 5 }).capacity === 5);
check("konec musí být po začátku", throws(() => ci({ date: "2026-12-01", start: "09:00", end: "09:00" })));
check("datum bez začátku", throws(() => ci({ date: "2026-12-01" })));
check("kapacita 0", throws(() => ci({ label: "x", capacity: 0 })));

check("itemLabel s časem", format.itemLabel({ label: null, startsAt: "2027-01-11T08:00:00Z", endsAt: "2027-01-11T08:30:00Z" }) === "po 11. 1. 9:00–9:30", format.itemLabel({ label: null, startsAt: "2027-01-11T08:00:00Z", endsAt: "2027-01-11T08:30:00Z" }));
check("itemLabel bez času", format.itemLabel({ label: "Individuálně", startsAt: null, endsAt: null }) === "Individuálně");
const g = format.groupItemsByDay([
  { label: "B", startsAt: null, endsAt: null, order: 1 },
  { label: null, startsAt: "2026-12-02T08:00:00Z", endsAt: null, order: 0 },
  { label: null, startsAt: "2026-12-01T09:00:00Z", endsAt: null, order: 1 },
  { label: "A", startsAt: null, endsAt: null, order: 0 },
  { label: null, startsAt: "2026-12-01T08:00:00Z", endsAt: null, order: 2 },
]);
check("seskupení po dnech a „Bez času“ na konci", g.length === 3 && g[2].title === "Bez času" && g[2].items[0].label === "A" && g[0].items[0].startsAt === "2026-12-01T08:00:00Z", g.map((x) => x.title));

if (failed) {
  console.error(`${failed} testů selhalo`);
  process.exit(1);
}
