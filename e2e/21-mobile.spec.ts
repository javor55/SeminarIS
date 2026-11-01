import { test, expect, devices, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, toastText, waitForAppHome } from "./helpers";

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
  await waitForAppHome(page);
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

  // --- Úvod: Jan má v zápisu nedokončený blok, takže po přihlášení přistane tam; dole jsou dvě záložky
  check("mobile: lands on the enrollment", page.url().endsWith("/zapisy/" + WINDOW), page.url());
  const nav = page.getByTestId("student-bottom-nav");
  await expect(nav).toBeVisible();
  check("mobile: two tabs in the bottom bar, each >= 44 px and inside the viewport", (await nav.locator("a").count()) === 2 && (await Promise.all([0, 1].map(async (i) => (await nav.locator("a").nth(i).boundingBox())!))).every((b) => b.height >= 44 && b.x >= 0 && b.x + b.width <= 390));
  check("mobile: dot on Zápis seminářů (not finished)", (await nav.locator('a[data-tab="seminars.windows"] [data-testid=tab-attention]').count()) === 1 && (await nav.locator('a[data-tab="makeup.sessions"] [data-testid=tab-attention]').count()) === 0);
  check("mobile: no desktop tabs in the header, account menu is a circle with initials", (await page.locator("header nav a:visible").count()) === 0 && (await page.getByTestId("account-menu").innerText()) === "JS");
  check("seminars: cards, no table", (await page.locator("main table").count()) === 0 && (await page.locator("[data-occurrence]").count()) > 0);
  check("seminars: no horizontal overflow", (await overflow(page)) <= 0, String(await overflow(page)));
  // Jan je v bloku 1 už zapsaný (seed), zapisuje se tedy do bloku 2, který je právě na řadě
  const occId = "occ_iot_b2";
  const sel = `[data-occurrence="${occId}"] [data-testid="enroll-button"]`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  const eb = await insideViewport(page, sel);
  check("seminars: enroll button inside viewport and >= 44 px", eb.ok, JSON.stringify(eb.box));
  await page.locator(sel).click();
  const t1 = await toastText(page);
  check("seminars: enrolled via mobile", Number(sql(`select count(*) from "StudentEnrollment" where "subjectOccurrenceId"='${occId}' and "deletedAt" is null`)) === 1, t1);
  // hotový blok se sbalí a lepivá lišta ohlásí kompletní zápis, tečka u záložky zmizí
  await expect(page.getByTestId("enrollment-status-bar")).toHaveAttribute("data-complete", "true");
  check("seminars: sticky bar says the enrollment is complete", (await page.getByTestId("enrollment-status-bar").innerText()).includes("Zápis je kompletní"));
  await expect(nav.locator('a[data-tab="seminars.windows"] [data-testid=tab-attention]')).toHaveCount(0);
  await page.locator('[data-block="blk_2"] [data-testid=block-toggle]').click();
  const card = page.locator(`[data-occurrence="${occId}"]`);
  check("seminars: card shows Vybráno", (await card.innerText()).includes("Vybráno"));
  const ub = await insideViewport(page, `[data-occurrence="${occId}"] [data-testid="unenroll-button"]`);
  check("seminars: unenroll button inside viewport", ub.ok, JSON.stringify(ub.box));
  check("seminars: still no overflow", (await overflow(page)) <= 0);

  // --- Dopisování přes spodní lištu: čipy předmětů, termín na kartě, zápis přes dialog s poznámkou
  await nav.locator('a[data-tab="makeup.sessions"]').click();
  await page.waitForSelector('[data-testid="subject-chips"]');
  check("makeup: cards, no table, no overflow", (await page.locator("main table").count()) === 0 && (await overflow(page)) <= 0, String(await overflow(page)));
  const chip = await insideViewport(page, '[data-subject-chip]');
  check("makeup: subject chip >= 44 px", chip.ok, JSON.stringify(chip.box));
  await page.locator("[data-subject-chip]", { hasText: "Matematika" }).click();
  const reg = page.locator('[data-session="mA"]').getByRole("button", { name: "Přihlásit se" });
  await reg.scrollIntoViewIfNeeded();
  const rb = await insideViewport(page, '[data-session="mA"] button:has-text("Přihlásit se")');
  check("makeup: register button inside viewport and >= 44 px", rb.ok, JSON.stringify(rb.box));
  const text = await page.locator('[data-session="mA"]').innerText();
  check("makeup: card shows room, supervisor, subjects, free places", text.includes("101") && text.includes("Učitel Petr") && text.includes("Matematika") && text.includes("Čeština") && text.includes("5 volných míst"), text);
  await reg.click();
  check("makeup: subject is prefilled in the dialog", await page.locator("#reg-subjects [data-subject=M]").isChecked());
  await page.fill("#reg-note", "z telefonu");
  const submit = await insideViewport(page, "[data-testid=reg-submit]");
  check("makeup: dialog submit inside viewport", submit.box !== null && submit.box.x >= 0 && submit.box.x + submit.box.width <= 390, JSON.stringify(submit.box));
  await page.click("[data-testid=reg-submit]");
  const t2 = await toastText(page);
  check("makeup: registered via mobile", Number(sql(`select count(*) from "MakeupRegistration" where "sessionId"='mA'`)) === 1, t2);
  const mine = page.locator('[data-registration][data-session-id="mA"]');
  const after = await mine.innerText();
  check("makeup: my registration card shows chosen subject and note", after.includes("Matematika") && after.includes("z telefonu") && after.includes("Zapsáno"), after);
  for (const name of ["Upravit", "Přepsat", "Odhlásit se"]) {
    const b = await insideViewport(page, `[data-registration][data-session-id="mA"] button:has-text("${name}")`);
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
