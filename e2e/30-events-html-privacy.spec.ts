import { test, expect } from "@playwright/test";
import { login, resetDb, sql } from "./helpers";

// U1: bezpečné HTML (sylabus) a veřejná stránka „Zpracování osobních údajů“.

test("sylabus se při zobrazení zbaví skriptů a nebezpečných odkazů", async ({ browser }) => {
  resetDb();
  const bad = `<p>Bezpečný text</p><script>window.__pwned=1</script><img src="/api/x" onerror="window.__pwned=1"><a href="javascript:window.__pwned=1">odkaz</a><iframe src="https://example.com"></iframe>`;
  sql(`insert into "Subject"(id,name,code,syllabus,"updatedAt") values ('ssyl','Chemie','CH',convert_from(decode('${Buffer.from(bad).toString("hex")}','hex'),'UTF8'),now())`);
  const page = await login(browser, "admin@skola.cz");
  await page.goto("/subjects/ssyl");
  const box = page.locator("[data-testid=subject-overview] .prose");
  await expect(box).toContainText("Bezpečný text");
  expect(await box.locator("script, iframe").count()).toBe(0);
  expect(await box.innerHTML()).not.toMatch(/javascript:|onerror/i);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test("sylabus s <script> se uloží bez skriptu", async ({ browser }) => {
  resetDb();
  const page = await login(browser, "admin@skola.cz");
  await page.goto("/subjects/new");
  await page.fill("#name", "Dějepis");
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("Úvod <script>alert(1)</script>");
  await page.getByRole("button", { name: /uložit|vytvořit/i }).first().click();
  await page.waitForURL(/\/subjects\/(?!new)[^/]+$/);
  const stored = sql(`select syllabus from "Subject" where name='Dějepis'`);
  expect(stored).toContain("Úvod");
  expect(stored).not.toMatch(/<script/i);
});

test("/ochrana-udaju je dostupná bez přihlášení a odkazuje se na ni z přihlášení i registrace", async ({ browser }) => {
  resetDb();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/ochrana-udaju");
  await expect(page).toHaveURL(/\/ochrana-udaju$/);
  await expect(page.getByRole("heading", { name: "Zpracování osobních údajů" })).toBeVisible();
  await expect(page.getByText("[NÁZEV ŠKOLY]").first()).toBeVisible();
  await expect(page.getByTestId("privacy-cookies")).toContainText("nezbytné cookies");

  await page.goto("/login");
  await page.getByTestId("privacy-link").click();
  await expect(page).toHaveURL(/\/ochrana-udaju$/);
  await page.goto("/register");
  await page.getByTestId("privacy-link").click();
  await expect(page).toHaveURL(/\/ochrana-udaju$/);
  await ctx.close();
});

test("admin upraví text a správce, stránka je pak ukáže", async ({ browser }) => {
  resetDb();
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto("/admin/registration");
  const card = admin.getByTestId("privacy-card");
  await card.locator("#setting-privacy-controller").fill("Gymnázium Test");
  await card.locator("[data-setting='privacy.controller'] button").click();
  await expect(async () => {
    expect(sql(`select value from "SystemSetting" where key='privacy.controller'`)).toBe("Gymnázium Test");
  }).toPass();
  await card.locator("#setting-privacy-text").fill("# Naše pravidla\nTotéž <b>nebude</b> HTML.");
  await card.locator("[data-setting='privacy.text'] button").click();
  await expect(async () => {
    expect(sql(`select count(*) from "SystemSetting" where key='privacy.text'`)).toBe("1");
  }).toPass();

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/ochrana-udaju");
  await expect(anon.getByText("Správce: Gymnázium Test")).toBeVisible();
  await expect(anon.getByRole("heading", { name: "Naše pravidla" })).toBeVisible();
  await expect(anon.getByText("Totéž <b>nebude</b> HTML.")).toBeVisible();
});
