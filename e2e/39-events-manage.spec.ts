import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { resetDb, sql } from "./helpers";

// U10: správa registrace účastníkem (odkaz s tokenem, změna termínu, úprava údajů, zrušení, uzávěrka,
// „Už jste registrovaní?“ přes kód + e-mail, .ics, hlavičky a e-mail o změně).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tok = (c: string) => c.repeat(43);
const T1 = tok("A");
const T2 = tok("B");
// Fotky stránek (jen když je nastavená složka, např. U10_SHOTS=/tmp/u10-shots)
const SHOTS = process.env.U10_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const original = page.viewportSize();
  for (const [label, size] of [["telefon", PHONE], ["pocitac", DESKTOP]] as const) {
    await page.setViewportSize(size);
    await page.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
};

/** Událost s třemi termíny: r1 (volno 2), r2 (volno 1), r3 (plný, jedno místo obsazené) a registrací `T1` na r1. */
function seed(eventExtra = "", opts: { guests?: number } = {}) {
  resetDb();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','true') on conflict (key) do update set value='true'`);
  sql(
    `insert into "Event"(id,slug,title,place,contact,status,"maxItemsPerRegistration","allowGuests","maxGuests","createdById","updatedAt"${eventExtra ? "," + eventExtra.split("|")[0] : ""}) values ('evM','man','Den otevřených dveří','Budova A','info@skola.cz','PUBLISHED',1,true,2,'usr_teacher',now()${eventExtra ? "," + eventExtra.split("|")[1] : ""})`
  );
  sql(
    `insert into "EventItem"(id,"eventId","startsAt","endsAt",capacity,"order") values ('r1','evM',now() + interval '10 days',now() + interval '10 days 30 min',2,0),('r2','evM',now() + interval '10 days 30 min',now() + interval '10 days 1 hour',1,1),('r3','evM',now() + interval '10 days 1 hour',now() + interval '10 days 90 min',1,2)`
  );
  sql(`insert into "EventRegistration"(id,"eventId",email,name,guests,status,"tokenHash",code,"consentAt","updatedAt") values ('g1','evM','jana@example.com','Jana Nová',${opts.guests ?? 0},'CONFIRMED','${sha(T1)}','AAA-2222',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('g1','r1')`);
  sql(`insert into "EventRegistration"(id,"eventId",email,status,"tokenHash",code,"consentAt","updatedAt") values ('g2','evM','plny@example.com','CONFIRMED','${sha(T2)}','BBB-3333',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('g2','r3')`);
}

const reg = (col: string, id = "g1") => sql(`select ${col} from "EventRegistration" where id='${id}'`);
const items = (id = "g1") => sql(`select string_agg("itemId", ',' order by "itemId") from "EventRegistrationItem" where "registrationId"='${id}'`);

test("změna termínu: kapacita, e-mail, audit veřejnosti, bez tokenu v logu (telefon i počítač)", async ({ browser }) => {
  seed();
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/akce/man/r/${T1}`);
  await expect(page.getByTestId("manage-title")).toHaveText("Vaše registrace");
  await expect(page.getByTestId("manage-page")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("manage-item")).toHaveCount(1);
  await expect(page.getByTestId("reg-code")).toHaveText("AAA-2222");
  await expect(page.getByTestId("deadline-info")).toBeVisible();
  await expect(page.getByTestId("add-to-calendar")).toHaveAttribute("href", `/akce/man/r/${T1}/kalendar.ics`);
  await shot(page, "sprava");

  await page.getByTestId("action-change").click();
  await expect(page.getByTestId("panel-change")).toBeVisible();
  // plný termín (r3) jde jen zobrazit, vlastní termín je označený
  await expect(page.locator("[data-item=r3] [data-testid=item-pick]")).toBeDisabled();
  await expect(page.locator("[data-item=r1] [data-testid=item-own]")).toBeVisible();
  await expect(page.getByTestId("save-items")).toBeDisabled();
  await shot(page, "zmena-terminu");
  await page.locator("[data-item=r2] [data-testid=item-pick]").click();
  await page.getByTestId("save-items").click();
  await expect(page.getByTestId("manage-notice")).toContainText("Termín jsme změnili");
  await expect.poll(() => items()).toBe("r2");

  // audit: veřejný aktér, bez osobních údajů a bez tokenu
  expect(sql(`select "actorId" is null,"actorName" from "AuditLog" where action='events.registration.change_items'`)).toBe("t|Veřejnost");
  expect(sql(`select count(*) from "AuditLog" where summary like '%${T1}%' or data::text like '%${T1}%' or summary ilike '%example.com%'`)).toBe("0");
  // e-mail o změně
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.changed' and status='SENT' and recipient='jana@example.com'`)).toBe("1");
  await ctx.close();

  // r2 má kapacitu 1 a je teď obsazený: druhý účastník na něj nepřejde; kapacita počítá doprovod
  const desk = await browser.newContext({ viewport: DESKTOP });
  const dp = await desk.newPage();
  await dp.goto(`/akce/man/r/${T2}`);
  await dp.getByTestId("action-change").click();
  await expect(dp.locator("[data-item=r2] [data-testid=item-pick]")).toBeDisabled();
  await expect(dp.locator("[data-item=r2] [data-testid=item-full]")).toBeVisible();
  await desk.close();
});

test("změna termínu s doprovodem se vejde jen do volných míst a kontroluje se na serveru", async ({ browser }) => {
  seed("", { guests: 1 });
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await page.goto(`/akce/man/r/${T1}`);
  await page.getByTestId("action-change").click();
  // r2 má volné jedno místo, registrace s doprovodem potřebuje dvě
  await expect(page.locator("[data-item=r2] [data-testid=item-pick]")).toBeDisabled();
  // kapacita se zvětší, přejít jde; mezitím ale místo na r2 obsadí někdo jiný a server změnu odmítne
  sql(`update "EventItem" set capacity=2 where id='r2'`);
  await page.reload();
  await page.getByTestId("action-change").click();
  await page.locator("[data-item=r2] [data-testid=item-pick]").click();
  sql(`insert into "EventRegistration"(id,"eventId",email,status,"tokenHash",code,"consentAt","updatedAt") values ('g3','evM','jiny@example.com','CONFIRMED','${sha(tok("C"))}','CCC-4444',now(),now())`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('g3','r2')`);
  await page.getByTestId("save-items").click();
  await expect(page.getByTestId("manage-error")).toContainText("doprovod nestačí");
  expect(items()).toBe("r1");
});

test("úprava údajů: validace, zápis a skryté hodnoty zůstanou", async ({ browser }) => {
  seed();
  sql(`update "EventRegistration" set answers='{"custom_1":"stará","phone":"123456789"}'::jsonb where id='g1'`);
  sql(`insert into "EventField"(id,"eventId",key,type,label,mode,options,"order",builtin) values ('f1','evM','custom_1','TEXT','Poznámka k návštěvě','OPTIONAL',ARRAY[]::text[],10,false),('f2','evM','phone','TEXT','Telefon','HIDDEN',ARRAY[]::text[],5,true)`);
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true })).newPage();
  await page.goto(`/akce/man/r/${T1}`);
  await page.getByTestId("action-edit").click();
  await expect(page.locator("#mf-custom_1")).toHaveValue("stará");
  await page.fill("#mf-name", "");
  await page.fill("#mf-guests", "9");
  await page.getByTestId("save-edit").click();
  await expect(page.getByTestId("error-guests")).toBeVisible();
  // 2 osoby navíc = 3 místa, termín má kapacitu 2: server odmítne
  await page.fill("#mf-guests", "2");
  await page.fill("#mf-name", "Jana Nováková");
  await page.getByTestId("save-edit").click();
  await expect(page.getByTestId("manage-error")).toContainText("doprovod nestačí");
  expect(reg("guests")).toBe("0");
  await page.fill("#mf-guests", "1");
  await page.fill("#mf-custom_1", "nová");
  await page.getByTestId("save-edit").click();
  await expect(page.getByTestId("manage-notice")).toContainText("Údaje jsme uložili");
  await expect.poll(() => reg("name")).toBe("Jana Nováková");
  expect(reg("guests")).toBe("1");
  // skryté pole (telefon) zůstalo, upravené se přepsalo
  expect(reg(`answers->>'custom_1'`)).toBe("nová");
  expect(reg(`answers->>'phone'`)).toBe("123456789");
  // e-mail se nemění
  expect(reg("email")).toBe("jana@example.com");
  await expect(page.getByTestId("manage-details")).toContainText("Jana Nováková");
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.update'`)).toBe("1");
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.changed'`)).toBe("1");
});

test("zrušení registrace: potvrzení, CANCELLED a cancelledAt, uvolnění místa, e-mail", async ({ browser }) => {
  seed();
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/akce/man/r/${T1}`);
  await page.getByTestId("action-cancel").click();
  await expect(page.getByTestId("panel-cancel")).toBeVisible();
  await shot(page, "zruseni");
  // ponechání nic nezmění
  await page.getByTestId("keep-registration").click();
  await expect(page.getByTestId("panel-cancel")).toHaveCount(0);
  expect(reg("status")).toBe("CONFIRMED");

  await page.getByTestId("action-cancel").click();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("manage-title")).toHaveText("Registrace byla zrušena");
  await expect(page.getByTestId("manage-page")).toHaveAttribute("data-state", "cancelled");
  expect(reg(`status || '|' || ("cancelledAt" is not null)`)).toBe("CANCELLED|true");
  expect(sql(`select "actorName" from "AuditLog" where action='events.registration.cancel'`)).toBe("Veřejnost");
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.changed' and status='SENT'`)).toBe("1");
  // místo se uvolnilo: na veřejné stránce je r1 volný celý (2 z 2)
  await page.goto("/akce/man");
  await expect(page.locator("[data-item=r1] [data-testid=item-free]")).toContainText("Volno: 2 z 2");
  // zrušenou registraci už nejde měnit ani stáhnout kalendář; opakované zrušení serverem selže
  expect((await page.request.get(`/akce/man/r/${T1}/kalendar.ics`)).status()).toBe(404);
  await ctx.close();

  const desk = await browser.newContext({ viewport: DESKTOP });
  const dp = await desk.newPage();
  await dp.goto(`/akce/man/r/${T1}`);
  await shot(dp, "zruseno");
  await expect(dp.getByTestId("cancelled-info")).toBeVisible();
  await expect(dp.getByTestId("action-change")).toHaveCount(0);
  await desk.close();
});

test("zrušení: vypnutý e-mail o změně registraci nezastaví", async ({ browser }) => {
  seed();
  sql(`insert into "SystemSetting"(key,value) values ('email.event.events.registration.changed.enabled','false') on conflict (key) do update set value='false'`);
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await page.goto(`/akce/man/r/${T1}`);
  await page.getByTestId("action-cancel").click();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("manage-title")).toHaveText("Registrace byla zrušena");
  expect(reg("status")).toBe("CANCELLED");
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.changed' and status='SENT'`)).toBe("0");
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.changed' and status='SKIPPED_DISABLED'`)).toBe("1");
});

test("uzávěrka změn: po lhůtě jen informace, server změnu odmítne; termín bez času do uzavření registrace", async ({ browser }) => {
  seed();
  // první termín začíná za 2 hodiny, lhůta je 24 h: změny už nejsou možné
  sql(`update "EventItem" set "startsAt"=now() + interval '2 hours',"endsAt"=now() + interval '3 hours' where id='r1'`);
  const page = await (await browser.newContext({ viewport: PHONE, hasTouch: true })).newPage();
  await page.goto(`/akce/man/r/${T1}`);
  await expect(page.getByTestId("manage-page")).toHaveAttribute("data-state", "locked");
  await expect(page.getByTestId("locked-info")).toContainText("Změny už nejsou možné, kontaktujte info@skola.cz");
  await expect(page.getByTestId("action-change")).toHaveCount(0);
  await expect(page.getByTestId("action-cancel")).toHaveCount(0);
  await shot(page, "uzaverka");

  // uzávěrka nastane, když už je stránka otevřená: server změnu stejně odmítne
  sql(`update "EventItem" set "startsAt"=now() + interval '5 days',"endsAt"=now() + interval '5 days 30 min' where id='r1'`);
  await page.reload();
  await page.getByTestId("action-cancel").click();
  sql(`update "EventItem" set "startsAt"=now() + interval '2 hours',"endsAt"=now() + interval '3 hours' where id='r1'`);
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("manage-error")).toContainText("Změny už nejsou možné");
  expect(reg("status")).toBe("CONFIRMED");

  // změna na termín, který už začíná v uzavřené lhůtě, nejde
  sql(`update "EventItem" set "startsAt"=now() + interval '10 days',"endsAt"=now() + interval '10 days 30 min' where id='r1'`);
  await page.reload();
  await page.getByTestId("action-change").click();
  sql(`update "EventItem" set "startsAt"=now() + interval '3 hours',"endsAt"=now() + interval '4 hours' where id='r2'`);
  await page.reload();
  await page.getByTestId("action-change").click();
  await expect(page.locator("[data-item=r2] [data-testid=item-locked]")).toBeVisible();
  await expect(page.locator("[data-item=r2] [data-testid=item-pick]")).toBeDisabled();

  // termín bez času: do uzavření registrace
  sql(`update "EventItem" set "startsAt"=null,"endsAt"=null,label='Individuální termín' where id='r1'`);
  sql(`update "Event" set "registrationClosesAt"=now() + interval '1 hour' where id='evM'`);
  await page.goto(`/akce/man/r/${T1}`);
  await expect(page.getByTestId("manage-page")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("add-to-calendar")).toHaveCount(0);
  sql(`update "Event" set "registrationClosesAt"=now() - interval '1 hour' where id='evM'`);
  await page.goto(`/akce/man/r/${T1}`);
  await expect(page.getByTestId("manage-page")).toHaveAttribute("data-state", "locked");
});

test("Už jste registrovaní?: kód + e-mail vystaví nový odkaz, starý přestane platit; špatný údaj dá obecnou hlášku", async ({ browser }) => {
  seed();
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "10.1.1.1" } });
  const page = await ctx.newPage();
  await page.goto("/akce/man");
  await page.getByTestId("recover-toggle").click();
  await expect(page.getByTestId("recover-note")).toContainText("Starý odkaz");
  await shot(page, "uz-jste-registrovani");

  // špatný kód a špatný e-mail: stejná hláška, nic se nezmění
  await page.fill("#rec-code", "ZZZ-9999");
  await page.fill("#rec-email", "jana@example.com");
  await page.getByTestId("recover-button").click();
  const wrongCode = await page.getByTestId("recover-error").innerText();
  await page.fill("#rec-code", "AAA-2222");
  await page.fill("#rec-email", "nekdo@example.com");
  await page.getByTestId("recover-button").click();
  await expect(page.getByTestId("recover-error")).toHaveText(wrongCode);
  expect(wrongCode).toContain("nepodařilo najít");
  expect(wrongCode).not.toMatch(/e-mail je|kód je/i);
  expect(reg("\"tokenHash\"")).toBe(sha(T1));

  // správný kód (malými písmeny, bez pomlčky) a e-mail (jiná velikost písmen)
  await page.fill("#rec-code", "aaa 2222");
  await page.fill("#rec-email", "Jana@Example.COM");
  await page.getByTestId("recover-button").click();
  await page.waitForURL(/\/akce\/man\/r\/[A-Za-z0-9_-]{43}$/);
  const fresh = page.url().split("/r/")[1];
  expect(fresh).not.toBe(T1);
  await expect(page.getByTestId("manage-title")).toHaveText("Vaše registrace");
  expect(reg("\"tokenHash\"")).toBe(sha(fresh));
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.token_renew' and (summary like '%${fresh}%' or data::text like '%${fresh}%')`)).toBe("0");
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.token_renew'`)).toBe("1");
  await ctx.close();

  // starý odkaz (z e-mailu) už nefunguje, nový ano
  const other = await browser.newContext({ viewport: DESKTOP });
  const op = await other.newPage();
  expect((await op.goto(`/akce/man/r/${T1}`))!.status()).toBe(404);
  expect((await op.request.get(`/akce/man/r/${T1}/kalendar.ics`)).status()).toBe(404);
  expect((await op.goto(`/akce/man/r/${fresh}`))!.status()).toBe(200);
  await other.close();
});

test("Už jste registrovaní?: limit 5 pokusů za 15 minut na IP, zrušená registrace se nenajde", async ({ browser }) => {
  seed();
  sql(`update "EventRegistration" set status='CANCELLED',"cancelledAt"=now() where id='g2'`);
  const ctx = await browser.newContext({ viewport: DESKTOP, extraHTTPHeaders: { "x-forwarded-for": "10.2.2.2" } });
  const page = await ctx.newPage();
  await page.goto("/akce/man");
  await page.getByTestId("recover-toggle").click();
  // zrušená registrace: obecná hláška jako u neznámé
  await page.fill("#rec-code", "BBB-3333");
  await page.fill("#rec-email", "plny@example.com");
  await page.getByTestId("recover-button").click();
  await expect(page.getByTestId("recover-error")).toContainText("nepodařilo najít");
  for (let i = 0; i < 4; i++) {
    await page.fill("#rec-code", `AAA-999${i}`);
    await page.getByTestId("recover-button").click();
    await expect(page.getByTestId("recover-error")).toContainText("nepodařilo najít");
  }
  // šestý pokus je blokovaný, i kdyby byl správný
  await page.fill("#rec-code", "AAA-2222");
  await page.fill("#rec-email", "jana@example.com");
  await page.getByTestId("recover-button").click();
  await expect(page.getByTestId("recover-error")).toContainText("Příliš mnoho pokusů");
  expect(reg("\"tokenHash\"")).toBe(sha(T1));
  expect(sql(`select count(*) from "EventRateLimit" where key like 'rec:ip:%' and key like '%10.2.2.2%'`)).toBe("0");
  await ctx.close();

  // jiná adresa smí
  const ctx2 = await browser.newContext({ viewport: DESKTOP, extraHTTPHeaders: { "x-forwarded-for": "10.3.3.3" } });
  const p2 = await ctx2.newPage();
  await p2.goto("/akce/man");
  await p2.getByTestId("recover-toggle").click();
  await p2.fill("#rec-code", "AAA-2222");
  await p2.fill("#rec-email", "jana@example.com");
  await p2.getByTestId("recover-button").click();
  await p2.waitForURL(/\/r\//);
  await ctx2.close();
});

test(".ics: obsah, časová zóna, hlavičky bez cache a bez indexace, cizí a špatný token = 404", async ({ browser }) => {
  seed();
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  const manage = await page.request.get(`/akce/man/r/${T1}`);
  expect(manage.headers()["cache-control"]).toContain("no-store");
  expect(manage.headers()["referrer-policy"]).toBe("no-referrer");
  expect(manage.headers()["x-robots-tag"]).toContain("noindex");
  await page.goto(`/akce/man/r/${T1}`);
  await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  await expect(page.locator("meta[name=referrer]")).toHaveAttribute("content", "no-referrer");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("add-to-calendar").click()]);
  expect(dl.suggestedFilename()).toBe("registrace-AAA-2222.ics");
  const res = await page.request.get(`/akce/man/r/${T1}/kalendar.ics`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  const body = await res.text();
  expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(body).toContain("TZID=Europe/Prague");
  expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  expect(body).toContain("SUMMARY:Den otevřených dveří");
  expect(body).toContain("LOCATION:Budova A");
  expect(body).not.toMatch(/[^\r]\n/);
  expect(body).not.toContain(T1);
  // DTSTART odpovídá času termínu v pražském čase
  const prague = sql(`select to_char(("startsAt" at time zone 'UTC') at time zone 'Europe/Prague', 'YYYYMMDD"T"HH24MISS') from "EventItem" where id='r1'`);
  expect(body).toContain(`DTSTART;TZID=Europe/Prague:${prague}`);

  expect((await page.request.get(`/akce/man/r/${tok("Z")}/kalendar.ics`)).status()).toBe(404);
  expect((await page.request.get(`/akce/man/r/kratky/kalendar.ics`)).status()).toBe(404);
  // token cizí události se na jiné adrese nepoužije
  sql(`insert into "Event"(id,slug,title,status,"createdById","updatedAt") values ('evX','jina','Jiná akce','PUBLISHED','usr_teacher',now())`);
  expect((await page.request.get(`/akce/jina/r/${T1}/kalendar.ics`)).status()).toBe(404);
  expect((await page.request.get(`/akce/jina/r/${T1}`)).status()).toBe(404);
  expect((await page.request.get(`/akce/man/r/${tok("Z")}`)).status()).toBe(404);
});
