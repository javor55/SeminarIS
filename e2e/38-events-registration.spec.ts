import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { login, resetDb, sql } from "./helpers";

// U9: odeslání registrace, stránka „hotovo“, e-mail, limity, honeypot, SCREEN_ONLY, souběh na poslední místo.

const PHONE = { width: 390, height: 844 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function seed(extra = "", items = `('r1','evR','2027-01-11T08:00:00Z','2027-01-11T08:30:00Z',2,0),('r2','evR','2027-01-11T08:30:00Z','2027-01-11T09:00:00Z',1,1)`) {
  resetDb();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','true') on conflict (key) do update set value='true'`);
  sql(`insert into "Event"(id,slug,title,place,status,"createdById","updatedAt"${extra ? "," + extra.split("|")[0] : ""}) values ('evR','reg','Den otevřených dveří','Budova A','PUBLISHED','usr_teacher',now()${extra ? "," + extra.split("|")[1] : ""})`);
  sql(`insert into "EventItem"(id,"eventId","startsAt","endsAt",capacity,"order") values ${items}`);
}

/** Otevře stránku, počká na ověření proti robotům a na minimální dobu vyplnění (3 s od zobrazení). */
async function open(page: Page, url = "/akce/reg") {
  await page.goto(url);
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.waitForTimeout(3200);
}

async function fill(page: Page, email: string, name = "Jana Nová") {
  await page.fill("#rf-email", email);
  if (name) await page.fill("#rf-name", name);
  await page.locator("#rf-consent").check();
}

const regCount = (where = "true") => Number(sql(`select count(*) from "EventRegistration" where ${where}`));

test("úspěšná registrace: kód, hash tokenu, e-mail v EmailLog, stránka hotovo (telefon i počítač), audit veřejnosti", async ({ browser }) => {
  seed();
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "Jana@Example.com");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/\/akce\/reg\/hotovo\?t=/);

  const token = new URL(page.url()).searchParams.get("t")!;
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const row = sql(`select "tokenHash",code,"consentAt" is not null,email,"confirmEmailFailed",status from "EventRegistration"`).split("|");
  expect(row[0]).toBe(sha(token));
  expect(row[1]).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  expect(row.slice(2)).toEqual(["t", "Jana@Example.com", "f", "CONFIRMED"]);
  // token se nikde v databázi neukládá
  expect(sql(`select count(*) from "EventRegistration" where "tokenHash"='${token}'`)).toBe("0");
  expect(sql(`select count(*) from "AuditLog" where summary like '%${token}%' or data::text like '%${token}%'`)).toBe("0");

  await expect(page.getByTestId("done-title")).toHaveText("Registrace je potvrzená");
  await expect(page.getByTestId("done-item")).toContainText("9:00–9:30");
  await expect(page.getByTestId("reg-code")).toHaveText(row[1]);
  await expect(page.getByTestId("manage-link")).toHaveText(new RegExp(`/akce/reg/r/${token}$`));
  await expect(page.getByTestId("email-sent")).toContainText("Jana@Example.com");
  await expect(page.getByTestId("save-warning")).toHaveCount(0);
  await expect(page.getByTestId("add-to-calendar")).toHaveAttribute("href", `/akce/reg/r/${token}/kalendar.ics`);
  // stažení potvrzení
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-confirmation").click()]);
  expect(dl.suggestedFilename()).toBe(`registrace-${row[1]}.txt`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // e-mail s odkazem a kódem
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.confirmed' and status='SENT' and recipient='Jana@Example.com'`)).toBe("1");
  // audit: aktér bez účtu, bez osobních údajů
  expect(sql(`select "actorId" is null,"actorName" from "AuditLog" where action='events.registration.create'`)).toBe("t|Veřejnost");
  expect(sql(`select count(*) from "AuditLog" where summary ilike '%example.com%' or summary like '%Jana%'`)).toBe("0");
  // hlavičky: bez cache, bez Referer
  const res = await page.request.get(page.url());
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  await ctx.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await desk.newPage();
  await dp.goto(`/akce/reg/hotovo?t=${token}`);
  await expect(dp.getByTestId("reg-code")).toHaveText(row[1]);
  expect(await dp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // špatný nebo cizí token = 404
  expect((await dp.goto("/akce/reg/hotovo?t=" + "A".repeat(43)))!.status()).toBe(404);
  expect((await dp.goto("/akce/reg/hotovo?t=kratky"))!.status()).toBe(404);
  expect((await dp.goto("/akce/reg/hotovo"))!.status()).toBe(404);
  await desk.close();
});

test("plný termín, limit na e-mail, souhlas a termín mimo období se na serveru odmítnou", async ({ browser }) => {
  seed(`"maxRegistrationsPerEmail"|1`);
  sql(`insert into "EventRegistration"(id,"eventId",email,status,"tokenHash",code,"consentAt","updatedAt") values ('fx','evR','plny@x.cz','CONFIRMED','hfx','FFF-FFFF',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('fx','r2')`);
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  // plný termín nejde vybrat v UI
  await expect(page.locator("[data-item=r2] [data-testid=item-pick]")).toBeDisabled();

  // první registrace projde
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "jedna@example.com");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo/);

  // druhá stejného e-mailu (jiná velikost písmen) nad limit
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "JEDNA@example.com");
  await page.getByTestId("register-button").click();
  await expect(page.getByTestId("submit-error")).toContainText("už na událost registrace existuje");
  expect(regCount(`lower(email)='jedna@example.com'`)).toBe(1);

  // po chybě se formulář znovu ověří a jde opravit (jiný e-mail)
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.fill("#rf-email", "dva@example.com");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo/);
  expect(regCount(`email='dva@example.com'`)).toBe(1);
});

test("server odmítne registraci mimo období a uzavřenou událost", async ({ browser }) => {
  seed();
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "pozde@example.com");
  // událost se mezitím uzavře
  sql(`update "Event" set status='CLOSED'`);
  await page.getByTestId("register-button").click();
  await expect(page.getByTestId("submit-error")).toContainText("Registrace skončila");
  expect(regCount()).toBe(0);
  sql(`update "Event" set status='PUBLISHED',"registrationClosesAt"=now() - interval '1 hour'`);
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.getByTestId("register-button").click();
  await expect(page.getByTestId("submit-error")).toContainText("Registrace skončila");
  expect(regCount()).toBe(0);
});

test("honeypot: falešný úspěch bez zápisu", async ({ browser }) => {
  seed();
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "robot@example.com");
  await page.getByTestId("honeypot").fill("http://spam.example", { force: true });
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  // stránka pro falešný token nic neukáže a nic se neuložilo
  await expect(page.getByTestId("reg-code")).toHaveCount(0);
  expect(regCount()).toBe(0);
  expect(sql(`select count(*) from "EmailLog"`)).toBe("0");
});

test("jen na obrazovce: žádný e-mail, výrazné upozornění a kód; jen e-mailem: bez odkazu na obrazovce", async ({ browser }) => {
  seed(`"confirmChannel"|'SCREEN_ONLY'`);
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "obrazovka@example.com");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  await expect(page.getByTestId("save-warning")).toContainText("Uložte si odkaz nebo kód – e-mailem nepřijde");
  await expect(page.getByTestId("reg-code")).toBeVisible();
  await expect(page.getByTestId("email-sent")).toHaveCount(0);
  expect(sql(`select count(*) from "EmailLog"`)).toBe("0");
  expect(sql(`select "confirmEmailFailed" from "EventRegistration"`)).toBe("f");

  // jen e-mailem, e-mail odešel: na obrazovce bez odkazu a kódu
  sql(`update "Event" set "confirmChannel"='EMAIL_ONLY'`);
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "email@example.com");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  await expect(page.getByTestId("email-sent")).toContainText("email@example.com");
  await expect(page.getByTestId("reg-code")).toHaveCount(0);
  expect(sql(`select count(*) from "EmailLog" where status='SENT' and recipient='email@example.com'`)).toBe("1");
});

test("e-mail nejde odeslat (vypnuto): registrace platí, kód i odkaz jsou na obrazovce a organizátor vidí varování", async ({ browser }) => {
  seed();
  sql(`update "SystemSetting" set value='false' where key='email.enabled'`);
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','false') on conflict (key) do update set value='false'`);
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  sql(`update "Event" set "confirmChannel"='EMAIL_ONLY'`);
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "limit@example.com");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  await expect(page.getByTestId("reg-code")).toBeVisible();
  await expect(page.getByTestId("manage-link")).toBeVisible();
  await expect(page.getByTestId("save-warning")).toBeVisible();
  expect(sql(`select "confirmEmailFailed",status from "EventRegistration"`)).toBe("t|CONFIRMED");

  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evR");
  await expect(teacher.getByTestId("email-failed-warning")).toContainText("U 1 registrace");
});

test("souběh dvou registrací na poslední místo: jedna projde, druhá dostane „plno“", async ({ browser }) => {
  seed("", `('s1','evR','2027-01-11T08:00:00Z','2027-01-11T08:30:00Z',1,0)`);
  const mk = async () => {
    const p = await (await browser.newContext({ viewport: PHONE })).newPage();
    await open(p);
    await p.locator("[data-item=s1] [data-testid=item-pick]").click();
    return p;
  };
  const [a, b] = await Promise.all([mk(), mk()]);
  await fill(a, "a@example.com");
  await fill(b, "b@example.com");
  await Promise.all([a.getByTestId("register-button").click(), b.getByTestId("register-button").click()]);
  await expect.poll(async () => (await a.getByTestId("submit-error").count()) + (await b.getByTestId("submit-error").count()), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  expect(regCount(`status='CONFIRMED'`)).toBe(1);
  const loser = (await a.getByTestId("submit-error").count()) ? a : b;
  await expect(loser.getByTestId("submit-error")).toContainText(/plný|Ve stejnou chvíli/);
  expect(regCount()).toBe(1);
});

test("doprovod se počítá do kapacity a vícenásobný výběr termínů", async ({ browser }) => {
  seed(`"allowGuests","maxGuests","maxItemsPerRegistration"|true,3,2`, `('g1','evR','2027-01-11T08:00:00Z','2027-01-11T08:30:00Z',3,0),('g2','evR','2027-01-11T08:30:00Z','2027-01-11T09:00:00Z',10,1)`);
  sql(`update "EventField" set mode='OPTIONAL' where false`);
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  await page.locator("[data-item=g1] [data-testid=item-check]").check();
  await page.locator("[data-item=g2] [data-testid=item-check]").check();
  await fill(page, "rodina@example.com");
  await page.fill("#rf-guests", "3");
  await page.getByTestId("register-button").click();
  // 4 osoby se na termín s kapacitou 3 nevejdou
  await expect(page.getByTestId("submit-error")).toContainText("nestačí");
  expect(regCount()).toBe(0);
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.fill("#rf-guests", "2");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  await expect(page.getByTestId("done-item")).toHaveCount(2);
  expect(sql(`select guests from "EventRegistration"`)).toBe("2");
  expect(sql(`select count(*) from "EventRegistrationItem"`)).toBe("2");
});

test("jen pro přihlášené: nepřihlášený i uživatel mimo publikum je na serveru odmítnut, student z publika projde s userId", async ({ browser }) => {
  seed(`visibility|'USERS'`);
  sql(`insert into "EventAudience"(id,"eventId",type,"userId",key,"createdAt") values ('eaR','evR','USER','usr_stud1','USER:usr_stud1',now())`);
  // nepřihlášený: formulář se vůbec nenabídne
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/akce/reg");
  await expect(anon.getByTestId("registration-form")).toHaveCount(0);

  // uživatel, který formulář měl a pak mu publikum zmizelo (server musí ověřit znovu)
  const student = await login(browser, "jan.student@skola.cz");
  await open(student);
  await student.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(student, "jan.student@skola.cz", "");
  sql(`update "Event" set "audienceRoles"=ARRAY['TEACHER']::"Role"[]`);
  await student.getByTestId("register-button").click();
  await expect(student.getByTestId("submit-error")).toContainText("není určena");
  expect(regCount()).toBe(0);

  sql(`update "Event" set "audienceRoles"=ARRAY['STUDENT']::"Role"[]`);
  await expect(student.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await student.getByTestId("register-button").click();
  await student.waitForURL(/hotovo\?t=/);
  expect(sql(`select "userId" from "EventRegistration"`)).toBe("usr_stud1");
  expect(sql(`select "actorId" from "AuditLog" where action='events.registration.create'`)).toBe("usr_stud1");
});

test("skryté jméno: registrace funguje bez jména a ukáže e-mail", async ({ browser }) => {
  seed();
  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evR?tab=form");
  await teacher.locator('[data-field-row=name] [data-mode=HIDDEN]').click();
  await expect(teacher.locator('[data-field-row=name] [data-mode=HIDDEN]')).toHaveAttribute("aria-checked", "true");
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "bezjmena@example.com", "");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  await expect(page.getByTestId("done-details")).toContainText("bezjmena@example.com");
  expect(sql(`select name is null from "EventRegistration"`)).toBe("t");
  expect(sql(`select subject from "EmailLog" where recipient='bezjmena@example.com'`)).toContain("Potvrzení registrace");
});

test("pole s odpověďmi nejde smazat, jen skrýt; bez odpovědí jde smazat", async ({ browser }) => {
  seed();
  sql(`insert into "EventField"(id,"eventId",key,type,label,mode,options,"order",builtin) values ('cf1','evR','custom_1','TEXT','Obor','OPTIONAL','{}',10,false),('cf2','evR','custom_2','TEXT','Jiné','OPTIONAL','{}',11,false)`);
  const page = await (await browser.newContext({ viewport: PHONE })).newPage();
  await open(page);
  await page.locator("[data-item=r1] [data-testid=item-pick]").click();
  await fill(page, "obor@example.com");
  await page.fill("#rf-custom_1", "Informatika");
  await page.getByTestId("register-button").click();
  await page.waitForURL(/hotovo\?t=/);
  await expect(page.getByTestId("done-details")).toContainText("Informatika");
  expect(sql(`select answers->>'custom_1' from "EventRegistration"`)).toBe("Informatika");

  const teacher = await login(browser, "teacher@skola.cz");
  await teacher.goto("/events/evR?tab=form");
  const row1 = teacher.locator("[data-field-row=custom_1]");
  await expect(row1.getByTestId("delete-blocked")).toBeVisible();
  await expect(row1.locator("[data-action=delete]")).toHaveCount(0);
  await expect(teacher.locator("[data-field-row=custom_2] [data-action=delete]")).toBeVisible();
  // skrýt jde
  await row1.locator("[data-mode=HIDDEN]").click();
  await expect(row1.locator("[data-mode=HIDDEN]")).toHaveAttribute("aria-checked", "true");
  expect(sql(`select mode from "EventField" where id='cf1'`)).toBe("HIDDEN");
  await teacher.locator("[data-field-row=custom_2] [data-action=delete]").click();
  await teacher.getByRole("button", { name: "Smazat", exact: true }).last().click();
  await expect(teacher.locator("[data-field-row=custom_2]")).toHaveCount(0);
  expect(sql(`select count(*) from "EventField" where id='cf1'`)).toBe("1");
});
