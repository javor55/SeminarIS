import { test, expect, type Page } from "@playwright/test";
import { login, resetDb, sql } from "./helpers";

// U5: záložka Termíny (přidání, úprava, zrušení, smazání, generátor řady).

const toast = (p: Page, text: string) => p.locator("[data-sonner-toast]", { hasText: text });
const items = (p: Page) => p.locator("[data-item]");

function seedEvent() {
  resetDb();
  sql(`insert into "Event"(id,slug,title,"createdById","updatedAt") values ('evT','terminy','Akce s termíny','usr_teacher',now())`);
}

test("generátor 9:00–12:00 po 30 min vytvoří 6 termínů s kapacitou 20; jde je upravit i zrušit", async ({ browser }) => {
  seedEvent();
  const page = await login(browser, "teacher@skola.cz");
  await page.goto("/events/evT?tab=items");
  await expect(page.getByTestId("items-empty")).toBeVisible();

  await page.getByTestId("generate-items").click();
  const dialog = page.getByTestId("generator-dialog");
  // bez data nejde nic vytvořit
  await expect(dialog.getByTestId("generator-submit")).toBeDisabled();
  await dialog.locator("#gen-date").fill("2026-12-01");
  await dialog.locator("#gen-from").fill("09:00");
  await dialog.locator("#gen-to").fill("12:00");
  await dialog.locator("#gen-step").fill("30");
  await dialog.locator("#gen-capacity").fill("20");
  await expect(dialog.getByTestId("generator-count")).toHaveText("Vznikne 6 termínů");
  await expect(dialog.getByTestId("generator-preview")).toContainText("9:00–9:30");
  await expect(dialog.getByTestId("generator-preview")).toContainText("11:30–12:00");

  // víc než 100 termínů generátor odmítne už v náhledu
  await dialog.locator("#gen-from").fill("00:00");
  await dialog.locator("#gen-to").fill("23:59");
  await dialog.locator("#gen-step").fill("10");
  await expect(dialog.getByTestId("generator-preview")).toContainText("nejvýše 100");
  await expect(dialog.getByTestId("generator-submit")).toBeDisabled();
  await dialog.locator("#gen-from").fill("09:00");
  await dialog.locator("#gen-to").fill("12:00");
  await dialog.locator("#gen-step").fill("30");
  await expect(dialog.getByTestId("generator-count")).toHaveText("Vznikne 6 termínů");

  await dialog.getByTestId("generator-submit").click();
  await expect(toast(page, "Vytvořeno 6 termínů")).toBeVisible();
  await expect(items(page)).toHaveCount(6);
  await expect(page.getByTestId("item-group")).toHaveCount(1);
  expect(sql(`select count(*), min(capacity), max(capacity) from "EventItem" where "eventId"='evT'`)).toBe("6|20|20");
  expect(sql(`select string_agg(to_char(("startsAt" at time zone 'UTC') at time zone 'Europe/Prague','HH24:MI') || '-' || to_char(("endsAt" at time zone 'UTC') at time zone 'Europe/Prague','HH24:MI'), ' ' order by "startsAt") from "EventItem"`)).toBe("09:00-09:30 09:30-10:00 10:00-10:30 10:30-11:00 11:00-11:30 11:30-12:00");
  expect(sql(`select count(*) from "AuditLog" where action='events.item.generate'`)).toBe("1");
  await expect(items(page).first()).toContainText("9:00–9:30");
  await expect(items(page).first()).toContainText("0 / 20");

  // úprava prvního termínu: kapacita 25 a poznámka
  await items(page).first().locator("[data-action=edit]").click();
  const edit = page.getByTestId("item-dialog");
  await edit.locator("#item-capacity").fill("25");
  await edit.locator("#item-note").fill("Vchod A");
  await edit.getByTestId("item-save").click();
  await expect(toast(page, "Termín je uložený")).toBeVisible();
  await expect(items(page).first()).toContainText("0 / 25");
  await expect(items(page).first()).toContainText("Vchod A");
  expect(sql(`select capacity || '|' || note from "EventItem" where "eventId"='evT' order by "startsAt" limit 1`)).toBe("25|Vchod A");

  // zrušení a obnovení
  await items(page).nth(1).locator("[data-action=cancel]").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Zrušit termín" }).click();
  await expect(toast(page, "Termín je zrušený")).toBeVisible();
  await expect(items(page).nth(1)).toContainText("Zrušeno");
  expect(sql(`select count(*) from "EventItem" where "eventId"='evT' and "cancelledAt" is not null`)).toBe("1");
  await items(page).nth(1).locator("[data-action=restore]").click();
  await expect(toast(page, "Termín je obnovený")).toBeVisible();
  await expect(items(page).nth(1)).not.toContainText("Zrušeno");
  expect(sql(`select count(*) from "EventItem" where "eventId"='evT' and "cancelledAt" is not null`)).toBe("0");
  expect(sql(`select count(*) from "AuditLog" where action in ('events.item.update','events.item.cancel','events.item.restore')`)).toBe("3");
});

test("termín s časem i bez času, skupina „Bez času“, řazení a mazání jen bez registrací", async ({ browser }) => {
  seedEvent();
  const page = await login(browser, "teacher@skola.cz");
  await page.goto("/events/evT?tab=items");

  // termín jen s názvem
  await page.getByTestId("add-item").click();
  let d = page.getByTestId("item-dialog");
  await d.getByTestId("item-save").click();
  await expect(toast(page, "Vyplňte název, nebo datum a čas")).toBeVisible();
  await d.locator("#item-label").fill("Individuální termín");
  await d.getByTestId("item-save").click();
  await expect(toast(page, "Termín je přidaný")).toBeVisible();
  await expect(d).toBeHidden();

  // druhý bez času
  await page.getByTestId("add-item").click();
  d = page.getByTestId("item-dialog");
  await d.locator("#item-label").fill("Po domluvě");
  await d.getByTestId("item-save").click();
  await expect(toast(page, "Termín je přidaný").nth(1)).toBeVisible();

  // termín s časem (konec před začátkem se odmítne)
  await page.getByTestId("add-item").click();
  d = page.getByTestId("item-dialog");
  await d.locator("#item-date").fill("2027-01-11");
  await d.locator("#item-start").fill("14:00");
  await d.locator("#item-end").fill("13:00");
  await d.getByTestId("item-save").click();
  await expect(toast(page, "Konec termínu musí být po jeho začátku")).toBeVisible();
  await d.locator("#item-end").fill("14:45");
  await d.locator("#item-capacity").fill("3");
  await d.getByTestId("item-save").click();
  await expect(page.getByTestId("item-dialog")).toBeHidden();

  const groups = page.getByTestId("item-group");
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toContainText("11. 1. 2027");
  await expect(groups.first()).toContainText("14:00–14:45");
  await expect(groups.last().locator("h3")).toContainText("Bez času");
  await expect(groups.last().locator("[data-item]").first()).toContainText("Individuální termín");

  // posun v rámci „Bez času“
  await groups.last().locator("[data-item]").first().getByLabel("Posunout dolů").click();
  await expect(groups.last().locator("[data-item]").first()).toContainText("Po domluvě");
  expect(sql(`select string_agg(label, ',' order by "order") from "EventItem" where "startsAt" is null`)).toBe("Po domluvě,Individuální termín");

  // registrace zakáže smazání
  const timedId = sql(`select id from "EventItem" where "startsAt" is not null`);
  sql(`insert into "EventRegistration"(id,"eventId",email,"tokenHash",code,"consentAt","updatedAt") values ('rg1','evT','a@b.cz','h1','AAA-1111',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('rg1','${timedId}')`);
  await page.reload();
  const timed = page.locator(`[data-item="${timedId}"]`);
  await expect(timed).toContainText("1 / 3");
  await expect(timed.locator("[data-action=delete]")).toHaveCount(0);

  // kapacitu nejde snížit pod obsazenost
  await timed.locator("[data-action=edit]").click();
  d = page.getByTestId("item-dialog");
  sql(`insert into "EventRegistration"(id,"eventId",email,"tokenHash",code,"consentAt","updatedAt") values ('rg2','evT','c@d.cz','h2','BBB-2222',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('rg2','${timedId}')`);
  await d.locator("#item-capacity").fill("1");
  await d.getByTestId("item-save").click();
  await expect(toast(page, "kapacitu nejde snížit")).toBeVisible();
  await d.getByRole("button", { name: "Zpět" }).click();

  // smazání termínu bez registrací
  const first = groups.last().locator("[data-item]").first();
  await first.locator("[data-action=delete]").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Smazat" }).click();
  await expect(toast(page, "Termín je smazaný")).toBeVisible();
  expect(sql(`select count(*) from "EventItem" where "eventId"='evT'`)).toBe("2");
  expect(sql(`select count(*) from "AuditLog" where action='events.item.delete'`)).toBe("1");
});

test("cizí učitel termíny cizí události nevidí; na telefonu jsou termíny jako karty", async ({ browser }) => {
  seedEvent();
  sql(`insert into "EventItem"(id,"eventId",label,capacity,"order") values ('it1','evT','Jediný termín',10,0)`);
  const page = await login(browser, "teacher@skola.cz");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events/evT?tab=items");
  await expect(page.locator("[data-item=it1]")).toContainText("Jediný termín");
  await expect(page.locator("[data-item=it1]")).toContainText("0 / 10");
  await expect(page.locator("[data-item=it1] [data-action=edit]")).toBeVisible();
});
