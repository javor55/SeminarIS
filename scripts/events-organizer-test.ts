// Unit test nástrojů organizátora (bez databáze): node --experimental-strip-types scripts/events-organizer-test.ts
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

const o = (await import(pathToFileURL(path.resolve(root, "modules/events/organizer-core.ts")).href)) as typeof import("../modules/events/organizer-core");
let failed = 0;
const ok = (cond: boolean, name: string) => {
  console.log(`${cond ? "ok" : "FAIL"}: ${name}`);
  if (!cond) failed++;
};

// --- hledání ---
const r = { name: "Jana Nováková", email: "jana@example.com", code: "K7M-4QX2", answers: { phone: "+420 123 456 789", note: "Přijdu s dcerou" } };
ok(o.matchesQuery(r, "") && o.matchesQuery(r, "  "), "prázdný dotaz najde vše");
ok(o.matchesQuery(r, "novakova") && o.matchesQuery(r, "JANA"), "bez diakritiky a velikosti písmen");
ok(o.matchesQuery(r, "k7m-4qx2") && o.matchesQuery(r, "example.com"), "kód a e-mail");
ok(o.matchesQuery(r, "420123") && o.matchesQuery(r, "dcerou"), "telefon (bez mezer) a poznámka");
ok(!o.matchesQuery(r, "petr"), "nenajde cizí text");

// --- kapacita ---
ok(o.overCapacityMessage(null, 99, 3) === null, "bez omezení se vždy vejde");
ok(o.overCapacityMessage(5, 3, 1) === null, "dvě osoby, dvě místa");
ok(o.overCapacityMessage(5, 4, 1) !== null, "doprovod se nevejde");
ok(o.overCapacityMessage(2, 2, 0) === "Termín je plný.", "plný termín");
ok(o.overCapacityMessage(2, 5, 0) === "Termín je plný.", "přeplněný termín (ruční úpravy) je plný, ne záporný");
ok(o.freeFor(10, 12) === 0 && o.freeFor(null, 3) === null && o.freeFor(10, 4) === 6, "freeFor");

// --- CSV ---
ok(o.csvSafe("=1+1") === "'=1+1" && o.csvSafe("@SUM(A1)") === "'@SUM(A1)" && o.csvSafe("-cmd|x") === "'-cmd|x", "vzorce se neutralizují");
ok(o.csvSafe("+420 123 456 789") === "+420 123 456 789" && o.csvSafe("-5") === "-5" && o.csvSafe("Jana") === "Jana", "telefon, číslo a běžný text zůstanou");
const fields = [
  { key: "name", label: "Jméno a příjmení", mode: "REQUIRED", type: "TEXT" },
  { key: "phone", label: "Telefon", mode: "OPTIONAL", type: "TEXT" },
  { key: "school", label: "Současná škola", mode: "HIDDEN", type: "TEXT" },
  { key: "grade", label: "Ročník", mode: "HIDDEN", type: "TEXT" },
  { key: "guests", label: "Počet osob", mode: "HIDDEN", type: "TEXT" },
  { key: "custom_1", label: "Oblíbený předmět", mode: "OPTIONAL", type: "SELECT" },
  { key: "custom_2", label: "Souhlas s fotkou", mode: "OPTIONAL", type: "CHECKBOX" },
  { key: "custom_3", label: "Skryté bez dat", mode: "HIDDEN", type: "TEXT" },
] as const;
const item = { id: "i1", label: "Dopoledne", startsAt: "2027-01-11T08:00:00Z", endsAt: "2027-01-11T08:30:00Z" };
const rows = [
  { id: "a", code: "AAA-2222", email: "jana@example.com", name: "Jana; \"Nová\"", guests: 2, answers: { phone: "+420 123", school: "ZŠ Dukla", custom_1: "Fyzika", custom_2: true }, status: "CONFIRMED", createdAt: "2026-11-18T10:00:00Z", cancelledAt: null, confirmEmailFailed: false, items: [item] },
  { id: "b", code: "BBB-3333", email: "x@example.com", name: null, guests: 0, answers: {}, status: "CANCELLED", createdAt: "2026-11-18T11:00:00Z", cancelledAt: "2026-11-19T11:00:00Z", confirmEmailFailed: false, items: [] },
] as const;
const cols = o.exportFields(fields, rows as never).map((f) => f.key);
ok(cols.join(",") === "phone,school,custom_1,custom_2", `sloupce: vyplněná skrytá ano, prázdná skrytá ne, jméno a osoby mají vlastní (${cols.join(",")})`);
const csv = o.buildRegistrationsCsv(fields, rows as never);
const lines = csv.replace(/^﻿/, "").split("\r\n");
ok(csv.charCodeAt(0) === 0xfeff, "BOM pro Excel");
ok(lines[0] === "Kód;Stav;Jméno;E-mail;Telefon;Současná škola;Oblíbený předmět;Souhlas s fotkou;Počet osob;Termíny;Registrováno;Zrušeno", "hlavička");
ok(lines[1].startsWith('AAA-2222;Potvrzená;"Jana; ""Nová""";jana@example.com;+420 123;ZŠ Dukla;Fyzika;ano;3;'), "řádek registrace (uvozovky, počet osob = 1 + 2)");
ok(lines[2].startsWith("BBB-3333;Zrušená;;x@example.com;") && lines[2].split(";").at(-1) !== "", "zrušená registrace se stavem a časem zrušení");
ok(o.relaxRequired([{ mode: "REQUIRED" as const }, { mode: "HIDDEN" as const }]).map((f) => f.mode).join() === "OPTIONAL,HIDDEN", "relaxRequired");
process.exit(failed ? 1 : 0);
