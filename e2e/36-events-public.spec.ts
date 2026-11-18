import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { login, resetDb, sql } from "./helpers";

// U7: veřejná stránka události /akce/[slug] (zobrazení bez odeslání): stavy, termíny, formulář, viditelnost USERS.

const PHONE = { width: 390, height: 844 };
const reg = (id: string, ev: string, email: string, guests: number, status = "CONFIRMED") =>
  sql(`insert into "EventRegistration"(id,"eventId",email,guests,status,"tokenHash",code,"consentAt","updatedAt") values ('${id}','${ev}','${email}',${guests},'${status}','h-${id}','AAA-${id.slice(-4).toUpperCase().padEnd(4, "X")}',now(),now())`);
const regItem = (r: string, item: string) => sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('${r}','${item}')`);
const ev = (id: string, slug: string, extra = "") =>
  sql(`insert into "Event"(id,slug,title,subtitle,place,contact,status,"createdById","updatedAt"${extra ? "," + extra.split("|")[0] : ""}) values ('${id}','${slug}','Den otevřených dveří','Prohlídka školy','Budova A, Praha','info@skola.cz','PUBLISHED','usr_teacher',now()${extra ? "," + extra.split("|")[1] : ""})`);

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test("otevřená registrace: obrázek, popis, termíny s volnými místy (včetně doprovodu), plné dole, výběr a formulář", async ({ browser }) => {
  resetDb();
  const png = fs.readFileSync(path.join(__dirname, "fixtures", "maly.png"));
  sql(`insert into "EventImage"(id,data,mime,width,height,size,"createdById") values ('imP',decode('${png.toString("hex")}','hex'),'image/png',400,225,${png.length},'usr_teacher')`);
  ev("evP", "otevrena", `"imageId","imageAlt","descriptionHtml","allowGuests","maxGuests"|'imP','Budova školy','<h2>Program</h2><p>Text <script>alert(1)</script><strong>tučně</strong></p>',true,3`);
  sql(`insert into "EventItem"(id,"eventId","startsAt","endsAt",capacity,"order",note) values ('p1','evP','2027-01-11T08:00:00Z','2027-01-11T08:30:00Z',5,0,'Laboratoře'),('p2','evP','2027-01-11T08:30:00Z','2027-01-11T09:00:00Z',2,1,null),('p3','evP','2027-01-12T08:00:00Z','2027-01-12T08:30:00Z',null,2,null)`);
  sql(`insert into "EventItem"(id,"eventId",label,"order","cancelledAt") values ('p4','evP','Zrušený',3,now())`);
  reg("rg1", "evP", "a@b.cz", 2);
  regItem("rg1", "p1");
  reg("rg2", "evP", "c@d.cz", 0);
  regItem("rg2", "p2");
  reg("rg3", "evP", "e@f.cz", 0);
  regItem("rg3", "p2");
  reg("rg4", "evP", "g@h.cz", 4, "CANCELLED");
  regItem("rg4", "p1");

  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/akce/otevrena");
  // bez navigace aplikace, s patičkou a odkazem na ochranu údajů; noindex a Open Graph
  await expect(page.getByTestId("account-menu")).toHaveCount(0);
  await expect(page.getByTestId("public-privacy-link")).toHaveAttribute("href", "/ochrana-udaju");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Den otevřených dveří");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", "Prohlídka školy");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/api\/events\/images\/imP$/);
  // obsah
  await expect(page.getByTestId("event-title")).toHaveText("Den otevřených dveří");
  await expect(page.getByTestId("event-image")).toHaveAttribute("alt", "Budova školy");
  await expect(page.getByTestId("event-place")).toContainText("Budova A");
  await expect(page.getByTestId("event-contact")).toContainText("info@skola.cz");
  await expect(page.getByTestId("event-description")).toContainText("Program");
  await expect(page.getByTestId("event-description").locator("script")).toHaveCount(0);
  // termíny: dva dny, zrušený se nezobrazí; volno = kapacita − (1 + doprovod) potvrzených; zrušená registrace se nepočítá
  await expect(page.locator("[data-day]")).toHaveCount(2);
  await expect(page.locator("[data-item]")).toHaveCount(3);
  const row = (id: string) => page.locator(`[data-item=${id}]`);
  await expect(row("p1")).toContainText("9:00–9:30");
  await expect(row("p1")).toContainText("Laboratoře");
  await expect(row("p1")).toContainText("Volno: 2 z 5");
  await expect(row("p2")).toContainText("Plno");
  await expect(row("p2").getByTestId("item-pick")).toBeDisabled();
  await expect(row("p2")).toHaveAttribute("data-full", "true");
  // plný termín je v dni dole (za volným)
  const order = await page.locator("[data-day] [data-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-item")));
  expect(order).toEqual(["p1", "p2", "p3"]);
  // jeden termín: tlačítka Vybrat; výběr se přepíná
  await row("p1").getByTestId("item-pick").click();
  await expect(row("p1").getByTestId("item-pick")).toHaveText(/Vybráno/);
  await row("p3").getByTestId("item-pick").click();
  await expect(row("p1").getByTestId("item-pick")).toHaveText("Vybrat");
  await expect(page.getByTestId("selected-summary")).toContainText("út 12. 1. 9:00–9:30");

  // formulář: e-mail první, jméno povinné; souhlas; chyby
  await expect(page.locator("[data-field]").first()).toHaveAttribute("data-field", "email");
  await page.getByTestId("register-button").click();
  await expect(page.getByTestId("error-email")).toBeVisible();
  await expect(page.getByTestId("error-name")).toBeVisible();
  await expect(page.getByTestId("error-consent")).toBeVisible();
  await page.fill("#rf-email", "jana@example.com");
  await page.fill("#rf-name", "Jana Nová");
  await page.locator("#rf-consent").check();
  await noOverflow(page);
  // odeslání je v 38-events-registration.spec.ts; tady jen ověření, že formulář je připravený k odeslání
  await expect(page.getByTestId("register-button")).toBeEnabled({ timeout: 15_000 });
  expect(sql(`select count(*) from "EventRegistration" where email='jana@example.com'`)).toBe("0");
  await ctx.close();

  // počítač
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await desk.newPage();
  await dp.goto("/akce/otevrena");
  await expect(dp.getByTestId("event-title")).toBeVisible();
  await noOverflow(dp);
  await desk.close();
});

test("víc termínů: zaškrtávátka a omezení počtu; událost bez termínů formulář nenabídne", async ({ browser }) => {
  resetDb();
  ev("evM", "vic", `"maxItemsPerRegistration"|2`);
  sql(`insert into "EventItem"(id,"eventId",label,"order") values ('m1','evM','Workshop A',0),('m2','evM','Workshop B',1),('m3','evM','Workshop C',2)`);
  ev("evE", "prazdna");
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await page.goto("/akce/vic");
  const checks = page.getByTestId("item-check");
  await expect(checks).toHaveCount(3);
  await expect(page.getByTestId("item-pick")).toHaveCount(0);
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.getByTestId("items-count")).toContainText("vybráno 2");
  await expect(checks.nth(2)).toBeDisabled();
  await checks.nth(0).uncheck();
  await expect(checks.nth(2)).toBeEnabled();
  await page.goto("/akce/prazdna");
  await expect(page.getByTestId("no-items")).toBeVisible();
  await expect(page.getByTestId("registration-form")).toHaveCount(0);
});

test("stavy: koncept (jen náhled organizátora), před otevřením, uzavřeno, po termínu", async ({ browser }) => {
  resetDb();
  ev("evD", "koncept");
  sql(`update "Event" set status='DRAFT' where id='evD'`);
  sql(`insert into "EventItem"(id,"eventId",label,"order") values ('d1','evD','Termín',0)`);
  ev("evN", "brzy", `"registrationOpensAt"|now() + interval '3 days'`);
  ev("evC", "zavrena");
  sql(`update "Event" set status='CLOSED' where id='evC'`);
  ev("evX", "po-terminu", `"registrationClosesAt"|now() - interval '1 day'`);

  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto("/akce/koncept"))!.status()).toBe(404);
  expect((await anon.goto("/akce/koncept?nahled=1"))!.status()).toBe(404);
  expect((await anon.goto("/akce/neexistuje"))!.status()).toBe(404);

  await anon.goto("/akce/brzy");
  await expect(page_text(anon, "notice-not-open")).toContainText("Registrace se otevře");
  await expect(anon.getByTestId("registration-form")).toHaveCount(0);
  await anon.goto("/akce/zavrena");
  await expect(page_text(anon, "notice-ended")).toContainText("Registrace skončila");
  await anon.goto("/akce/po-terminu");
  await expect(page_text(anon, "notice-ended")).toContainText("Registrace skončila");

  // organizátor: bez ?nahled=1 koncept nevidí, s ním ano (s pruhem a formulářem)
  const teacher = await login(browser, "teacher@skola.cz");
  expect((await teacher.goto("/akce/koncept"))!.status()).toBe(404);
  await teacher.goto("/akce/koncept?nahled=1");
  await expect(teacher.getByTestId("preview-bar")).toHaveText(/Náhled – událost není zveřejněná/);
  await expect(teacher.getByTestId("registration-form")).toBeVisible();
  // cizí učitel (admin je správce všech, student ne) – student koncept nevidí
  const student = await login(browser, "jan.student@skola.cz");
  expect((await student.goto("/akce/koncept?nahled=1"))!.status()).toBe(404);
});

function page_text(p: Page, id: string) {
  return p.getByTestId(id);
}

test("jen pro přihlášené: nepřihlášený má Přihlásit s návratem, student z publika má předvyplněno, jiný ne", async ({ browser }) => {
  resetDb();
  ev("evU", "uzivatele", `visibility|'USERS'`);
  sql(`insert into "EventItem"(id,"eventId",label,"order") values ('u1','evU','Přednáška',0)`);
  sql(`insert into "EventAudience"(id,"eventId",type,"userId",key,"createdAt") values ('eaU','evU','USER','usr_stud1','USER:usr_stud1',now())`);

  const anon = await (await browser.newContext({ viewport: PHONE })).newPage();
  await anon.goto("/akce/uzivatele");
  await expect(anon.getByTestId("notice-login")).toContainText("Registrace je jen pro přihlášené");
  await expect(anon.getByTestId("registration-form")).toHaveCount(0);
  await anon.getByTestId("login-button").click();
  await anon.waitForURL(/\/login\?next=%2Fakce%2Fuzivatele/);
  await anon.fill("#email", "jan.student@skola.cz");
  await anon.fill("#password", "password123");
  await anon.click("button[type=submit]");
  await anon.waitForURL(/\/akce\/uzivatele$/);
  await expect(anon.getByTestId("registration-form")).toBeVisible();
  await expect(anon.locator("#rf-email")).toHaveValue("jan.student@skola.cz");
  await expect(anon.locator("#rf-name")).toHaveValue("Jan Student");

  // student mimo publikum
  const eva = await login(browser, "eva.studentova@skola.cz");
  await eva.goto("/akce/uzivatele");
  await expect(eva.getByTestId("notice-denied")).toContainText("Tato událost pro vás není určena");
  await expect(eva.getByTestId("registration-form")).toHaveCount(0);
  // učitel při výchozím nastavení (jen studenti) také ne
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/akce/uzivatele");
  await expect(teacher.getByTestId("notice-denied")).toBeVisible();
});

test("událost jen pro učitele: student vidí „není určena“, učitel formulář; vnější adresa v next se ignoruje", async ({ browser }) => {
  resetDb();
  ev("evT", "ucitele", `visibility,"audienceRoles"|'USERS',ARRAY['TEACHER']::"Role"[]`);
  sql(`insert into "EventItem"(id,"eventId",label,"order") values ('t1','evT','Porada',0)`);
  const student = await login(browser, "jan.student@skola.cz");
  await student.goto("/akce/ucitele");
  await expect(student.getByTestId("notice-denied")).toContainText("není určena");
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/akce/ucitele");
  await expect(teacher.getByTestId("registration-form")).toBeVisible();
  await expect(teacher.locator("#rf-email")).toHaveValue("teacher@skola.cz");
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto("/akce/ucitele");
  await expect(admin.getByTestId("notice-denied")).toBeVisible();

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/login?next=//evil.example.com");
  await anon.fill("#email", "teacher@skola.cz");
  await anon.fill("#password", "password123");
  await anon.click("button[type=submit]");
  await anon.waitForURL((u) => !u.pathname.startsWith("/login"));
  expect(new URL(anon.url()).hostname).not.toBe("evil.example.com");
});

test("nastavení: role se uloží, studenti zapnou zúžení publika, bez role nejde uložit", async ({ browser }) => {
  resetDb();
  const page = await login(browser, "teacher@skola.cz");
  await page.goto("/events/new");
  await page.fill("#title", "Jen pro kolegy");
  await page.selectOption("#visibility", "USERS");
  // výchozí: studenti
  await expect(page.getByTestId("role-STUDENT")).toBeChecked();
  await expect(page.getByTestId("role-TEACHER")).not.toBeChecked();
  await page.getByTestId("role-STUDENT").uncheck();
  await page.getByTestId("save-event").click();
  await expect(page.locator("[data-sonner-toast]", { hasText: "Vyberte, kdo se může registrovat" })).toBeVisible();
  await page.getByTestId("role-TEACHER").check();
  await page.getByTestId("save-event").click();
  await page.waitForURL(/\/events\/(?!new)[^/?]+$/);
  expect(sql(`select "audienceRoles" from "Event" where title='Jen pro kolegy'`)).toBe("{TEACHER}");
});
