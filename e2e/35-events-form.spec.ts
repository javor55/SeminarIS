import { test, expect, type Page } from "@playwright/test";
import { login, resetDb, sql } from "./helpers";

// U6: záložka Formulář (pevná a vlastní pole, náhled), pevná pole se zakládají i u starších událostí.

const toast = (p: Page, text: string) => p.locator("[data-sonner-toast]", { hasText: text });
const row = (p: Page, key: string) => p.locator(`[data-field-row=${key}]`);
const preview = (p: Page) => p.getByTestId("form-preview");

test("nová událost má pevná pole s výchozím režimem, událost bez polí se doplní při otevření záložky", async ({ browser }) => {
  resetDb();
  const page = await login(browser, "teacher@skola.cz");
  await page.goto("/events/new");
  await page.fill("#title", "Nová akce");
  await page.getByTestId("save-event").click();
  await page.waitForURL(/\/events\/(?!new)[^/?]+$/);
  expect(sql(`select string_agg(key || ':' || mode, ',' order by "order") from "EventField"`)).toBe("name:REQUIRED,phone:OPTIONAL,school:HIDDEN,grade:HIDDEN,guests:HIDDEN,note:OPTIONAL");

  // událost vytvořená dřív (bez polí): pole vzniknou při otevření záložky
  sql(`insert into "Event"(id,slug,title,"createdById","updatedAt") values ('evOld','stara','Stará akce','usr_teacher',now())`);
  expect(sql(`select count(*) from "EventField" where "eventId"='evOld'`)).toBe("0");
  await page.goto("/events/evOld?tab=form");
  await expect(row(page, "name")).toBeVisible();
  expect(sql(`select count(*) from "EventField" where "eventId"='evOld' and builtin`)).toBe("6");
  await page.reload();
  expect(sql(`select count(*) from "EventField" where "eventId"='evOld'`)).toBe("6");
});

test("přepínání režimu pevných polí a vlastní pole se projeví v náhledu", async ({ browser }) => {
  resetDb();
  sql(`insert into "Event"(id,slug,title,"createdById","updatedAt") values ('evF','formular','Akce s formulářem','usr_teacher',now())`);
  const page = await login(browser, "teacher@skola.cz");
  await page.goto("/events/evF?tab=form");

  // výchozí náhled: e-mail první, jméno povinné, telefon a poznámka volitelné, souhlas poslední
  const labels = () => preview(page).locator("label").allTextContents();
  await expect(row(page, "name")).toBeVisible();
  expect((await labels()).map((l) => l.replace(/\s*\*$/, ""))).toEqual(["E-mail", "Jméno a příjmení", "Telefon", "Poznámka", expect.stringContaining("Souhlasím")]);
  await expect(preview(page).locator("[data-field=name] label")).toContainText("*");
  await expect(preview(page).locator("[data-field=phone] label")).not.toContainText("*");
  await expect(preview(page).locator("[data-field=consent] a")).toHaveAttribute("href", "/ochrana-udaju");

  // škola se zobrazí jako povinná, telefon se skryje
  await row(page, "school").locator("[data-mode=REQUIRED]").click();
  await expect(preview(page).locator("[data-field=school] label")).toContainText("Současná škola");
  await expect(preview(page).locator("[data-field=school] label")).toContainText("*");
  await row(page, "phone").locator("[data-mode=HIDDEN]").click();
  await expect(preview(page).locator("[data-field=phone]")).toHaveCount(0);
  expect(sql(`select string_agg(key || ':' || mode, ',' order by key) from "EventField" where key in ('school','phone')`)).toBe("phone:HIDDEN,school:REQUIRED");
  expect(sql(`select count(*) from "AuditLog" where action='events.field.mode'`)).toBe("2");

  // pole „Počet osob“ se řídí doprovodem
  await expect(page.getByTestId("guests-note")).toContainText("Skryté");
  await expect(preview(page).locator("[data-field=guests]")).toHaveCount(0);
  sql(`update "Event" set "allowGuests"=true,"maxGuests"=3 where id='evF'`);
  await page.reload();
  await expect(preview(page).locator("[data-field=guests]")).toContainText("Počet osob");
  await expect(preview(page).locator("[data-field=guests]")).toContainText("nejvýše 3");

  // vlastní pole: výběr, povinné
  await page.getByTestId("add-field").click();
  let d = page.getByTestId("field-dialog");
  await d.locator("#field-type").selectOption("SELECT");
  await d.locator("#field-label").fill("Oblíbený předmět");
  await d.locator("#field-options").fill("Matematika\nFyzika");
  await d.getByLabel("Povinné").check();
  await d.getByTestId("field-save").click();
  await expect(toast(page, "Pole je přidané")).toBeVisible();
  await expect(preview(page).locator("[data-field=custom_1] label")).toContainText("Oblíbený předmět");
  await expect(preview(page).locator("[data-field=custom_1] label")).toContainText("*");
  await expect(preview(page).locator("[data-field=custom_1] option")).toHaveText(["— vyberte —", "Matematika", "Fyzika"]);
  expect(sql(`select type || ':' || mode || ':' || array_to_string(options, '/') from "EventField" where key='custom_1'`)).toBe("SELECT:REQUIRED:Matematika/Fyzika");

  // výběr s jednou možností se odmítne
  await page.getByTestId("add-field").click();
  d = page.getByTestId("field-dialog");
  await d.locator("#field-type").selectOption("SELECT");
  await d.locator("#field-label").fill("Špatné");
  await d.locator("#field-options").fill("Jen jedna");
  await d.getByTestId("field-save").click();
  await expect(toast(page, "alespoň dvě")).toBeVisible();
  await d.locator("#field-type").selectOption("CHECKBOX");
  await d.locator("#field-label").fill("Přijdu autem");
  await d.getByTestId("field-save").click();
  await expect(preview(page).locator("[data-field=custom_2]")).toContainText("Přijdu autem");
  expect(sql(`select count(*) from "EventField" where key='custom_2'`)).toBe("1");

  // úprava vlastního pole
  await row(page, "custom_1").locator("[data-action=edit]").click();
  d = page.getByTestId("field-dialog");
  await d.locator("#field-label").fill("Nejoblíbenější předmět");
  await d.locator("#field-options").fill("Matematika\nFyzika\nChemie");
  await d.getByTestId("field-save").click();
  await expect(preview(page).locator("[data-field=custom_1] label")).toContainText("Nejoblíbenější předmět");
  await expect(preview(page).locator("[data-field=custom_1] option")).toHaveCount(4);

  // pořadí: custom_2 nahoru o jedno místo (před custom_1)
  await row(page, "custom_2").getByLabel(/nahoru/).click();
  await expect.poll(() => sql(`select key from "EventField" order by "order" desc limit 1`)).toBe("custom_1");
  await expect(preview(page).locator("[data-field]").nth(-2)).toHaveAttribute("data-field", "custom_1");

  // smazání vlastního pole; pevné pole smazat nejde
  await expect(row(page, "name").locator("[data-action=delete]")).toHaveCount(0);
  await row(page, "custom_2").locator("[data-action=delete]").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Smazat" }).click();
  await expect(toast(page, "Pole je smazané")).toBeVisible();
  await expect(row(page, "custom_2")).toHaveCount(0);
  expect(sql(`select count(*) from "EventField" where key='custom_2'`)).toBe("0");
});

test("vlastní text souhlasu z nastavení je v náhledu a odkaz na ochranu údajů zůstává", async ({ browser }) => {
  resetDb();
  sql(`insert into "Event"(id,slug,title,"consentText","createdById","updatedAt") values ('evC','souhlas','Akce se souhlasem','Souhlasím s fotografováním.','usr_teacher',now())`);
  const page = await login(browser, "teacher@skola.cz");
  await page.goto("/events/evC?tab=form");
  await expect(preview(page).locator("[data-field=consent]")).toContainText("Souhlasím s fotografováním.");
  await expect(preview(page).locator("[data-field=consent] a")).toHaveAttribute("href", "/ochrana-udaju");
  await expect(page.getByTestId("field-consent")).toContainText("nejde skrýt".replace("nejde skrýt", "Vždy povinné"));
});
