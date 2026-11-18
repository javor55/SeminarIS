import { test, expect, type Browser, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { login, resetDb, sql } from "./helpers";

// U14: čekací listina (nabídka u plného termínu, posun po uvolnění místa všemi cestami, e-maily), prezence (seznam
// pro telefon, QR a „Označit příchod“) a duplikace události.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tok = (c: string) => c.repeat(43);
// Fotky stránek (jen když je nastavená složka, např. U14_SHOTS=/tmp/u14-shots)
const SHOTS = process.env.U14_SHOTS;
const shot = async (page: Page, name: string, views: ("telefon" | "pocitac")[] = ["telefon", "pocitac"]) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const original = page.viewportSize();
  for (const label of views) {
    await page.setViewportSize(label === "telefon" ? PHONE : DESKTOP);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
};

type Reg = { id: string; email: string; name: string; guests?: number; status?: string; token: string; code: string; age: number; items: string[]; attendedAt?: boolean };

/** Událost evW (autor učitel Petr) s čekací listinou; registrace se vkládají s různým stářím (`age` = hodin dozadu). */
function seed(opts: { waitlist?: boolean; items: string; regs: Reg[] }) {
  resetDb();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','true') on conflict (key) do update set value='true'`);
  sql(
    `insert into "Event"(id,slug,title,place,status,"maxItemsPerRegistration","allowGuests","maxGuests","waitlistEnabled","createdById","updatedAt") values ('evW','wait','Den otevřených dveří','Budova A','PUBLISHED',2,true,3,${opts.waitlist ?? true},'usr_teacher',now())`
  );
  sql(`insert into "EventItem"(id,"eventId",label,"startsAt","endsAt",capacity,"order") values ${opts.items}`);
  sql(
    `insert into "EventField"(id,"eventId",key,type,label,mode,options,"order",builtin) values ('f1','evW','name','TEXT','Jméno a příjmení','OPTIONAL','{}',0,true),('f2','evW','phone','TEXT','Telefon','OPTIONAL','{}',1,true),('f4','evW','guests','TEXT','Počet osob','HIDDEN','{}',3,true)`
  );
  for (const r of opts.regs) {
    sql(
      `insert into "EventRegistration"(id,"eventId",email,name,guests,answers,status,"tokenHash",code,"consentAt","createdAt","updatedAt"${r.status === "CANCELLED" ? ',"cancelledAt"' : ""}${r.attendedAt ? ',"attendedAt"' : ""}) values ('${r.id}','evW','${r.email}','${r.name}',${r.guests ?? 0},'{"phone":"777 123 456"}'::jsonb,'${r.status ?? "CONFIRMED"}'::"EventRegistrationStatus",'${sha(r.token)}','${r.code}',now(),now() - interval '${r.age} hours',now()${r.status === "CANCELLED" ? ",now()" : ""}${r.attendedAt ? ",now()" : ""})`
    );
    for (const it of r.items) sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('${r.id}','${it}')`);
  }
}

const status = (id: string) => sql(`select status from "EventRegistration" where id='${id}'`);
const promoted = () => sql(`select string_agg(r.id, ',' order by r.id) from "AuditLog" a join "EventRegistration" r on a.data->>'registrationId' = r.id where a.action='events.registration.promote'`);
const mails = (event: string, where = "") => Number(sql(`select count(*) from "EmailLog" where event='${event}' and status='SENT' ${where}`));
const t = (d: number, h = 9) => `now() + interval '${d} days ${h - 9} hours'`;

async function openTab(browser: Browser, viewport = DESKTOP, email = "teacher@skola.cz", url = "/events/evW?tab=registrations") {
  const page = await login(browser, email);
  await page.setViewportSize(viewport);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return page;
}
const row = (page: Page, code: string) => page.locator(`[data-testid=reg-row][data-code="${code}"]`);
async function act(page: Page, code: string, action: string) {
  const r = row(page, code);
  if (await r.getByTestId("row-actions").count()) {
    await r.getByTestId("row-actions").click();
    await page.locator(`[role=menuitem][data-action=${action}]`).click();
  } else await r.locator(`button[data-action=${action}]`).click();
}

/** Otevře veřejnou stránku, počká na ověření proti robotům a na minimální dobu vyplnění. */
async function openPublic(page: Page, url = "/akce/wait") {
  await page.goto(url);
  await expect(page.getByTestId("antibot")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.waitForTimeout(3200);
}

test("čekací listina: plný termín nabídne zápis na listinu, čekající nedrží místo, e-mail a stránka hotovo", async ({ browser }) => {
  seed({
    items: `('w1','evW',null,${t(5)},${t(5, 10)},1,0),('w2','evW',null,${t(6)},${t(6, 10)},5,1)`,
    regs: [{ id: "h1", email: "drzitel@example.com", name: "Držitel Místa", token: tok("A"), code: "AAA-2222", age: 5, items: ["w1"] }],
  });
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await openPublic(page);
  // plný termín je vybratelný s nabídkou čekací listiny
  await expect(page.locator("[data-item=w1] [data-testid=item-full]")).toContainText("čekací listinu");
  await expect(page.locator("[data-item=w1] [data-testid=item-check]")).toBeEnabled();
  await expect(page.getByTestId("register-button")).toHaveText("Registrovat");
  await page.locator("[data-item=w1] [data-testid=item-check]").check();
  await expect(page.getByTestId("waitlist-note")).toBeVisible();
  await expect(page.getByTestId("register-button")).toHaveText("Zapsat na čekací listinu");
  await shot(page, "01-verejna-plny-termin");
  await page.locator("[data-item=w1] [data-testid=item-check]").uncheck();
  await expect(page.getByTestId("waitlist-note")).toHaveCount(0);
  await page.locator("[data-item=w1] [data-testid=item-check]").check();
  await page.fill("#rf-email", "Ceka@Example.com");
  await page.fill("#rf-name", "Čekající Eva");
  await page.locator("#rf-consent").check();
  await page.getByTestId("register-button").click();
  await page.waitForURL(/\/akce\/wait\/hotovo\?t=/);
  const token = new URL(page.url()).searchParams.get("t")!;

  await expect(page.getByTestId("done-title")).toHaveText("Jste na čekací listině");
  await expect(page.getByTestId("waitlist-info")).toBeVisible();
  await expect(page.getByTestId("add-to-calendar")).toHaveCount(0);
  await expect(page.getByTestId("qr-image")).toHaveCount(0);
  await expect(page.getByTestId("confirmation-text")).toHaveCount(0);
  await shot(page, "02-hotovo-cekaci-listina");
  expect(sql(`select status from "EventRegistration" where email='Ceka@Example.com'`)).toBe("WAITLIST");
  expect(mails("events.waitlist.joined", `and recipient='Ceka@Example.com'`)).toBe(1);
  expect(mails("events.registration.confirmed")).toBe(0);
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.create' and summary like '%čekací listina%'`)).toBe("1");
  // místo nedrží: termín je dál plný (1 z 1) a registrace je vidět jen jako čekající
  await page.goto("/akce/wait");
  await expect(page.locator("[data-item=w1] [data-testid=item-full]")).toBeVisible();
  // správa čekající registrace: stav; zrušení čekajícího nikoho nepřesune a nic neposílá
  await page.goto(`/akce/wait/r/${token}`);
  await expect(page.getByTestId("manage-title")).toHaveText("Jste na čekací listině");
  await page.getByTestId("action-cancel").click();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("manage-title")).toHaveText("Registrace byla zrušena");
  expect(status("h1")).toBe("CONFIRMED");
  expect(mails("events.waitlist.promoted")).toBe(0);
  await ctx.close();

  // bez povolené čekací listiny zůstává plný termín nevybratelný
  sql(`update "Event" set "waitlistEnabled"=false where id='evW'`);
  const ctx2 = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto("/akce/wait");
  await expect(p2.locator("[data-item=w1] [data-testid=item-check]")).toBeDisabled();
  await expect(p2.locator("[data-item=w1] [data-testid=item-full]")).toHaveText("Plno");
  await ctx2.close();
});

test("čekací listina: účastník zruší registraci a nejstarší čekající, který se vejde, se posune i s e-mailem", async ({ browser }) => {
  // w1 (kapacita 2) drží h1 s doprovodem (2 místa); čekají: wA s doprovodem (2 místa, nejstarší), wB, wC
  seed({
    items: `('w1','evW',null,${t(5)},${t(5, 10)},2,0)`,
    regs: [
      { id: "h1", email: "drzitel@example.com", name: "Držitel Místa", guests: 1, token: tok("A"), code: "AAA-2222", age: 10, items: ["w1"] },
      { id: "wA", email: "wa@example.com", name: "Čekající A", guests: 1, status: "WAITLIST", token: tok("B"), code: "BBB-2222", age: 9, items: ["w1"] },
      { id: "wB", email: "wb@example.com", name: "Čekající B", status: "WAITLIST", token: tok("C"), code: "CCC-2222", age: 8, items: ["w1"] },
      { id: "wC", email: "wc@example.com", name: "Čekající C", status: "WAITLIST", token: tok("D"), code: "DDD-2222", age: 7, items: ["w1"] },
    ],
  });
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  // čekající vidí svůj stav
  await page.goto(`/akce/wait/r/${tok("C")}`);
  await expect(page.getByTestId("manage-title")).toHaveText("Jste na čekací listině");
  await expect(page.getByTestId("waitlist-info")).toBeVisible();
  await expect(page.getByTestId("arrival-panel")).toHaveCount(0);
  await expect(page.locator("a[href$='kalendar.ics']")).toHaveCount(0);
  // držitel zruší: uvolní se 2 místa, posune se wA (2 místa, nejstarší), wB a wC čekají dál
  await page.goto(`/akce/wait/r/${tok("A")}`);
  await page.getByTestId("action-cancel").click();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("manage-title")).toHaveText("Registrace byla zrušena");
  expect([status("h1"), status("wA"), status("wB"), status("wC")]).toEqual(["CANCELLED", "CONFIRMED", "WAITLIST", "WAITLIST"]);
  expect(promoted()).toBe("wA");
  expect(mails("events.waitlist.promoted")).toBe(1);
  expect(mails("events.waitlist.promoted", `and recipient='wa@example.com'`)).toBe(1);
  // posun se zapsal do historie pod jménem toho, kdo místo uvolnil (veřejnost), bez osobních údajů
  expect(sql(`select "actorName" from "AuditLog" where action='events.registration.promote'`)).toBe("Veřejnost");
  expect(sql(`select count(*) from "AuditLog" where summary ilike '%example.com%' or summary like '%Čekající%'`)).toBe("0");
  // posunutý čekající teď vidí potvrzenou registraci
  await page.goto(`/akce/wait/r/${tok("B")}`);
  await expect(page.getByTestId("manage-title")).toHaveText("Vaše registrace");
  await expect(page.getByTestId("waitlist-info")).toHaveCount(0);
  await ctx.close();

  // organizátor zruší posunutou registraci: uvolní se 2 místa a posunou se wB i wC (v pořadí registrace)
  const org = await openTab(browser);
  await expect(row(org, "BBB-2222").getByTestId("reg-status")).toHaveText("Potvrzená");
  await expect(row(org, "CCC-2222").getByTestId("reg-status")).toHaveText("Čekací listina");
  await expect(org.getByTestId("sum-waitlist")).toHaveText("2");
  await act(org, "BBB-2222", "cancel");
  await org.getByTestId("submit-cancel").click();
  await expect.poll(() => [status("wA"), status("wB"), status("wC")].join()).toBe("CANCELLED,CONFIRMED,CONFIRMED");
  expect(promoted()).toBe("wA,wB,wC");
  expect(mails("events.waitlist.promoted")).toBe(3);
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.promote' and "actorName" like '%Petr%'`)).toBe("2");
});

test("čekací listina: přeskočí se ten, kdo se nevejde; přesun, odebrání z termínu a snížení počtu osob uvolní místo", async ({ browser }) => {
  seed({
    items: `('p2','evW',null,${t(5)},${t(5, 10)},3,0),('p3','evW',null,${t(6)},${t(6, 10)},1,1),('p4','evW',null,${t(7)},${t(7, 10)},null,2),('p5','evW',null,${t(8)},${t(8, 10)},1,3),('p6','evW',null,${t(9)},${t(9, 10)},1,4),('p7','evW',null,${t(10)},${t(10, 10)},3,5)`,
    regs: [
      // p2 (3 místa): h2 s doprovodem + h3 = plno; čeká wD (3 místa, nejstarší) a wE (1 místo)
      { id: "h2", email: "h2@example.com", name: "Držitel Dva", guests: 1, token: tok("A"), code: "AAA-2222", age: 20, items: ["p2"] },
      { id: "h3", email: "h3@example.com", name: "Držitel Tři", token: tok("B"), code: "BBB-2222", age: 19, items: ["p2"] },
      { id: "wD", email: "wd@example.com", name: "Čekající D", guests: 2, status: "WAITLIST", token: tok("C"), code: "CCC-2222", age: 18, items: ["p2"] },
      { id: "wE", email: "we@example.com", name: "Čekající E", status: "WAITLIST", token: tok("D"), code: "DDD-2222", age: 17, items: ["p2"] },
      // p3 (1 místo): h4; čeká wF; h4 se přesune na p4 (bez omezení)
      { id: "h4", email: "h4@example.com", name: "Držitel Čtyři", token: tok("E"), code: "EEE-2222", age: 16, items: ["p3"] },
      { id: "wF", email: "wf@example.com", name: "Čekající F", status: "WAITLIST", token: tok("F"), code: "FFF-2222", age: 15, items: ["p3"] },
      // p5 (1 místo) + p6 (1 místo): h5 na obou; čeká wG na p5; h5 se odebere z p5
      { id: "h5", email: "h5@example.com", name: "Držitel Pět", token: tok("G"), code: "GGG-2222", age: 14, items: ["p5", "p6"] },
      { id: "wG", email: "wg@example.com", name: "Čekající G", status: "WAITLIST", token: tok("H"), code: "HHH-2222", age: 13, items: ["p5"] },
      // p7 (3 místa): h6 s doprovodem + h7; čeká wH; h6 si sníží počet osob
      { id: "h6", email: "h6@example.com", name: "Držitel Šest", guests: 1, token: tok("I"), code: "III-2222", age: 12, items: ["p7"] },
      { id: "h7", email: "h7@example.com", name: "Držitel Sedm", token: tok("J"), code: "JJJ-2222", age: 11, items: ["p7"] },
      { id: "wH", email: "wh@example.com", name: "Čekající H", status: "WAITLIST", token: tok("K"), code: "KKK-2222", age: 10, items: ["p7"] },
    ],
  });
  const org = await openTab(browser);
  // 1) zrušení h3 uvolní 1 místo: wD (3 místa) se nevejde, přeskočí se a posune se wE
  await act(org, "BBB-2222", "cancel");
  await org.getByTestId("submit-cancel").click();
  await expect.poll(() => [status("wD"), status("wE")].join()).toBe("WAITLIST,CONFIRMED");
  expect(mails("events.waitlist.promoted", `and recipient='we@example.com'`)).toBe(1);

  // 2) přesun h4 z p3 na p4: uvolní se p3, posune se wF
  await act(org, "EEE-2222", "move");
  await org.getByTestId("move-to").selectOption("p4");
  await org.getByTestId("submit-move").click();
  await expect.poll(() => status("wF")).toBe("CONFIRMED");
  expect(mails("events.waitlist.promoted", `and recipient='wf@example.com'`)).toBe(1);

  // 3) odebrání h5 z termínu p5: posune se wG
  await act(org, "GGG-2222", "remove");
  await org.getByTestId("remove-item").selectOption("p5");
  await org.getByTestId("submit-remove").click();
  await expect.poll(() => status("wG")).toBe("CONFIRMED");
  expect(sql(`select count(*) from "EventRegistrationItem" where "registrationId"='h5'`)).toBe("1");
  await org.context().close();

  // 4) účastník h6 sníží počet osob (z 2 na 1): uvolní se místo, posune se wH
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/akce/wait/r/${tok("I")}`);
  await page.getByTestId("action-edit").click();
  await page.locator("[name=guests]").fill("0");
  await page.getByTestId("save-edit").click();
  await expect(page.getByTestId("manage-notice")).toBeVisible();
  await expect.poll(() => status("wH")).toBe("CONFIRMED");
  expect(mails("events.waitlist.promoted", `and recipient='wh@example.com'`)).toBe(1);
  // wD pořád čeká (nikdo mu nedal místo) a celkem se posunuli wE, wF, wG, wH
  expect(status("wD")).toBe("WAITLIST");
  expect(promoted()).toBe("wE,wF,wG,wH");
  await ctx.close();
});

test("nastavení: přepínač „Povolit čekací listinu“ se ukládá", async ({ browser }) => {
  seed({ waitlist: false, items: `('w1','evW',null,${t(5)},${t(5, 10)},1,0)`, regs: [] });
  const page = await openTab(browser, DESKTOP, "teacher@skola.cz", "/events/evW");
  const box = page.getByTestId("waitlist-enabled");
  await expect(box).not.toBeChecked();
  await box.check();
  await page.getByTestId("save-event").click();
  await expect.poll(() => sql(`select "waitlistEnabled" from "Event" where id='evW'`)).toBe("t");
  expect(sql(`select count(*) from "AuditLog" where action='events.event.update' and summary like '%čekací listina%'`)).toBe("1");
});

test("prezence: velké řádky na telefonu, zaškrtnutí i odškrtnutí, audit, jen aktivní registrace", async ({ browser }) => {
  seed({
    items: `('w1','evW',null,${t(5)},${t(5, 10)},10,0),('w2','evW',null,${t(6)},${t(6, 10)},10,1)`,
    regs: [
      { id: "a1", email: "a1@example.com", name: "Adam Novák", guests: 1, token: tok("A"), code: "AAA-2222", age: 10, items: ["w1"] },
      { id: "a2", email: "a2@example.com", name: "Běla Dvořáková", token: tok("B"), code: "BBB-2222", age: 9, items: ["w1"], attendedAt: true },
      { id: "a3", email: "a3@example.com", name: "Cyril Čermák", token: tok("C"), code: "CCC-2222", age: 8, items: ["w1", "w2"] },
      { id: "a4", email: "a4@example.com", name: "Dana Čekající", status: "WAITLIST", token: tok("D"), code: "DDD-2222", age: 7, items: ["w1"] },
      { id: "a5", email: "a5@example.com", name: "Eva Zrušená", status: "CANCELLED", token: tok("E"), code: "EEE-2222", age: 6, items: ["w1"] },
      { id: "a6", email: "a6@example.com", name: "Filip Jiný", token: tok("F"), code: "FFF-2222", age: 5, items: ["w2"] },
    ],
  });
  const page = await openTab(browser, PHONE);
  await page.getByTestId("reg-item-filter").selectOption("w1");
  await page.getByTestId("attendance-toggle").click();
  const panel = page.getByTestId("attendance-panel");
  await expect(panel).toBeVisible();
  // jen registrace, které drží místo na termínu w1 (a1, a2, a3), podle jména
  await expect(panel.getByTestId("attend-row")).toHaveCount(3);
  expect(await panel.getByTestId("attend-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-code")))).toEqual(["AAA-2222", "BBB-2222", "CCC-2222"]);
  await expect(page.getByTestId("attend-came")).toHaveText("1");
  await expect(page.getByTestId("attend-total")).toHaveText("3");
  // řádky jsou velké (výška pro prst) a stránka nepřetéká
  for (const box of await panel.getByTestId("attend-row").all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await shot(page, "03-prezence");

  const attended = (id: string) => sql(`select "attendedAt" is not null from "EventRegistration" where id='${id}'`);
  await panel.locator("[data-code=AAA-2222]").click();
  await expect.poll(() => attended("a1")).toBe("t");
  await expect(panel.locator("[data-code=AAA-2222]")).toHaveAttribute("data-attended", "true");
  await expect(page.getByTestId("attend-came")).toHaveText("2");
  await expect(page.getByTestId("attend-people")).toHaveText("3");
  // odškrtnout jde
  await panel.locator("[data-code=BBB-2222]").click();
  await expect.poll(() => attended("a2")).toBe("f");
  await expect(page.getByTestId("attend-came")).toHaveText("1");
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.attend'`)).toBe("1");
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.unattend'`)).toBe("1");
  expect(sql(`select count(*) from "AuditLog" where (action like 'events.registration.%attend') and (summary ilike '%example.com%' or summary like '%Novák%')`)).toBe("0");
  // filtr „jen kdo nepřišel“ a hledání
  await page.getByTestId("attend-only-missing").check();
  await expect(panel.getByTestId("attend-row")).toHaveCount(2);
  await page.getByTestId("attend-only-missing").uncheck();
  await page.getByTestId("reg-search").fill("cyril");
  await expect(panel.getByTestId("attend-row")).toHaveCount(1);
  // stav zůstane i po obnovení stránky
  await page.reload();
  await page.getByTestId("reg-item-filter").selectOption("w1");
  await page.getByTestId("attendance-toggle").click();
  await expect(page.locator("[data-testid=attend-row][data-code=AAA-2222]")).toHaveAttribute("data-attended", "true");
  await page.context().close();

  // cizí učitel událost nevidí, takže ani prezenci
  sql(
    `insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`
  );
  const other = await login(browser, "teacher.b@skola.cz");
  expect((await other.goto("/events/evW?tab=registrations"))!.status()).toBe(404);
  await other.context().close();
});

test("QR v potvrzení a „Označit příchod“ jen pro organizátora", async ({ browser }) => {
  seed({
    items: `('w1','evW',null,${t(5)},${t(5, 10)},10,0)`,
    regs: [
      { id: "q1", email: "q1@example.com", name: "Karel Účastník", guests: 1, token: tok("Q"), code: "QQQ-2222", age: 10, items: ["w1"] },
      { id: "q2", email: "q2@example.com", name: "Lenka Čekající", status: "WAITLIST", token: tok("R"), code: "RRR-2222", age: 9, items: ["w1"] },
    ],
  });
  sql(`insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`);
  // potvrzení s QR kódem (data URL, token nikam nejde)
  const anon = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await anon.newPage();
  await page.goto(`/akce/wait/hotovo?t=${tok("Q")}`);
  await expect(page.getByTestId("qr-image")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByTestId("qr-image")).toBeVisible();
  await shot(page, "04-hotovo-qr", ["telefon"]);
  // anonym nevidí panel pro organizátora
  await page.goto(`/akce/wait/r/${tok("Q")}`);
  await expect(page.getByTestId("manage-title")).toHaveText("Vaše registrace");
  await expect(page.getByTestId("arrival-panel")).toHaveCount(0);
  await anon.close();

  // cizí učitel (bez práv k události) panel nevidí
  const other = await login(browser, "teacher.b@skola.cz");
  await other.goto(`/akce/wait/r/${tok("Q")}`);
  await expect(other.getByTestId("manage-title")).toBeVisible();
  await expect(other.getByTestId("arrival-panel")).toHaveCount(0);
  await other.context().close();

  // organizátor: označit příchod a zrušit označení
  const org = await login(browser, "teacher@skola.cz");
  await org.setViewportSize(PHONE);
  await org.goto(`/akce/wait/r/${tok("Q")}`);
  await expect(org.getByTestId("arrival-panel")).toBeVisible();
  await shot(org, "05-oznacit-prichod", ["telefon"]);
  await org.getByTestId("arrival-mark").click();
  await expect(org.getByTestId("arrival-done")).toBeVisible();
  expect(sql(`select "attendedAt" is not null from "EventRegistration" where id='q1'`)).toBe("t");
  expect(sql(`select count(*) from "AuditLog" where action='events.registration.attend'`)).toBe("1");
  await org.reload();
  await expect(org.getByTestId("arrival-done")).toBeVisible();
  await org.getByTestId("arrival-undo").click();
  await expect(org.getByTestId("arrival-mark")).toBeVisible();
  expect(sql(`select "attendedAt" is null from "EventRegistration" where id='q1'`)).toBe("t");
  // čekající příchod označit nejde
  await org.goto(`/akce/wait/r/${tok("R")}`);
  await expect(org.getByTestId("arrival-waitlist")).toBeVisible();
  await expect(org.getByTestId("arrival-mark")).toHaveCount(0);
  await org.context().close();

  // administrátor smí také
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto(`/akce/wait/r/${tok("Q")}`);
  await expect(admin.getByTestId("arrival-mark")).toBeVisible();
  await admin.context().close();
});

test("duplikace: kopie nastavení, formuláře, obrázku, termínů (posun), publika a organizátorů; bez registrací, koncept, nový odkaz", async ({ browser }) => {
  seed({
    items: `('w1','evW','Dopoledne',${t(5)},${t(5, 10)},10,0),('w2','evW',null,${t(6)},${t(6, 10)},4,1),('w3','evW','Zrušený termín',${t(7)},${t(7, 10)},4,2)`,
    regs: [{ id: "a1", email: "a1@example.com", name: "Adam Novák", token: tok("A"), code: "AAA-2222", age: 10, items: ["w1"] }],
  });
  sql(`update "EventItem" set "cancelledAt"=now() where id='w3'`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`);
  sql(`insert into "EventOrganizer"("eventId","userId") values ('evW','usr_teacher_b')`);
  sql(`insert into "EventImage"(id,data,mime,width,height,size,"createdById") values ('imW',decode('89504e47','hex'),'image/png',400,225,4,'usr_teacher')`);
  sql(`update "Event" set "imageId"='imW',"imageAlt"='Budova',subtitle='Podtitulek',contact='info@skola.cz',visibility='USERS',"audienceRoles"='{STUDENT,TEACHER}',"descriptionHtml"='<p>Popis události</p>',"registrationOpensAt"=now()-interval '1 day',"registrationClosesAt"=now()+interval '4 days',"maxRegistrationsPerEmail"=3,"changeDeadlineMinutes"=600,"confirmationText"='Díky!' where id='evW'`);
  sql(`insert into "EventAudience"(id,"eventId",type,grade,key,"createdAt") values ('eaW','evW','GRADE',3,'GRADE:3',now())`);
  sql(`insert into "EventField"(id,"eventId",key,type,label,mode,options,"order",builtin) values ('f9','evW','custom_1','SELECT','Oblíbený předmět','REQUIRED',ARRAY['Matematika','Fyzika'],10,false)`);

  const dup = await openTab(browser, PHONE, "teacher@skola.cz", "/events/evW");
  await dup.getByTestId("duplicate-event").click();
  await expect(dup.getByTestId("dialog-duplicate")).toBeVisible();
  await expect(dup.getByTestId("dup-title")).toHaveValue("Den otevřených dveří (kopie)");
  await dup.getByTestId("dup-days").fill("14");
  await expect(dup.getByTestId("dup-days-hint")).toContainText("o 14 dní později");
  await shot(dup, "06-duplikace-dialog");
  // neplatný posun nejde odeslat
  await dup.getByTestId("dup-days").fill("1.5");
  await expect(dup.getByTestId("dup-submit")).toBeDisabled();
  await dup.getByTestId("dup-days").fill("14");
  await dup.getByTestId("dup-title").fill("Den otevřených dveří 2027");
  await dup.getByTestId("dup-submit").click();
  await dup.waitForURL((u) => /^\/events\/(?!evW)[^/]+$/.test(u.pathname));
  await dup.context().close();

  const copy = sql(`select id from "Event" where id <> 'evW'`);
  expect(copy).not.toBe("");
  const q = (s: string) => sql(s.split("$COPY").join(copy));
  expect(q(`select status::text||'|'||title||'|'||slug||'|'||"createdById" from "Event" where id='$COPY'`)).toBe("DRAFT|Den otevřených dveří 2027|den-otevrenych-dveri-2027|usr_teacher");
  // nastavení se zkopírovalo, obrázek je odkaz na stejný EventImage
  expect(q(`select "imageId"||'|'||"imageAlt"||'|'||subtitle||'|'||contact||'|'||visibility::text||'|'||"audienceRoles"::text||'|'||"maxItemsPerRegistration"||'|'||"allowGuests"||'|'||"maxGuests"||'|'||"waitlistEnabled"||'|'||"maxRegistrationsPerEmail"||'|'||"changeDeadlineMinutes"||'|'||"confirmationText"||'|'||"descriptionHtml" from "Event" where id='$COPY'`)).toBe("imW|Budova|Podtitulek|info@skola.cz|USERS|{STUDENT,TEACHER}|2|true|3|true|3|600|Díky!|<p>Popis události</p>");
  expect(sql(`select count(*) from "EventImage"`)).toBe("1");
  // termíny: jen nezrušené, o 14 dní později ve stejný čas na hodinách (kalendářní posun v pásmu školy), kapacita, název, pořadí
  expect(q(`select count(*) from "EventItem" where "eventId"='$COPY'`)).toBe("2");
  expect(q(`select count(*) from "EventItem" c join "EventItem" o on o.id=case c."order" when 0 then 'w1' else 'w2' end where c."eventId"='$COPY' and (c."startsAt" at time zone 'Europe/Prague') = (o."startsAt" at time zone 'Europe/Prague') + interval '14 days' and (c."endsAt" at time zone 'Europe/Prague') = (o."endsAt" at time zone 'Europe/Prague') + interval '14 days' and c.capacity is not distinct from o.capacity and c.label is not distinct from o.label`)).toBe("2");
  // období registrace se posunulo také
  expect(q(`select (c."registrationOpensAt" at time zone 'Europe/Prague') = (o."registrationOpensAt" at time zone 'Europe/Prague') + interval '14 days' from "Event" c, "Event" o where c.id='$COPY' and o.id='evW'`)).toBe("t");
  // formulář, publikum, spoluorganizátoři; žádné registrace
  expect(q(`select count(*) from "EventField" where "eventId"='$COPY' and key='custom_1' and label='Oblíbený předmět' and mode='REQUIRED' and options='{Matematika,Fyzika}'`)).toBe("1");
  // pole zdroje (i s režimem a popiskem) jsou v kopii; chybějící pevná pole se doplní výchozími
  expect(q(`select count(*) from "EventField" c join "EventField" o on o.key=c.key and o."eventId"='evW' where c."eventId"='$COPY' and c.type=o.type and c.label=o.label and c.mode=o.mode and c."order"=o."order" and c.builtin=o.builtin`)).toBe("4");
  expect(q(`select count(*) from "EventAudience" where "eventId"='$COPY' and key='GRADE:3' and grade=3`)).toBe("1");
  expect(q(`select string_agg("userId",',') from "EventOrganizer" where "eventId"='$COPY'`)).toBe("usr_teacher_b");
  expect(q(`select count(*) from "EventRegistration" where "eventId"='$COPY'`)).toBe("0");
  // původní událost beze změny
  expect(sql(`select status::text||'|'||(select count(*) from "EventRegistration" where "eventId"='evW')||'|'||(select count(*) from "EventItem" where "eventId"='evW') from "Event" where id='evW'`)).toBe("PUBLISHED|1|3");
  expect(q(`select count(*) from "AuditLog" where action='events.event.duplicate' and "entityId"='$COPY' and "actorName" like '%Petr%'`)).toBe("1");

  // další duplikace téhož názvu dostane jiný odkaz; zkopíruje se i detail s novou událostí (koncept se otevře)
  const page = await openTab(browser, DESKTOP, "teacher@skola.cz", `/events/${copy}`);
  await expect(page.getByText("Koncept").first()).toBeVisible();
  await page.getByTestId("duplicate-event").click();
  await page.getByTestId("dup-title").fill("Den otevřených dveří 2027");
  await page.getByTestId("dup-days").fill("0");
  await page.getByTestId("dup-submit").click();
  await page.waitForURL((u) => /^\/events\/(?!evW)[^/]+$/.test(u.pathname) && !u.pathname.endsWith(copy));
  expect(sql(`select count(*) from "Event" where slug='den-otevrenych-dveri-2027-2'`)).toBe("1");
  await page.context().close();
});
