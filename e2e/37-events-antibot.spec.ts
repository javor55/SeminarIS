import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { resetDb, sql } from "./helpers";

// U8: ochrana proti robotům – proof-of-work v prohlížeči (ostré řešení, ne testovací), honeypot, výzva přes API.

function seed() {
  resetDb();
  sql(`insert into "Event"(id,slug,title,status,"createdById","updatedAt") values ('evB','roboti','Akce s ochranou','PUBLISHED','usr_teacher',now())`);
  sql(`insert into "EventItem"(id,"eventId",label,"order") values ('b1','evB','Termín',0)`);
}

test("výzva z API: tvar, bez cache, klíč se uloží jednou", async ({ request }) => {
  seed();
  expect(sql(`select count(*) from "SystemSetting" where key='antibot.key'`)).toBe("0");
  const res = await request.get("/api/antibot/challenge");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const c = await res.json();
  expect(c).toMatchObject({ algorithm: "SHA-256", maxnumber: 100000 });
  expect(c.challenge).toMatch(/^[0-9a-f]{64}$/);
  expect(c.signature).toMatch(/^[0-9a-f]{64}$/);
  expect(new Date(c.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  const c2 = await (await request.get("/api/antibot/challenge")).json();
  expect(c2.challenge).not.toBe(c.challenge);
  expect(sql(`select count(*) from "SystemSetting" where key='antibot.key'`)).toBe("1");
});

test("DB část: klíč, jednorázové řešení, limity", async () => {
  seed();
  // samostatný proces s aplikačním kódem (lib/antibot.ts) proti testovací DB
  const out = execSync("node --experimental-strip-types --no-warnings scripts/antibot-db-test.ts", { env: process.env, stdio: ["ignore", "pipe", "pipe"] }).toString();
  expect(out).not.toContain("FAIL");
  expect(out.match(/^ok:/gm)?.length).toBeGreaterThanOrEqual(8);
});

test("formulář: tlačítko je neaktivní, dokud se ve Web Workeru nespočítá řešení; ostré řešení je správné a rychlé", async ({ browser }) => {
  seed();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  // pomalá výzva, aby šel vidět stav „Ověřuji“
  let challenge: { salt: string; challenge: string; signature: string } | null = null;
  await page.route("**/api/antibot/challenge", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    const res = await route.fetch();
    challenge = await res.json();
    await route.fulfill({ response: res });
  });
  await page.goto("/akce/roboti");
  const button = page.getByTestId("register-button");
  await expect(page.getByTestId("antibot-status")).toHaveText("Ověřuji, že nejste robot…");
  await expect(button).toBeDisabled();
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("antibot-status")).toHaveText("✓ Ověřeno");
  await expect(button).toBeEnabled();

  // řešení je opravdové: sha256(salt + number) = výzva a podpis je z výzvy serveru
  const payload = JSON.parse(Buffer.from(await page.getByTestId("antibot-value").inputValue(), "base64").toString("utf8"));
  expect(challenge).not.toBeNull();
  expect(payload.challenge).toBe(challenge!.challenge);
  expect(payload.signature).toBe(challenge!.signature);
  expect(createHash("sha256").update(challenge!.salt + payload.number).digest("hex")).toBe(challenge!.challenge);
  // doba výpočtu ve workeru (bez testovacího režimu serveru, ten se u klienta nepoužívá)
  console.log(`Proof-of-work: číslo ${payload.number}, výpočet ${payload.took} ms`);
  expect(payload.took).toBeLessThan(2000);
});

test("výpočet v prohlížeči: nejhorší případ (číslo 100 000) do 2 s", async ({ page }) => {
  seed();
  await page.goto("/akce/roboti");
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  // stejný worker jako komponenta, ale výzva s tajným číslem na konci rozsahu
  const took = await page.evaluate(async () => {
    const salt = "nejhorsi-pripad";
    const enc = new TextEncoder();
    const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    const challenge = hex(await crypto.subtle.digest("SHA-256", enc.encode(salt + 100000)));
    const src = `self.onmessage = async (e) => { const { salt, challenge, maxnumber } = e.data; const enc = new TextEncoder(); const target = new Uint8Array(challenge.match(/../g).map((h) => parseInt(h, 16))); const t0 = performance.now(); for (let start = 0; start <= maxnumber; start += 500) { const end = Math.min(start + 499, maxnumber); const jobs = []; for (let n = start; n <= end; n++) jobs.push(crypto.subtle.digest("SHA-256", enc.encode(salt + n))); const hs = await Promise.all(jobs); for (let i = 0; i < hs.length; i++) { const h = new Uint8Array(hs[i]); let same = true; for (let k = 0; k < h.length; k++) if (h[k] !== target[k]) { same = false; break; } if (same) { self.postMessage({ n: start + i, took: performance.now() - t0 }); return; } } } };`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    return new Promise<{ n: number; took: number }>((resolve) => {
      w.onmessage = (e) => resolve(e.data);
      w.postMessage({ salt, challenge, maxnumber: 100000 });
    });
  });
  console.log(`Nejhorší případ (100 000 pokusů): ${Math.round(took.took)} ms`);
  expect(took.n).toBe(100000);
  expect(took.took).toBeLessThan(2000);
});

test("selhání výzvy: chyba a „Zkusit znovu“; honeypot je mimo obrazovku a nezaostřitelný", async ({ page }) => {
  seed();
  let fail = true;
  await page.route("**/api/antibot/challenge", (route) => (fail ? route.abort() : route.continue()));
  await page.goto("/akce/roboti");
  await expect(page.getByTestId("antibot-status")).toHaveText("Ověření se nepodařilo.");
  await expect(page.getByTestId("register-button")).toBeDisabled();
  fail = false;
  await page.getByTestId("antibot-retry").click();
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("register-button")).toBeEnabled();

  const hp = page.getByTestId("honeypot");
  await expect(hp).toHaveAttribute("name", "website");
  await expect(hp).toHaveAttribute("tabindex", "-1");
  await expect(hp).toHaveAttribute("autocomplete", "off");
  const box = await hp.boundingBox();
  expect(box!.x + box!.width).toBeLessThan(0);
  // odeslané pole formuláře s podepsaným časem zobrazení
  expect(await page.locator('input[name="renderToken"]').inputValue()).toMatch(/^\d+\.[0-9a-f]{64}$/);
});
