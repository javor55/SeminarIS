import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { login, resetDb, sql } from "./helpers";

// U4: nahrávání titulního obrázku (ořez, zmenšení, uložení v DB), obrázky a odkazy v popisu, čištění HTML.
// Testovací obrázky vytváří scripts/make-e2e-images.py (e2e/fixtures/).

const FOTO = path.join(__dirname, "fixtures", "foto-telefon.jpg");
const MALY = path.join(__dirname, "fixtures", "maly.png");
const saved = (p: Page) => p.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" });

function seedEvent() {
  resetDb();
  sql(`insert into "Event"(id,slug,title,"createdById","updatedAt") values ('evI','obrazky','Akce s obrázky','usr_teacher',now())`);
}

async function chooseCover(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByTestId("image-file").setInputFiles(file);
}

test("velká fotka z telefonu se ořízne na 16:9, zmenší na WebP do 600 kB a uloží do databáze", async ({ browser }) => {
  seedEvent();
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evI");
  await expect(teacher.getByTestId("image-dropzone")).toBeVisible();

  await chooseCover(teacher, FOTO);
  const dialog = teacher.getByTestId("crop-dialog");
  await expect(dialog).toBeVisible();
  const confirm = teacher.getByTestId("crop-confirm");
  await expect(confirm).toBeEnabled();
  // přiblížení posuvníkem a potvrzení výřezu
  await teacher.locator("#event-image-zoom").fill("1.5");
  await confirm.click();
  await expect(teacher.getByTestId("image-preview")).toBeVisible();
  await expect(dialog).toBeHidden();

  await teacher.locator("#event-image-alt").fill("Budova školy");
  await teacher.getByTestId("save-event").click();
  await expect(saved(teacher)).toBeVisible();

  const [mime, w, h, size] = sql(`select i.mime, i.width, i.height, i.size from "Event" e join "EventImage" i on i.id=e."imageId" where e.id='evI'`).split("|");
  expect(mime).toBe("image/webp");
  expect(Number(w)).toBeLessThanOrEqual(1600);
  expect(Number(w)).toBeGreaterThan(800);
  expect(Math.abs(Number(w) / Number(h) - 16 / 9)).toBeLessThan(0.02);
  expect(Number(size)).toBeLessThanOrEqual(600 * 1024);
  expect(sql(`select "imageAlt" from "Event" where id='evI'`)).toBe("Budova školy");
  expect(sql(`select count(*) from "AuditLog" where action='events.image.upload'`)).toBe("1");

  // obrázek vydává veřejná route s dlouhou cache, i bez přihlášení
  const id = sql(`select "imageId" from "Event" where id='evI'`);
  const anon = await browser.newContext();
  const res = await anon.request.get(`/api/events/images/${id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/webp");
  expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect((await res.body()).length).toBe(Number(size));
  expect((await anon.request.get("/api/events/images/neexistuje")).status()).toBe(404);
  await anon.close();

  // po obnovení je náhled i alternativní text zpět, obrázek jde odebrat
  await teacher.reload();
  await expect(teacher.getByTestId("image-preview")).toHaveAttribute("alt", "Budova školy");
  await teacher.getByTestId("image-remove").click();
  await expect(teacher.getByTestId("image-dropzone")).toBeVisible();
  await teacher.getByTestId("save-event").click();
  await expect(saved(teacher)).toBeVisible();
  expect(sql(`select coalesce("imageId",'-') || '|' || coalesce("imageAlt",'-') from "Event" where id='evI'`)).toBe("-|-");
});

test("nahrání přetažením souboru a chybové hlášky (není obrázek, příliš velký)", async ({ browser }) => {
  seedEvent();
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evI");

  await chooseCover(teacher, { name: "poznamky.txt", mimeType: "text/plain", buffer: Buffer.from("ahoj") });
  await expect(teacher.getByTestId("image-error")).toHaveText("Soubor není obrázek.");
  await expect(teacher.getByTestId("crop-dialog")).toHaveCount(0);

  await chooseCover(teacher, { name: "obri.png", mimeType: "image/png", buffer: Buffer.alloc(11 * 1024 * 1024, 1) });
  await expect(teacher.getByTestId("image-error")).toContainText("příliš velký");

  // soubor s příponou obrázku, ale poškozený obsah
  await chooseCover(teacher, { name: "rozbity.png", mimeType: "image/png", buffer: Buffer.from("tohle neni png") });
  await expect(teacher.getByTestId("image-error")).toContainText("nepodařilo načíst");

  // přetažení souboru na plochu
  const data = fs.readFileSync(MALY).toString("base64");
  const transfer = await teacher.evaluateHandle(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "maly.png", { type: "image/png" }));
    return dt;
  }, data);
  await teacher.getByTestId("image-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(teacher.getByTestId("crop-dialog")).toBeVisible();
  await expect(teacher.getByTestId("crop-confirm")).toBeEnabled();
  await teacher.getByTestId("crop-confirm").click();
  await expect(teacher.getByTestId("image-preview")).toBeVisible();
  expect(sql(`select count(*) from "EventImage"`)).toBe("1");
  await expect(teacher.getByTestId("image-error")).toHaveCount(0);
});

test("route pro nahrání: bez přihlášení 401, student 403, neobrázek 415, příliš velký 413, PNG projde", async ({ browser }) => {
  seedEvent();
  const png = fs.readFileSync(MALY);
  const post = (req: import("@playwright/test").APIRequestContext, buffer: Buffer, name = "a.png", mimeType = "image/png") =>
    req.post("/api/events/images", { multipart: { file: { name, mimeType, buffer } } });

  const anon = await browser.newContext();
  expect((await post(anon.request, png)).status()).toBe(401);
  await anon.close();

  const student = await login(browser, "jan.student@skola.cz");
  expect((await post(student.request, png)).status()).toBe(403);

  const teacher = await login(browser, "teacher@skola.cz");
  // text vydávaný za obrázek (typ se určuje podle obsahu)
  const fake = await post(teacher.request, Buffer.from("<html><script>alert(1)</script></html>"), "x.png", "image/png");
  expect(fake.status()).toBe(415);
  // příliš velký soubor
  const big = await post(teacher.request, Buffer.concat([png, Buffer.alloc(700 * 1024)]));
  expect(big.status()).toBe(413);
  // chybějící soubor
  expect((await teacher.request.post("/api/events/images", { multipart: { jina: "hodnota" } })).status()).toBe(400);
  expect(sql(`select count(*) from "EventImage"`)).toBe("0");

  const ok = await post(teacher.request, png);
  expect(ok.status()).toBe(200);
  const json = await ok.json();
  expect(json.url).toBe(`/api/events/images/${json.id}`);
  expect(sql(`select mime || ',' || width || 'x' || height from "EventImage" where id='${json.id}'`)).toBe("image/png,400x225");
});

test("popis: nadpis, odkaz a obrázek se uloží, <script> a onerror server odfiltruje", async ({ browser }) => {
  seedEvent();
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evI");

  const editor = teacher.locator(".tiptap .ProseMirror");
  await editor.click();
  await teacher.keyboard.type("Ahoj svět");
  // odkaz na vybraném slově
  await teacher.keyboard.press("Shift+Home");
  await teacher.getByTestId("editor-link").click();
  await teacher.getByTestId("editor-link-url").fill("https://example.com/info");
  await teacher.getByTestId("editor-link-apply").click();
  await expect(editor.locator("a")).toHaveText("Ahoj svět");
  // obrázek v textu přes stejnou route, bez ořezu
  await editor.click();
  await teacher.keyboard.press("End");
  await teacher.getByTestId("editor-image-file").setInputFiles(MALY);
  await expect(editor.locator("img")).toHaveCount(1);
  await expect(editor.locator("a")).toHaveText("Ahoj svět");
  expect(sql(`select count(*) from "EventImage"`)).toBe("1");

  // do požadavku na uložení se za běhu doplní nebezpečné HTML (editor samotný ho nevyrobí)
  await teacher.route("**/events/evI*", async (route) => {
    const req = route.request();
    const body = req.postData();
    if (req.method() === "POST" && body && req.headers()["next-action"] && body.includes("Ahoj svět")) {
      await route.continue({ postData: body.replace("</p>", "</p><script>alert(1)</script><img src=x onerror=alert(2)><a href=\\\"javascript:alert(3)\\\">zlo</a></p>") });
    } else await route.continue();
  });
  await teacher.getByTestId("save-event").click();
  await expect(saved(teacher)).toBeVisible();

  const html = sql(`select "descriptionHtml" from "Event" where id='evI'`);
  expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/info"[^>]*>Ahoj svět<\/a>/);
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toMatch(/<img src="\/api\/events\/images\/[a-z0-9]+"/);
  expect(html).not.toMatch(/script|onerror|javascript:|alert/i);
  expect(html).toContain("zlo");

  // po obnovení je obsah zpět v editoru
  await teacher.unroute("**/events/evI*");
  await teacher.reload();
  await expect(teacher.locator(".tiptap .ProseMirror img")).toHaveCount(1);
  await expect(teacher.locator(".tiptap .ProseMirror a")).toHaveText("Ahoj svět");
  // změna popisu se zapíše do historie
  expect(sql(`select count(*) from "AuditLog" where action='events.event.update' and summary like '%popis změněn%'`)).toBe("1");
});

test("prázdný popis se uloží jako prázdný text", async ({ browser }) => {
  seedEvent();
  sql(`update "Event" set "descriptionHtml"='<p>Starý</p>' where id='evI'`);
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evI");
  const editor = teacher.locator(".tiptap .ProseMirror");
  await expect(editor).toContainText("Starý");
  await editor.click();
  await teacher.keyboard.press("Control+A");
  await teacher.keyboard.press("Delete");
  await teacher.getByTestId("save-event").click();
  await expect(saved(teacher)).toBeVisible();
  expect(sql(`select "descriptionHtml" from "Event" where id='evI'`)).toBe("");
});
