// Unit test hromadného e-mailu účastníkům (bez databáze): node --experimental-strip-types scripts/events-bulk-test.ts
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

const b = (await import(pathToFileURL(path.resolve(root, "modules/events/bulk-core.ts")).href)) as typeof import("../modules/events/bulk-core");
const t = (await import(pathToFileURL(path.resolve(root, "lib/email/transport.ts")).href)) as typeof import("../lib/email/transport");
const tpl = (await import(pathToFileURL(path.resolve(root, "lib/email/template.ts")).href)) as typeof import("../lib/email/template");
let failed = 0;
const ok = (cond: boolean, name: string) => {
  console.log(`${cond ? "ok" : "FAIL"}: ${name}`);
  if (!cond) failed++;
};

// --- předmět a text ---
ok(b.cleanSubject("Ahoj\r\nBcc: x@y.cz\n  svět") === "Ahoj Bcc: x@y.cz svět", "předmět je na jeden řádek (žádné vkládání hlaviček)");
ok(b.cleanBody("a\r\nb\rc\u0000d\u0007") === "a\nb\ncd", "text: sjednocená zalomení, bez řídicích znaků");
ok(b.cleanBody("a\n\n\n\n\n\nb") === "a\n\n\nb", "text: nejvýš dva prázdné řádky za sebou");
ok(b.validateBulkMessage("", "text").ok === false && b.validateBulkMessage("p", "  ").ok === false, "vyžaduje předmět i text");
ok(b.validateBulkMessage("a".repeat(201), "t").ok === false && b.validateBulkMessage("p", "t".repeat(5001)).ok === false, "meze délky");
const unknown = b.validateBulkMessage("Ahoj {{jmeno}}", "Heslo: {{heslo}}");
ok(unknown.ok === false && String((unknown as { error: string }).error).includes("{{heslo}}"), "neznámá proměnná se odmítne");
ok(b.validateBulkMessage("Zítra: {{akce}}", "Dobrý den, {{jmeno}}, {{terminy}} {{misto}} {{kod}} {{odkaz}}").ok === true, "povolené proměnné projdou");
ok(b.isUnsendableEmail("smazano-abc@anonym.invalid") && b.isUnsendableEmail("x@ukazka.invalid") && !b.isUnsendableEmail("jana@example.com"), "smazané a ukázkové adresy se nepošlou");

// --- bezpečné escapování: text jde do HTML jen přes textToHtml ---
const evil = `<script>alert(1)</script><img src=x onerror="alert(2)"> & "uvozovky"`;
const html = t.textToHtml(evil);
ok(!html.includes("<script") && !html.includes("<img") && html.includes("&lt;script&gt;") && html.includes("&amp;") && html.includes("&quot;uvozovky&quot;"), "HTML ve zprávě se escapuje");
const rendered = tpl.renderTemplate("Dobrý den, {{jmeno}}!\n\n{{terminy}}", { jmeno: "<b>Jana</b>", terminy: "• <i>A</i>\n• B" });
const renderedHtml = t.textToHtml(rendered);
ok(!renderedHtml.includes("<b>") && !renderedHtml.includes("<i>") && renderedHtml.includes("&lt;b&gt;Jana&lt;/b&gt;"), "jméno účastníka s HTML se escapuje");
ok(tpl.renderTemplate("{{jmeno}}", { jmeno: "{{kod}}", kod: "TAJNE" }) === "{{kod}}", "hodnota proměnné se znovu nevyhodnocuje");

// --- plán podle limitu ---
const usage = { dailyLimit: 90, today: 40, monthlyLimit: 2900, month: 2880 };
ok(b.roomLeft(usage) === 20, "zbývá menší z denní a měsíční rezervy");
ok(b.roomLeft({ ...usage, today: 100 }) === 0, "vyčerpaný limit = 0");
ok(JSON.stringify(b.planBulkSend(10, 20)) === JSON.stringify({ ok: true, send: 10 }), "vejde se: všem");
ok(b.planBulkSend(30, 20).ok === false, "nevejde se bez volby: odmítnout");
ok(JSON.stringify(b.planBulkSend(30, 20, 20)) === JSON.stringify({ ok: true, send: 20 }), "nevejde se: jen části");
ok(b.planBulkSend(30, 20, 21).ok === false && b.planBulkSend(30, 20, 0).ok === false, "část nad limit nebo nulová se odmítne");
ok(b.planBulkSend(30, 0, 5).ok === false && b.planBulkSend(0, 20).ok === false, "bez rezervy a bez příjemců nic");

if (failed > 0) {
  console.error(`${failed} testů selhalo`);
  process.exit(1);
}
console.log("Všechny testy prošly.");
