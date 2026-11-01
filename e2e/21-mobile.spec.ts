import { test, expect, devices, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, toastText } from "./helpers";

// F11: mobilní zobrazení (390×844). Pod breakpointem `md` jsou tabulky nahrazené kartami (vykreslí se jen jedna
// varianta podle matchMedia, viz lib/use-is-mobile.ts), takže tu na rozdíl od ostatních specifikací hledáme `div`
// karty (`[data-session]`, `[data-occurrence]`), ne `tr`. Kontroly: stránka nepřetéká do šířky, tlačítka jsou celá
// ve viewportu (a vysoká aspoň 44 px) a zápis na seminář i dopisování z telefonu funguje.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const WINDOW = "enr_ls_2025";
// Telefon 390×844 v Chromiu (z profilu iPhonu jen user agent a poměr pixelů; WebKit se v prostředí neinstaluje)
const iphone = {
  userAgent: devices["iPhone 14"].userAgent,
  deviceScaleFactor: 3,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};
test.use(iphone);

async function mobileLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Tlačítko je celé uvnitř viewportu (vodorovně) a vysoké aspoň 44 px. */
async function insideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  const vw = page.viewportSize()!.width;
  return { ok: !!box && box.x >= 0 && box.x + box.width <= vw && box.height >= 44, box };
}

test("mobil: student se zapíše na seminář a na dopisování, nic neutíká do strany", async ({ browser }) => {
  resetDb();
  seedSubjects();
  sql(
    `insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('mA','usr_teacher',now()+interval '3 days',now()+interval '3 days 45 min','101',5,60,'usr_teacher',now())`
  );
  sql(`insert into "MakeupSessionSubject" values ('mA','sm'),('mA','scj')`);

  const ctx = await browser.newContext(iphone);
  const page = await ctx.newPage();
  await mobileLogin(page, "jan.student@skola.cz");

  // --- Zápis do okna: karty místo tabulky
  await page.goto("/zapisy/" + WINDOW);
  await page.waitForSelector("[data-occurrence]");
  check("seminars: cards, no table", (await page.locator("main table").count()) === 0 && (await page.locator("[data-occurrence]").count()) > 0);
  check("seminars: no horizontal overflow", (await overflow(page)) <= 0, String(await overflow(page)));
  // Jan je v bloku 1 už zapsaný (seed), zapisuje se tedy do prázdného bloku 2
  const enroll = page.locator('[data-occurrence="occ_iot_b2"] [data-testid="enroll-button"]');
  await enroll.scrollIntoViewIfNeeded();
  const eb = await insideViewport(page, '[data-occurrence="occ_iot_b2"] [data-testid="enroll-button"]');
  check("seminars: enroll button inside viewport and >= 44 px", eb.ok, JSON.stringify(eb.box));
  const occId = "occ_iot_b2";
  await enroll.click();
  const t1 = await toastText(page);
  const card = page.locator(`[data-occurrence="${occId}"]`);
  await expect(card.getByTestId("unenroll-button")).toBeVisible();
  check("seminars: enrolled via mobile", Number(sql(`select count(*) from "StudentEnrollment" where "subjectOccurrenceId"='${occId}' and "deletedAt" is null`)) === 1, t1);
  check("seminars: card shows Zapsáno", (await card.innerText()).includes("Zapsáno"));
  const ub = await insideViewport(page, `[data-occurrence="${occId}"] [data-testid="unenroll-button"]`);
  check("seminars: unenroll button inside viewport", ub.ok, JSON.stringify(ub.box));
  check("seminars: still no overflow", (await overflow(page)) <= 0);

  // --- Dopisování: karty, zápis přes dialog
  await page.goto("/makeup");
  await page.waitForSelector('[data-testid="makeup-cards"]');
  check("makeup: cards, no table", (await page.locator("main table").count()) === 0);
  check("makeup: no horizontal overflow", (await overflow(page)) <= 0, String(await overflow(page)));
  const reg = page.locator('[data-session="mA"]').getByRole("button", { name: "Zapsat se" });
  await reg.scrollIntoViewIfNeeded();
  const rb = await insideViewport(page, '[data-session="mA"] button:has-text("Zapsat se")');
  check("makeup: register button inside viewport and >= 44 px", rb.ok, JSON.stringify(rb.box));
  const text = await page.locator('[data-session="mA"]').innerText();
  check("makeup: card shows room, supervisor, subjects, capacity", text.includes("101") && text.includes("Učitel Petr") && text.includes("Matematika") && text.includes("Čeština") && text.includes("0/5"), text);
  await reg.click();
  await page.locator("#reg-subjects [data-subject=M]").check();
  await page.fill("#reg-note", "z telefonu");
  const submit = await insideViewport(page, "[data-testid=reg-submit]");
  check("makeup: dialog submit inside viewport", submit.box !== null && submit.box.x >= 0 && submit.box.x + submit.box.width <= 390, JSON.stringify(submit.box));
  await page.click("[data-testid=reg-submit]");
  const t2 = await toastText(page);
  const mine = page.locator('[data-session="mA"]');
  await expect(mine).toHaveAttribute("data-registered", "true");
  check("makeup: registered via mobile", Number(sql(`select count(*) from "MakeupRegistration" where "sessionId"='mA'`)) === 1, t2);
  const after = await mine.innerText();
  check("makeup: registered card shows chosen subject and note", after.includes("Matematika") && after.includes("z telefonu") && after.includes("Zapsáno"), after);
  for (const name of ["Upravit", "Přepsat", "Odhlásit"]) {
    const b = await insideViewport(page, `[data-session="mA"] button:has-text("${name}")`);
    check(`makeup: ${name} inside viewport`, b.ok, JSON.stringify(b.box));
  }
  check("makeup: still no overflow", (await overflow(page)) <= 0);

  await ctx.close();
});

test("mobil: učitel – dopisování a detail termínu bez vodorovného posouvání", async ({ browser }) => {
  const ctx = await browser.newContext(iphone);
  const page = await ctx.newPage();
  await mobileLogin(page, "teacher@skola.cz");
  await page.goto("/makeup");
  await page.waitForSelector('[data-testid="my-sessions"] [data-session="mA"]');
  check("teacher: no overflow on /makeup", (await overflow(page)) <= 0, String(await overflow(page)));
  const manage = await insideViewport(page, '[data-testid="my-sessions"] [data-session="mA"] a:has-text("Spravovat")');
  check("teacher: manage link inside viewport", manage.ok, JSON.stringify(manage.box));
  await page.goto("/makeup/sessions/mA");
  await page.waitForSelector('[data-testid="registrations-cards"]');
  check("teacher: no overflow on session detail", (await overflow(page)) <= 0, String(await overflow(page)));
  await ctx.close();
});
