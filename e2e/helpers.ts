import { execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import type { Browser, Page } from "@playwright/test";

// Pomocné funkce E2E testů. Testy pracují s databází z DATABASE_URL a před každou
// sadou ji VYPRÁZDNÍ – nikdy je nespouštějte proti produkci.

function psqlUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("E2E testy potřebují DATABASE_URL (testovací databáze).");
  // Parametr `schema` zná jen Prisma, psql (libpq) ho neumí
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

/** SQL přes psql; výstup jako `psql -tA` (řádky, sloupce oddělené |). */
export function sql(query: string): string {
  return execSync(`psql "${psqlUrl()}" -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(query)}`, {
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    .trim();
}

/** Vyprázdní všechny tabulky aplikace (struktura zůstává) a nahraje seed. */
export function resetDb() {
  const tables = sql(
    `select string_agg(format('%I', tablename), ', ') from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
  );
  sql(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  execSync("node --experimental-strip-types prisma/seed.ts", { stdio: "ignore", env: process.env });
}

/** Školní předměty a úvazek „Učitel Petr učí matematiku ve 3.A“ pro testy dopisování. */
export function seedSubjects() {
  sql(
    `insert into "Subject"(id,name,code,"updatedAt") values ('sm','Matematika','M',now()),('scj','Čeština','CJ',now()),('sf','Fyzika','F',now())`
  );
  sql(
    `insert into "TeachingAssignment"(id,"teacherId","subjectId","classGroupId","schoolYearId") select 'ta1','usr_teacher','sm',c.id,y.id from "ClassGroup" c, "SchoolYear" y where c.grade=3 and c.letter='A' and y."isCurrent"`
  );
}

/** Školní rok (rok začátku), který je podle data aktuální – stejně jako v aplikaci a seedu. */
export function currentSchoolYear(date = new Date()) {
  return date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

export const yearLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;

export async function login(browser: Browser, email: string, password = "password123"): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await waitForAppHome(page);
  return page;
}

/**
 * Po přihlášení: učitel, admin a host skončí na /dashboard, student (F12) na zápisu, dopisování nebo prázdném stavu
 * (úvod „/“ rozhodne podle jeho záložek). Čeká, až adresa není ani přihlášení, ani úvod.
 */
export async function waitForAppHome(page: Page) {
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

/** Pokus o přihlášení bez čekání na úspěch (pro negativní testy). */
export async function tryLogin(browser: Browser, email: string, password = "password123"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForTimeout(2500);
  return page;
}

export const navLabels = async (page: Page) =>
  (await page.locator("header nav a").allInnerTexts()).map((s) => s.trim());

/** Text toastů (sonner) po akci. */
export async function toastText(page: Page) {
  await page.waitForTimeout(1500);
  return (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
}

export function tmpFile(name: string, content: string) {
  const file = path.join(os.tmpdir(), `seminaris-e2e-${name}`);
  fs.writeFileSync(file, content);
  return file;
}

/**
 * Dopisování studenta (F12): termíny se ukážou až po výběru předmětu (čip „Který předmět potřebujete dopsat?“).
 * Čip, který je už zvolený (nebo jediný), se znovu neklikne (druhý klik by výběr zrušil).
 */
export async function pickSubjectChip(page: Page, name: string) {
  const chip = page.locator("[data-subject-chip]", { hasText: name }).first();
  await chip.waitFor();
  if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
}

/**
 * Zápis seminářů studenta (F12): výskyt je vidět jen v rozbaleném bloku (při zápisu je rozbalený jediný, který je na
 * řadě). Najde výskyt podle textu a když v rozbaleném bloku není, postupně rozbaluje ostatní bloky.
 */
export async function occ(page: Page, text: string) {
  const find = () => page.locator("[data-occurrence]", { hasText: text }).first();
  await page.waitForSelector("[data-testid=block-toggle]");
  if ((await find().count()) === 0) {
    const toggles = page.locator("[data-testid=block-toggle]");
    const n = await toggles.count();
    for (let i = 0; i < n; i++) {
      const toggle = toggles.nth(i);
      if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
      if ((await find().count()) > 0) break;
    }
  }
  return find();
}
