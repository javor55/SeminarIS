import { test, expect, type Browser, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { IMPERSONATION_COOKIE, signImpersonation } from "../lib/impersonation-token";
import { login, resetDb, sql, toastText } from "./helpers";

// U12: e-maily modulu v Upozorněních (statistika z EmailLog, čerpání limitů s odhadem), vypnutý typ e-mailu
// a hromadný e-mail účastníkům z detailu události (náhled počtu a limitu, jen část, oprávnění, audit).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// Fotky stránek (jen když je nastavená složka, např. U12_SHOTS=/tmp/u12-shots)
const SHOTS = process.env.U12_SHOTS;
async function shot(page: Page, name: string, selector?: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const original = page.viewportSize();
  for (const [label, size] of [["telefon", PHONE], ["pocitac", DESKTOP]] as const) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    if (selector) await page.locator(selector).first().screenshot({ path: `${SHOTS}/${name}-${label}.png` });
    else await page.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
}

const setting = (key: string, value: string) =>
  sql(`insert into "SystemSetting"(key,value) values ('${key}','${value}') on conflict (key) do update set value=excluded.value`);
const dayStart = `timezone('Europe/Prague', date_trunc('day', timezone('Europe/Prague', now())))`;
// poledne (Praha) dne s posunem 1 = zítra, 2 = pozítří
const noon = (days: number) => `(${dayStart} + interval '${days} days 12 hours')`;
const logCount = (where: string) => Number(sql(`select count(*) from "EmailLog" where ${where}`));

function addLog(event: string, status: string, ago: string, count = 1) {
  sql(`insert into "EmailLog"(id,recipient,event,subject,status,"createdAt") select 'lg_'||md5(random()::text||g::text),'x'||g||'@example.com','${event}','Předmět','${status}'::"EmailLogStatus", now() - interval '${ago}' from generate_series(1,${count}) g`);
}

function addEvent(id: string, slug: string, createdBy = "usr_teacher", extra = "") {
  sql(`insert into "Event"(id,slug,title,place,status,"createdById","updatedAt"${extra ? "," + extra.split("|")[0] : ""}) values ('${id}','${slug}','Událost ${id}','Budova A','PUBLISHED','${createdBy}',now()${extra ? "," + extra.split("|")[1] : ""})`);
}
function addItem(id: string, eventId: string, start: string, order = 0, extra = "") {
  sql(`insert into "EventItem"(id,"eventId","startsAt","endsAt","order"${extra ? ",label" : ""}) values ('${id}','${eventId}',${start}::timestamptz,${start}::timestamptz + interval '30 min',${order}${extra ? ",'" + extra + "'" : ""})`);
}
function addReg(id: string, eventId: string, email: string, itemId: string, opts: { name?: string | null; status?: string; minutesAgo?: number } = {}) {
  const status = opts.status ?? "CONFIRMED";
  sql(
    `insert into "EventRegistration"(id,"eventId",email,name,answers,status,"tokenHash",code,"consentAt","createdAt","updatedAt"${status === "CANCELLED" ? ',"cancelledAt"' : ""}) values ('${id}','${eventId}','${email}',${opts.name === null ? "null" : `'${opts.name ?? "Účastník " + id}'`},'{}'::jsonb,'${status}'::"EventRegistrationStatus",'${sha("t-" + id)}','${id.toUpperCase().replace(/[^A-Z0-9]/g, "X").padEnd(3, "X").slice(0, 3)}-${String(Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 10000).padStart(4, "0")}',now(),now() - interval '${opts.minutesAgo ?? 0} minutes',now()${status === "CANCELLED" ? ",now()" : ""})`
  );
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('${id}','${itemId}')`);
}

async function openPage(browser: Browser, email: string, url: string, viewport = DESKTOP): Promise<Page> {
  const page = await login(browser, email);
  await page.setViewportSize(viewport);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return page;
}

test("Upozornění: statistika z EmailLog, skupina Události, čerpání limitů a odhad na nejbližší dny", async ({ browser }) => {
  resetDb();
  setting("email.enabled", "true");
  setting("email.dailyLimit", "7");
  // EmailLog: dnes, před 10 dny, před 40 dny (mimo 30 dní), přeskočené kvůli limitu
  addLog("events.registration.confirmed", "SENT", "1 minute", 3);
  addLog("events.registration.confirmed", "SENT", "10 days", 2);
  addLog("events.registration.confirmed", "SENT", "40 days", 4);
  addLog("events.registration.confirmed", "SKIPPED_LIMIT", "2 minutes", 1);
  addLog("events.registration.changed", "SENT", "5 days", 1);
  addLog("events.registration.changed", "FAILED", "1 minute", 1);
  addLog("events.reminder", "SENT", "1 minute", 1);
  addLog("manual.bulk", "SENT", "1 minute", 2);
  addLog("makeup.reminder", "SENT", "5 days", 1);
  // odhad: zítřejší termín (2 registrace, jedna zrušená k nim nepatří) a pozítřejší (3 registrace)
  addEvent("evF", "forecast");
  addItem("f1", "evF", noon(1));
  addItem("f2", "evF", noon(2), 1);
  addReg("fa", "evF", "a@example.com", "f1");
  addReg("fb", "evF", "b@example.com", "f1");
  addReg("fc", "evF", "c@example.com", "f1", { status: "CANCELLED" });
  for (const id of ["fd", "fe", "ff"]) addReg(id, "evF", `${id}@example.com`, "f2");

  const page = await openPage(browser, "admin@skola.cz", "/admin/notifications");
  await expect(page.getByTestId("email-usage")).toBeVisible();

  // statistika odpovídá EmailLog (30 dní a dnes)
  const today = `"createdAt" >= ${dayStart}`;
  const last30 = `"createdAt" >= now() - interval '30 days'`;
  for (const id of ["events.registration.confirmed", "events.registration.changed", "events.reminder", "makeup.reminder"]) {
    const stats = page.getByTestId(`stats-${id}`);
    await expect(stats).toHaveAttribute("data-today", String(logCount(`event='${id}' and status='SENT' and ${today}`)));
    await expect(stats).toHaveAttribute("data-last30", String(logCount(`event='${id}' and status='SENT' and ${last30}`)));
  }
  await expect(page.getByTestId("stats-events.registration.confirmed")).toHaveAttribute("data-last30", "5");
  await expect(page.getByTestId("stats-events.registration.confirmed")).toContainText("kvůli limitu přeskočeno 1");
  // skupina Události = součet typů modulu (neodeslané a starší než 30 dní se nepočítají)
  const group = page.getByTestId("group-stats-Události");
  await expect(group).toHaveAttribute("data-today", String(logCount(`event like 'events.%' and status='SENT' and ${today}`)));
  await expect(group).toHaveAttribute("data-last30", String(logCount(`event like 'events.%' and status='SENT' and ${last30}`)));
  await expect(group).toHaveAttribute("data-last30", "7");
  // ruční e-maily (hromadný e-mail správce) mají statistiku zvlášť
  await expect(page.getByTestId("stats-manual.bulk")).toHaveAttribute("data-today", "2");

  // čerpání limitů: pruhy a čísla z EmailLog (dnes 6 odeslaných: 3 + 1 + 2)
  await expect(page.getByTestId("email-usage")).toContainText("Dnes 6 / 7");
  await expect(page.getByTestId("meter-daily").getByRole("img")).toHaveAttribute("aria-label", "Denní limit: odesláno 6 z 7");
  await expect(page.getByTestId("meter-monthly")).toContainText("Tento měsíc");

  // odhad: připomínka je ve výchozím stavu vypnutá, odhad ale ukáže, kolik by odešlo
  await expect(page.getByTestId("forecast-0")).toHaveAttribute("data-planned", "0");
  await expect(page.getByTestId("forecast-0").getByTestId("forecast-off-events.reminder")).toContainText("po zapnutí by odešlo 2");
  await expect(page.getByTestId("forecast-1").getByTestId("forecast-off-events.reminder")).toContainText("po zapnutí by odešlo 3");
  await expect(page.getByTestId("estimate-events.reminder")).toContainText("2");

  // po zapnutí se připomínky započtou: dnes 6 + 2 > 7, další den 3 ≤ 7
  await page.locator('[id="ev-events.reminder"]').click();
  expect(await toastText(page)).toContain("zapnuto");
  await expect(page.getByTestId("forecast-0")).toHaveAttribute("data-planned", "2");
  await expect(page.getByTestId("forecast-0")).toHaveAttribute("data-over", "1");
  await expect(page.getByTestId("forecast-0").getByTestId("forecast-over")).toContainText("Limit nestačí");
  await expect(page.getByTestId("forecast-1")).toHaveAttribute("data-planned", "3");
  await expect(page.getByTestId("forecast-1")).toHaveAttribute("data-over", "0");
  await shot(page, "upozorneni-statistika");
});

test("vypnutý typ e-mailu se neodešle a registrace přesto projde (kód je na obrazovce)", async ({ browser }) => {
  resetDb();
  setting("email.enabled", "true");
  addEvent("evR", "reg");
  addItem("r1", "evR", `'2027-01-11T08:00:00Z'`);

  // admin vypne potvrzení registrace v Upozorněních
  const admin = await openPage(browser, "admin@skola.cz", "/admin/notifications");
  await admin.locator('[id="ev-events.registration.confirmed"]').click();
  expect(await toastText(admin)).toContain("vypnuto");
  expect(sql(`select value from "SystemSetting" where key='email.event.events.registration.confirmed.enabled'`)).toBe("false");

  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/akce/reg");
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.waitForTimeout(3200);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await page.fill("#rf-email", "ucastnik@example.com");
  await page.fill("#rf-name", "Jana Nová");
  await page.locator("#rf-consent").check();
  await page.getByTestId("register-button").click();
  await page.waitForURL(/\/akce\/reg\/hotovo\?t=/);

  // registrace platí a kód je na obrazovce, e-mail se ale neodeslal
  const code = sql(`select code from "EventRegistration" where email='ucastnik@example.com'`);
  expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
  await expect(page.getByTestId("reg-code")).toHaveText(code);
  await expect(page.getByTestId("manage-link")).toBeVisible();
  expect(logCount(`event='events.registration.confirmed' and status='SENT'`)).toBe(0);
  expect(logCount(`event='events.registration.confirmed' and status='SKIPPED_DISABLED' and recipient='ucastnik@example.com'`)).toBe(1);
  expect(sql(`select "confirmEmailFailed" from "EventRegistration" where email='ucastnik@example.com'`)).toBe("t");
  await ctx.close();

  // statistika typu zůstává 0 odeslaných
  await admin.reload();
  await expect(admin.getByTestId("stats-events.registration.confirmed")).toHaveAttribute("data-last30", "0");
});

/** Událost evB (autor učitel Petr): termín b1 (zítra) a b2 (pozítří); 6 registrací na b1, 2 na b2. */
function seedBulk() {
  resetDb();
  setting("email.enabled", "true");
  sql(`insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`);
  addEvent("evB", "bulk");
  addItem("b1", "evB", noon(1));
  addItem("b2", "evB", noon(2), 1);
  addReg("g1", "evB", "jana@example.com", "b1", { name: "Jana Nováková", minutesAgo: 100 });
  addReg("g2", "evB", "petr@example.com", "b1", { name: "<script>alert(1)</script>", minutesAgo: 90 });
  addReg("g3", "evB", "eva@example.com", "b1", { name: null, minutesAgo: 80 });
  addReg("g4", "evB", "dup@example.com", "b1", { minutesAgo: 70 });
  addReg("g5", "evB", "DUP@example.com", "b1", { minutesAgo: 60 });
  addReg("g6", "evB", "zrusena@example.com", "b1", { status: "CANCELLED", minutesAgo: 50 });
  addReg("g7", "evB", "smazano-g7@anonym.invalid", "b1", { name: null, minutesAgo: 40 });
  addReg("g8", "evB", "marie@example.com", "b2", { minutesAgo: 30 });
  addReg("g9", "evB", "karel@example.com", "b2", { minutesAgo: 20 });
}

test("hromadný e-mail: rozsah, náhled počtu a limitu, jen část při nedostatku limitu, audit", async ({ browser }) => {
  seedBulk();
  const page = await openPage(browser, "teacher@skola.cz", "/events/evB?tab=registrations", PHONE);
  await page.getByTestId("bulk-email").click();
  const dialog = page.getByTestId("dialog-bulk-email");
  await expect(dialog).toBeVisible();

  // všem aktivním: Jana, Petr, Eva, dup (jednou), Marie, Karel; bez zrušené, smazané a opakované adresy
  await expect(page.getByTestId("bulk-recipients")).toHaveAttribute("data-count", "6");
  await expect(page.getByTestId("bulk-skipped").filter({ hasText: "osobní údaje už jsou smazané" })).toContainText("Přeskočeno 1");
  await expect(page.getByTestId("bulk-skipped").filter({ hasText: "stejná adresa" })).toContainText("Přeskočeno 1");
  await expect(page.getByTestId("bulk-limit")).toContainText("Vejde se ještě 90");
  await expect(page.getByTestId("bulk-send")).toBeDisabled();

  // jeden termín
  await page.getByTestId("bulk-scope").selectOption("b2");
  await expect(page.getByTestId("bulk-recipients")).toHaveAttribute("data-count", "2");
  await page.getByTestId("bulk-scope").selectOption("");
  await expect(page.getByTestId("bulk-recipients")).toHaveAttribute("data-count", "6");

  // limit nestačí: denní limit 4 a 1 e-mail už dnes odešel → vejdou se 3
  setting("email.dailyLimit", "4");
  addLog("test", "SENT", "1 minute", 1);
  await page.getByTestId("bulk-scope").selectOption("b1");
  await page.getByTestId("bulk-scope").selectOption("");
  await expect(page.getByTestId("bulk-limit")).toHaveAttribute("data-room", "3");
  await expect(page.getByTestId("bulk-over")).toContainText("vejde se jen 3");
  await expect(page.getByTestId("bulk-send")).toContainText("Poslat jen prvním 3");
  await expect(page.getByTestId("bulk-cancel")).toContainText("Zrušit odeslání");
  await page.getByTestId("bulk-subject").fill("Změna programu");
  await page.getByTestId("bulk-body").fill("Dobrý den, {{jmeno}},\n\nprogram <b>akce</b> se mění. Kód: {{kod}}.");
  await shot(page, "hromadny-email-dialog", "[data-testid=dialog-bulk-email]");

  // neznámá proměnná se odmítne a nic se neodešle
  await page.getByTestId("bulk-body").fill("Heslo: {{heslo}}");
  await page.getByTestId("bulk-send").click();
  expect(await toastText(page)).toContain("{{heslo}}");
  expect(logCount(`event='manual.bulk'`)).toBe(0);
  await page.getByTestId("bulk-body").fill("Dobrý den, {{jmeno}},\n\nprogram <b>akce</b> se mění. Kód: {{kod}}.");

  // jen část: prvním třem (nejstarším) registracím
  await page.getByTestId("bulk-send").click();
  await expect.poll(() => logCount(`event='manual.bulk' and status='SENT'`)).toBe(3);
  expect(sql(`select string_agg(recipient, ',' order by recipient) from "EmailLog" where event='manual.bulk'`)).toBe("jana@example.com,petr@example.com,eva@example.com".split(",").sort().join(","));
  expect(logCount(`event='manual.bulk' and status<>'SENT'`)).toBe(0);
  // audit: souhrn bez adres a osobních údajů
  const audit = sql(`select summary||'|'||data::text from "AuditLog" where action='events.bulk_email'`);
  expect(audit).toContain("odesláno 3 z 3");
  expect(audit).toContain("vynecháno kvůli limitu");
  expect(audit).not.toContain("@");
  expect(sql(`select "actorId" from "AuditLog" where action='events.bulk_email'`)).toBe("usr_teacher");

  // limit je vyčerpán: náhled to ukáže a odeslání není možné
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("bulk-email").click();
  await expect(page.getByTestId("bulk-blocked")).toContainText("limit");
  await expect(page.getByTestId("bulk-send")).toBeDisabled();
  await page.keyboard.press("Escape");

  // po zvýšení limitu jde zpráva jednomu termínu; statistika v Upozorněních počítá hromadný e-mail
  setting("email.dailyLimit", "90");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("bulk-email").click();
  await page.getByTestId("bulk-scope").selectOption("b2");
  await expect(page.getByTestId("bulk-recipients")).toHaveAttribute("data-count", "2");
  await page.getByTestId("bulk-subject").fill("Připomenutí");
  await page.getByTestId("bulk-body").fill("Ahoj {{jmeno}}.");
  await page.getByTestId("bulk-send").click();
  await expect.poll(() => logCount(`event='manual.bulk' and status='SENT'`)).toBe(5);
  expect(logCount(`event='manual.bulk' and recipient in ('marie@example.com','karel@example.com') and subject='Připomenutí'`)).toBe(2);
  expect(Number(sql(`select count(*) from "AuditLog" where action='events.bulk_email'`))).toBe(2);
  const admin = await openPage(browser, "admin@skola.cz", "/admin/notifications");
  await expect(admin.getByTestId("stats-manual.bulk")).toHaveAttribute("data-last30", "5");
});

test("hromadný e-mail: vypnuté e-maily, smazané údaje, oprávnění a režim zobrazit jako", async ({ browser }) => {
  seedBulk();
  // hlavní vypínač vypnutý: zpráva se neodešle
  setting("email.enabled", "false");
  const teacher = await openPage(browser, "teacher@skola.cz", "/events/evB?tab=registrations");
  await teacher.getByTestId("bulk-email").click();
  await expect(teacher.getByTestId("bulk-blocked")).toContainText("vypnutá");
  await expect(teacher.getByTestId("bulk-send")).toBeDisabled();
  await teacher.keyboard.press("Escape");
  setting("email.enabled", "true");

  // událost po smazání osobních údajů: nikdo, komu by šlo psát
  addEvent("evP", "purged");
  addItem("p1", "evP", noon(1));
  addReg("pa", "evP", "smazano-pa@anonym.invalid", "p1", { name: null });
  addReg("pb", "evP", "smazano-pb@anonym.invalid", "p1", { name: null });
  sql(`update "Event" set "purgedAt"=now() where id='evP'`);
  await teacher.goto("/events/evP?tab=registrations");
  await teacher.getByTestId("bulk-email").click();
  await expect(teacher.getByTestId("bulk-recipients")).toHaveAttribute("data-count", "0");
  await expect(teacher.getByTestId("bulk-skipped")).toContainText("Přeskočeno 2");
  await expect(teacher.getByTestId("bulk-blocked")).toBeVisible();
  await expect(teacher.getByTestId("bulk-send")).toBeDisabled();
  await teacher.context().close();

  // spoluorganizátor smí, cizí učitel událost nevidí
  const other = await login(browser, "teacher.b@skola.cz");
  expect((await other.goto("/events/evB?tab=registrations"))!.status()).toBe(404);
  await other.context().close();
  sql(`insert into "EventOrganizer"("eventId","userId") values ('evB','usr_teacher_b')`);
  const co = await openPage(browser, "teacher.b@skola.cz", "/events/evB?tab=registrations");
  await co.getByTestId("bulk-email").click();
  await expect(co.getByTestId("bulk-recipients")).toHaveAttribute("data-count", "6");
  await co.getByTestId("bulk-subject").fill("Od spoluorganizátora");
  await co.getByTestId("bulk-body").fill("Text");
  await co.getByTestId("bulk-send").click();
  await expect.poll(() => logCount(`event='manual.bulk' and status='SENT'`)).toBe(6);
  expect(sql(`select "actorId" from "AuditLog" where action='events.bulk_email'`)).toBe("usr_teacher_b");
  await co.context().close();

  // admin spravuje všechno; v režimu „zobrazit jako“ je jen čtení (tlačítko chybí)
  const admin = await openPage(browser, "admin@skola.cz", "/events/evB?tab=registrations");
  await expect(admin.getByTestId("bulk-email")).toBeVisible();
  const cookie = await signImpersonation({ a: "usr_admin", t: "usr_teacher", r: "TEACHER", exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.NEXTAUTH_SECRET!);
  await admin.context().addCookies([{ name: IMPERSONATION_COOKIE, value: cookie, domain: "localhost", path: "/" }]);
  await admin.goto("/events/evB?tab=registrations");
  await admin.waitForLoadState("networkidle");
  await expect(admin.getByTestId("impersonation-banner")).toBeVisible();
  await expect(admin.getByTestId("registrations-tab")).toBeVisible();
  await expect(admin.getByTestId("bulk-email")).toHaveCount(0);
  expect(logCount(`event='manual.bulk'`)).toBe(6);

  // archivovaná událost: jen čtení
  sql(`update "Event" set status='ARCHIVED' where id='evB'`);
  const arch = await openPage(browser, "teacher@skola.cz", "/events/evB?tab=registrations");
  await expect(arch.getByTestId("bulk-email")).toHaveCount(0);
});
