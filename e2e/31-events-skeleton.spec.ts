import { test, expect } from "@playwright/test";
import { login, resetDb, sql } from "./helpers";

// U2: kostra modulu Události – viditelnost navigace podle role, vypnutí modulu, schéma v databázi.

const navLabels = (page: import("@playwright/test").Page) => page.locator("header a").allInnerTexts();

test("položka Události je v menu učitele a admina, student ji nevidí ani neotevře", async ({ browser }) => {
  resetDb();

  const teacher = await login(browser, "teacher@skola.cz");
  expect(await navLabels(teacher)).toContain("Události");
  await teacher.goto("/events");
  await expect(teacher.getByRole("heading", { level: 1 })).toHaveText("Události");
  await expect(teacher.getByText("Zatím žádné události")).toBeVisible();
  // nastavení modulu je jen pro admina
  await teacher.goto("/events/settings");
  await teacher.waitForURL("**/dashboard");

  const admin = await login(browser, "admin@skola.cz");
  expect(await navLabels(admin)).toContain("Události");
  await admin.goto("/events");
  await expect(admin.getByText("Zatím žádné události")).toBeVisible();

  const student = await login(browser, "jan.student@skola.cz");
  await student.goto("/dashboard");
  expect(await navLabels(student)).not.toContain("Události");
  await student.goto("/events");
  await expect(student).not.toHaveURL(/\/events/);
});

test("modul Události jde vypnout a zapnout v Administraci → Moduly", async ({ browser }) => {
  resetDb();
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto("/admin/modules");
  await admin.locator("#module-events").click();
  await expect(async () => {
    expect(sql(`select value from "SystemSetting" where key='module.events.enabled'`)).toBe("false");
  }).toPass();

  const res = await admin.goto("/events");
  expect(res!.status()).toBe(404);
  await admin.goto("/dashboard");
  expect(await navLabels(admin)).not.toContain("Události");

  await admin.goto("/admin/modules");
  await admin.locator("#module-events").click();
  await expect(async () => {
    expect(sql(`select value from "SystemSetting" where key='module.events.enabled'`)).toBe("true");
  }).toPass();
  await admin.goto("/events");
  await expect(admin.getByText("Zatím žádné události")).toBeVisible();
});

test("sekce Události v administraci se otevře adminovi", async ({ browser }) => {
  resetDb();
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto("/admin");
  await admin.getByTestId("admin-nav").getByRole("link", { name: "Události", exact: true }).click();
  await admin.waitForURL("**/events/settings");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Události");
});

test("tabulky modulu existují a události jdou vložit s výchozími hodnotami", async () => {
  resetDb();
  sql(`insert into "Event"(id,slug,title,"createdById","updatedAt") values ('ev1','test','Test','usr_admin',now())`);
  expect(sql(`select status || ',' || visibility || ',' || "confirmChannel" || ',' || "maxItemsPerRegistration" || ',' || "changeDeadlineMinutes" from "Event" where id='ev1'`)).toBe(
    "DRAFT,PUBLIC,EMAIL_AND_SCREEN,1,1440"
  );
  sql(`insert into "EventItem"(id,"eventId","order") values ('it1','ev1',0)`);
  sql(`insert into "EventRegistration"(id,"eventId",email,"tokenHash",code,"consentAt","updatedAt") values ('r1','ev1','a@b.cz','hash1','ABC-2345',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('r1','it1')`);
  // smazání události smaže i položky a registrace (Cascade)
  sql(`delete from "Event" where id='ev1'`);
  expect(sql(`select (select count(*) from "EventItem") + (select count(*) from "EventRegistration") + (select count(*) from "EventRegistrationItem")`)).toBe("0");
});
