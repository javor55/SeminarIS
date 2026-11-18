// Unit test bezpečného HTML (bez databáze): node --experimental-strip-types scripts/html-test.ts
import path from "node:path";
import { pathToFileURL } from "node:url";

// Dynamický import s příponou .ts (node ji vyžaduje, tsc u statického importu ne)
const htmlModule = path.resolve(import.meta.dirname, "..", "lib", "html.ts");
const { sanitizeRichHtml } = (await import(pathToFileURL(htmlModule).href)) as { sanitizeRichHtml: (html: string) => string };

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` -> ${detail}` : ""}`);
  } else console.log(`ok: ${name}`);
}

const s = sanitizeRichHtml;
let out: string;

out = s('<p>Ahoj</p><script>alert(1)</script>');
check("odstraní <script> včetně obsahu", out === "<p>Ahoj</p>", out);

out = s('<img src="/api/events/images/x" onerror="alert(1)" alt="a">');
check("odstraní onerror", !/onerror/i.test(out) && out.includes("<img"), out);

out = s('<a href="javascript:alert(1)">klik</a>');
check("odstraní javascript: odkaz", !/javascript/i.test(out) && out.includes("klik"), out);

out = s('<a href="JaVaScRiPt:alert(1)">x</a>');
check("odstraní javascript: v jiné velikosti písmen", !/javascript/i.test(out), out);

out = s('<iframe src="https://example.com"></iframe><p>text</p>');
check("odstraní <iframe>", !out.includes("iframe") && out.includes("<p>text</p>"), out);

out = s('<a href="https://example.com" target="_blank">x</a>');
check("odkaz má rel noopener noreferrer", out.includes('rel="noopener noreferrer"') && out.includes('href="https://example.com"'), out);

out = s('<a href="https://example.com" rel="opener">x</a>');
check("rel se přepíše", out.includes('rel="noopener noreferrer"') && !out.includes("opener\""), out);

out = s('<a href="mailto:a@b.cz">m</a><a href="tel:+420123">t</a>');
check("mailto a tel projdou", out.includes("mailto:a@b.cz") && out.includes("tel:+420123"), out);

out = s('<a href="data:text/html;base64,AAAA">x</a>');
check("odstraní data: odkaz", !out.includes("data:"), out);

out = s('<img src="/api/events/images/abc" alt="ok">');
check("img z /api/ projde", out.includes('src="/api/events/images/abc"'), out);

out = s('<img src="https://example.com/a.png" alt="ok">');
check("img přes https projde", out.includes("https://example.com/a.png"), out);

out = s('<img src="http://example.com/a.png"><img src="javascript:alert(1)"><img src="//evil.com/a.png"><img src="/jine/cesta.png">');
check("img z http, javascript, // a cizí cesty se odstraní", !out.includes("<img"), out);

out = s('<p style="color:red" onclick="x()">a</p><h1>nadpis</h1><strong>b</strong><span class="x">c</span>');
check("odstraní style, onclick a nepovolené tagy", !out.includes("style") && !out.includes("onclick") && !out.includes("<h1") && out.includes("<strong>b</strong>"), out);

out = s("");
check("prázdný vstup", out === "", out);

if (failed) {
  console.error(`\n${failed} testů selhalo.`);
  process.exit(1);
}
console.log("\nVšechny testy HTML prošly.");
