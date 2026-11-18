import { test, expect, type Browser, type Page } from "@playwright/test";
import { login, resetDb, sql, toastText } from "./helpers";

// U3: seznam událostí a základní nastavení události (založení, úprava, stav, oprávnění, odkaz).

const q = (s: string) => s.replace(/'/g, "''");
const eventBy = (title: string, col: string) => sql(`select ${col} from "Event" where title='${q(title)}' order by "createdAt" desc limit 1`);

/** Druhý učitel s heslem „password123“ (hash převzatý z učitele Petra). */
function addTeacherB() {
  sql(
    `insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`
  );
}

async function createViaUi(page: Page, title: string, extra?: (p: Page) => Promise<void>) {
  await page.goto("/events/new");
  await page.fill("#title", title);
  if (extra) await extra(page);
  await page.getByTestId("save-event").click();
  await page.waitForURL(/\/events\/(?!new)[^/?]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

test("učitel založí událost, upraví nastavení, zveřejní ji a admin ji vidí", async ({ browser }) => {
  resetDb();
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events");
  await expect(teacher.getByText("Zatím žádné události")).toBeVisible();
  await teacher.getByTestId("new-event").click();
  await teacher.waitForURL("**/events/new");

  await createViaUi(teacher, "Den otevřených dveří 2027");
  // odkaz z názvu bez diakritiky, výchozí stav koncept a výchozí pravidla
  expect(eventBy("Den otevřených dveří 2027", "slug")).toBe("den-otevrenych-dveri-2027");
  expect(eventBy("Den otevřených dveří 2027", `status || ',' || "createdById" || ',' || "maxItemsPerRegistration"`)).toBe("DRAFT,usr_teacher,1");
  await expect(teacher.getByTestId("event-status")).toHaveText("Koncept");
  expect(sql(`select count(*) from "AuditLog" where action='events.event.create'`)).toBe("1");

  // úprava nastavení
  await teacher.fill("#subtitle", "Prohlídka školy");
  await teacher.fill("#place", "Hlavní budova");
  await teacher.fill("#contact", "info@skola.cz");
  await teacher.fill("#maxItemsPerRegistration", "3");
  await teacher.getByLabel("Účastník smí přivést další osoby").check();
  await teacher.fill("#maxGuests", "4");
  await teacher.fill("#maxRegistrationsPerEmail", "2");
  await teacher.fill("#changeDeadlineHours", "12");
  await teacher.selectOption("#confirmChannel", "SCREEN_ONLY");
  await teacher.fill("#confirmationText", "Těšíme se na vás.");
  await teacher.fill("#consentText", "Souhlasím se zpracováním údajů.");
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  expect(
    eventBy(
      "Den otevřených dveří 2027",
      `concat_ws('|', subtitle, place, contact, "maxItemsPerRegistration", "allowGuests", "maxGuests", "maxRegistrationsPerEmail", "changeDeadlineMinutes", "confirmChannel", "confirmationText", "consentText")`
    )
  ).toBe("Prohlídka školy|Hlavní budova|info@skola.cz|3|t|4|2|720|SCREEN_ONLY|Těšíme se na vás.|Souhlasím se zpracováním údajů.");
  expect(sql(`select count(*) from "AuditLog" where action='events.event.update'`)).toBe("1");

  // po obnovení stránky jsou hodnoty zpět ve formuláři
  await teacher.reload();
  await expect(teacher.locator("#place")).toHaveValue("Hlavní budova");
  await expect(teacher.locator("#changeDeadlineHours")).toHaveValue("12");
  await expect(teacher.locator("#confirmChannel")).toHaveValue("SCREEN_ONLY");

  // zveřejnění
  await teacher.getByRole("button", { name: "Zveřejnit", exact: true }).click();
  await expect(teacher.getByTestId("event-status")).toHaveText("Zveřejněno");
  expect(eventBy("Den otevřených dveří 2027", "status")).toBe("PUBLISHED");

  // seznam: karta s názvem, pilulkou, obdobím registrace a počtem
  await teacher.goto("/events");
  const card = teacher.getByTestId("event-card");
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("event-title")).toHaveText("Den otevřených dveří 2027");
  await expect(card.getByTestId("event-status")).toHaveText("Zveřejněno");
  await expect(card).toContainText("Registrace: bez omezení");
  await expect(card.getByTestId("event-registrations")).toHaveText("0 registrací");

  // admin vidí událost i autora
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto("/events");
  await expect(admin.getByTestId("event-card")).toHaveCount(1);
  await expect(admin.getByTestId("event-card")).toContainText("Autor:");
  await admin.getByTestId("edit-event").click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Den otevřených dveří 2027");
});

test("oprávnění: cizí událost učitel B nevidí, dokud není spoluorganizátor; student nemá přístup", async ({ browser }) => {
  resetDb();
  addTeacherB();
  const teacher = await login(browser, "teacher@skola.cz");
  await createViaUi(teacher, "Workshop robotiky");
  const id = eventBy("Workshop robotiky", "id");

  const b = await login(browser, "teacher.b@skola.cz");
  await b.goto("/events");
  await expect(b.getByText("Zatím žádné události")).toBeVisible();
  const res = await b.goto(`/events/${id}`);
  expect(res!.status()).toBe(404);

  // autor přidá Boženu jako spoluorganizátorku
  await teacher.selectOption("#addOrganizer", { label: "Druhá Božena" });
  await expect(teacher.getByTestId("organizer-chip")).toHaveText(/Druhá Božena/);
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  expect(sql(`select count(*) from "EventOrganizer" where "eventId"='${id}' and "userId"='usr_teacher_b'`)).toBe("1");

  await b.goto("/events");
  await expect(b.getByTestId("event-card")).toHaveCount(1);
  await b.goto(`/events/${id}`);
  await expect(b.getByRole("heading", { level: 1 })).toHaveText("Workshop robotiky");
  // spoluorganizátor událost smí upravit
  await b.fill("#place", "Dílna");
  await b.getByTestId("save-event").click();
  await expect(b.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  expect(eventBy("Workshop robotiky", "place")).toBe("Dílna");

  // odebrání spoluorganizátora
  await teacher.reload();
  await teacher.getByRole("button", { name: "Odebrat Druhá Božena" }).click();
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  await b.goto("/events");
  await expect(b.getByText("Zatím žádné události")).toBeVisible();

  // student ani přímý odkaz
  const student = await login(browser, "jan.student@skola.cz");
  await student.goto(`/events/${id}`);
  await expect(student).not.toHaveURL(/\/events/);
  await student.goto("/events/new");
  await expect(student).not.toHaveURL(/\/events/);
});

test("odkaz: kolize názvu přidá -2 a -3, vlastní a náhodný odkaz, obsazený odkaz je chyba", async ({ browser }) => {
  resetDb();
  const teacher = await login(browser, "teacher@skola.cz");
  await createViaUi(teacher, "Přednáška pro rodiče");
  await createViaUi(teacher, "Přednáška pro rodiče");
  await createViaUi(teacher, "Přednáška pro rodiče");
  expect(sql(`select string_agg(slug, ',' order by slug) from "Event"`)).toBe("prednaska-pro-rodice,prednaska-pro-rodice-2,prednaska-pro-rodice-3");

  // vlastní odkaz při založení
  await createViaUi(teacher, "Jarní workshop", async (p) => {
    await p.fill("#slug", "jaro");
  });
  expect(eventBy("Jarní workshop", "slug")).toBe("jaro");

  // obsazený a neplatný odkaz
  await teacher.fill("#slug", "prednaska-pro-rodice");
  await teacher.getByTestId("save-event").click();
  expect(await toastText(teacher)).toContain("už používá jiná událost");
  await teacher.fill("#slug", "Špatný Odkaz!");
  await teacher.getByTestId("save-event").click();
  expect(await toastText(teacher)).toContain("jen malá písmena");
  expect(eventBy("Jarní workshop", "slug")).toBe("jaro");

  // změna odkazu na volný
  await teacher.fill("#slug", "jaro-2027");
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  expect(eventBy("Jarní workshop", "slug")).toBe("jaro-2027");

  // náhodný odkaz: 10 znaků [a-z0-9], další uložení ho nemění
  await teacher.getByLabel("Náhodný odkaz").check();
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  const random = eventBy("Jarní workshop", "slug");
  expect(random).toMatch(/^[a-z0-9]{10}$/);
  await teacher.reload();
  await expect(teacher.getByLabel("Náhodný odkaz")).toBeChecked();
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  expect(eventBy("Jarní workshop", "slug")).toBe(random);

  // náhodný odkaz už při založení
  await createViaUi(teacher, "Tajná akce", async (p) => {
    await p.getByLabel("Náhodný odkaz").check();
  });
  expect(eventBy("Tajná akce", "slug")).toMatch(/^[a-z0-9]{10}$/);
});

test("stav: zveřejnit, uzavřít, archivovat, vrátit do konceptu; filtr v seznamu; smazání konceptu", async ({ browser }) => {
  resetDb();
  const teacher = await login(browser, "teacher@skola.cz");
  await createViaUi(teacher, "Stavová akce");
  const id = eventBy("Stavová akce", "id");
  const status = teacher.getByTestId("event-status");
  const click = (name: string) => teacher.getByRole("button", { name, exact: true }).click();

  await click("Zveřejnit");
  await expect(status).toHaveText("Zveřejněno");
  await click("Uzavřít registraci");
  await expect(status).toHaveText("Registrace uzavřena");
  await click("Archivovat");
  await expect(status).toHaveText("Archiv");
  expect(sql(`select ("archivedAt" is not null)::text from "Event" where id='${id}'`)).toBe("true");
  await click("Vrátit do konceptu");
  await expect(status).toHaveText("Koncept");
  expect(sql(`select ("archivedAt" is null)::text from "Event" where id='${id}'`)).toBe("true");
  expect(sql(`select count(*) from "AuditLog" where action='events.event.status'`)).toBe("4");

  // filtr podle stavu
  sql(`insert into "Event"(id,slug,title,status,"createdById","updatedAt") values ('e2','druha','Druhá akce','PUBLISHED','usr_teacher',now())`);
  await teacher.goto("/events");
  await expect(teacher.getByTestId("event-card")).toHaveCount(2);
  await teacher.locator('[data-filter="PUBLISHED"]').click();
  await expect(teacher.getByTestId("event-card")).toHaveCount(1);
  await expect(teacher.getByTestId("event-title")).toHaveText("Druhá akce");
  await teacher.locator('[data-filter="ARCHIVED"]').click();
  await expect(teacher.getByText("V tomto stavu nejsou žádné události")).toBeVisible();

  // smazat jde koncept bez registrací; zveřejněná událost nemá tlačítko Smazat
  await teacher.goto(`/events/${id}`);
  await teacher.getByTestId("delete-event").click();
  await teacher.getByRole("alertdialog").getByRole("button", { name: "Smazat" }).click();
  await teacher.waitForURL("**/events");
  expect(sql(`select count(*) from "Event" where id='${id}'`)).toBe("0");
  await teacher.goto("/events/e2");
  await expect(teacher.getByTestId("delete-event")).toHaveCount(0);

  // koncept s registrací smazat nejde (server odmítne i při zastaralé stránce)
  sql(`insert into "Event"(id,slug,title,"createdById","updatedAt") values ('e3','tretí','Třetí','usr_teacher',now())`);
  await teacher.goto("/events/e3");
  sql(`insert into "EventRegistration"(id,"eventId",email,"tokenHash",code,"consentAt","updatedAt") values ('r1','e3','a@b.cz','h1','ABC-2345',now(),now())`);
  await teacher.getByTestId("delete-event").click();
  await teacher.getByRole("alertdialog").getByRole("button", { name: "Smazat" }).click();
  expect(await toastText(teacher)).toContain("už má registrace");
  expect(sql(`select count(*) from "Event" where id='e3'`)).toBe("1");
});

test("viditelnost „jen pro přihlášené“ uloží publikum; kopírování odkazu", async ({ browser }: { browser: Browser }) => {
  resetDb();
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const teacher = await ctx.newPage();
  await teacher.goto("/login");
  await teacher.fill("#email", "teacher@skola.cz");
  await teacher.fill("#password", "password123");
  await teacher.click("button[type=submit]");
  await teacher.waitForURL("**/dashboard");

  await createViaUi(teacher, "Akce pro třeťáky");
  await expect(teacher.getByTestId("audience-picker")).toHaveCount(0);
  await teacher.selectOption("#visibility", "USERS");
  await expect(teacher.getByTestId("audience-picker")).toBeVisible();
  await teacher.locator('#audience-grades [data-grade="3"]').click();
  await expect(teacher.getByTestId("audience-count")).toContainText("Událost je určena");
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  const id = eventBy("Akce pro třeťáky", "id");
  expect(sql(`select visibility from "Event" where id='${id}'`)).toBe("USERS");
  expect(sql(`select string_agg(key, ',') from "EventAudience" where "eventId"='${id}'`)).toBe("GRADE:3");

  // zpět na veřejnou: publikum se smaže
  await teacher.reload();
  await expect(teacher.locator('#audience-grades [data-grade="3"]')).toHaveAttribute("aria-pressed", "true");
  await teacher.selectOption("#visibility", "PUBLIC");
  await teacher.getByTestId("save-event").click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Nastavení uloženo" })).toBeVisible();
  expect(sql(`select count(*) from "EventAudience" where "eventId"='${id}'`)).toBe("0");

  // kopírování odkazu z detailu i ze seznamu
  const slug = eventBy("Akce pro třeťáky", "slug");
  await teacher.getByTestId("copy-event-link").first().click();
  await expect(teacher.locator("[data-sonner-toast]", { hasText: "Odkaz zkopírován" })).toBeVisible();
  expect(await teacher.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3000/akce/${slug}`);
  await teacher.goto("/events");
  await teacher.getByTestId("copy-event-link").click();
  expect(await teacher.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3000/akce/${slug}`);
  await ctx.close();
});

test("validace: prázdný název a konec registrace před začátkem server odmítne", async ({ browser }) => {
  resetDb();
  const teacher = await login(browser, "teacher@skola.cz");
  await createViaUi(teacher, "Validační akce");
  const id = eventBy("Validační akce", "id");
  await teacher.locator("#title").evaluate((el: HTMLInputElement) => el.removeAttribute("required"));
  await teacher.fill("#title", "  ");
  await teacher.getByTestId("save-event").click();
  expect(await toastText(teacher)).toContain("Zadejte název");
  expect(sql(`select title from "Event" where id='${id}'`)).toBe("Validační akce");

  await teacher.fill("#title", "Validační akce");
  // začátek registrace je dnes, konec před ním → chyba
  sql(`update "Event" set "registrationOpensAt"=now() where id='${id}'`);
  sql(`update "Event" set "registrationClosesAt"=now()-interval '1 day' where id='${id}'`);
  await teacher.reload();
  await teacher.getByTestId("save-event").click();
  expect(await toastText(teacher)).toContain("po jejím začátku");
});
