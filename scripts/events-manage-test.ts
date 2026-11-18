// Unit test správy registrace a kalendáře (bez databáze): node --experimental-strip-types scripts/events-manage-test.ts
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

const m = (await import(pathToFileURL(path.resolve(root, "modules/events/manage-core.ts")).href)) as typeof import("../modules/events/manage-core");
const ics = (await import(pathToFileURL(path.resolve(root, "modules/events/ics.ts")).href)) as typeof import("../modules/events/ics");
let failed = 0;
const ok = (cond: boolean, name: string) => {
  console.log(`${cond ? "ok" : "FAIL"}: ${name}`);
  if (!cond) failed++;
};

// --- uzávěrka změn ---
const ev = { status: "PUBLISHED" as const, registrationOpensAt: null, registrationClosesAt: null, changeDeadlineMinutes: 1440 };
const start = new Date("2027-01-11T08:00:00Z");
const before = new Date(start.getTime() - 25 * 3600_000);
const after = new Date(start.getTime() - 23 * 3600_000);
ok(m.changeWindow(ev, [start], before).open, "24 h před začátkem: změny ještě jdou");
ok(!m.changeWindow(ev, [start], after).open, "méně než 24 h před začátkem: změny nejdou");
ok(m.changeWindow(ev, [start], before).deadline!.getTime() === start.getTime() - 1440 * 60_000, "uzávěrka = začátek minus změnová lhůta");
const later = new Date("2027-01-12T08:00:00Z");
ok(m.changeWindow(ev, [later, start], before).deadline!.getTime() === start.getTime() - 1440 * 60_000, "rozhoduje první vybraný termín");
ok(m.changeWindow({ ...ev, changeDeadlineMinutes: 0 }, [start], new Date(start.getTime() - 1000)).open, "lhůta 0: do začátku");
ok(!m.changeWindow(ev, [start], new Date(start.getTime() + 1000)).open, "po začátku změny nejdou");
ok(m.changeWindow(ev, [null], after).open, "termín bez času bez konce registrace: vždy otevřeno");
const closing = { ...ev, registrationClosesAt: new Date("2027-01-05T10:00:00Z") };
ok(m.changeWindow(closing, [null], new Date("2027-01-05T09:00:00Z")).open && !m.changeWindow(closing, [null], new Date("2027-01-05T11:00:00Z")).open, "termín bez času: do uzavření registrace");
ok(m.changeWindow(closing, [null], new Date("2027-01-01T00:00:00Z")).deadline!.getTime() === new Date("2027-01-05T10:00:00Z").getTime(), "uzávěrka bez času = konec registrace");
ok(m.changeWindow(closing, [start], before).open, "termín s časem se řídí začátkem, ne koncem registrace");
ok(!m.changeWindow({ ...ev, status: "CLOSED" }, [start], before).open && !m.changeWindow({ ...ev, status: "ARCHIVED" }, [null], before).open && !m.changeWindow({ ...ev, status: "DRAFT" }, [start], before).open, "uzavřená, archivovaná a koncept: bez změn");

const taken = new Map([["a", 3], ["b", 1]]);
const adj = m.takenWithoutOwn(taken, ["a"], 1);
ok(adj.get("a") === 1 && adj.get("b") === 1 && taken.get("a") === 3, "vlastní místa (včetně doprovodu) se odečtou, vstup se nemění");

// --- .ics ---
const now = new Date("2026-11-18T10:00:00Z");
const out = ics.buildIcs(
  { id: "ev1", title: "Den; otevřených, dveří\\", place: "Budova A\nPatro 2", url: "https://skola.example/akce/den" },
  [
    { id: "i2", label: "Odpoledne", startsAt: "2027-07-12T12:00:00Z", endsAt: null },
    { id: "i1", label: null, startsAt: "2027-01-11T08:00:00Z", endsAt: "2027-01-11T08:30:00Z" },
    { id: "i3", label: "Bez času", startsAt: null, endsAt: null },
  ],
  now,
);
ok(out.startsWith("BEGIN:VCALENDAR\r\n") && out.endsWith("END:VCALENDAR\r\n"), "začíná a končí VCALENDAR");
ok(!/[^\r]\n/.test(out), "všechny konce řádků jsou CRLF");
ok(out.includes("VERSION:2.0\r\n") && out.includes("PRODID:") && out.includes("BEGIN:VTIMEZONE\r\nTZID:Europe/Prague"), "verze, PRODID a definice zóny Europe/Prague");
ok((out.match(/BEGIN:VEVENT/g) ?? []).length === 2, "termín bez času se vynechá");
ok(out.includes("DTSTART;TZID=Europe/Prague:20270111T090000\r\n") && out.includes("DTEND;TZID=Europe/Prague:20270111T093000\r\n"), "zimní čas: 08:00 UTC = 09:00 Praha");
ok(out.includes("DTSTART;TZID=Europe/Prague:20270712T140000\r\n") && out.includes("DTEND;TZID=Europe/Prague:20270712T150000\r\n"), "letní čas a výchozí délka 1 h");
ok(out.indexOf("20270111T090000") < out.indexOf("20270712T140000"), "události podle času");
ok(out.includes("DTSTAMP:20261118T100000Z\r\n"), "DTSTAMP v UTC");
ok(out.includes("UID:ev1-i1@seminaris\r\n") && out.includes("UID:ev1-i2@seminaris\r\n"), "UID podle id události a termínu");
const unfolded = out.replace(/\r\n /g, "");
ok(unfolded.includes("SUMMARY:Den\; otevřených\\, dveří\\\\\r\n"), "escapování středníku, čárky a zpětného lomítka");
ok(unfolded.includes("LOCATION:Budova A\\nPatro 2\r\n"), "nový řádek v místě jako \\n");
ok(unfolded.includes("SUMMARY:Den\; otevřených\\, dveří\\\\ – Odpoledne\r\n"), "popisek termínu v názvu");
const long = ics.buildIcs({ id: "e", title: "Ž".repeat(120) }, [{ id: "i", label: null, startsAt: "2027-01-11T08:00:00Z", endsAt: null }], now);
ok(long.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75), "řádky mají nejvýše 75 oktetů");
ok(long.replace(/\r\n /g, "").includes("SUMMARY:" + "Ž".repeat(120)), "dlouhý řádek se po spojení shoduje (znaky se nerozdělí)");
ok(ics.escapeIcsText("a;b,c\\d\r\ne") === "a\;b\\,c\\\\d\\ne", "escapeIcsText");
process.exit(failed ? 1 : 0);
