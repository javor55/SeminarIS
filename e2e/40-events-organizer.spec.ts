import { test, expect, type Browser, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { IMPERSONATION_COOKIE, signImpersonation } from "../lib/impersonation-token";
import { login, resetDb, sql } from "./helpers";

// U11: nástroje organizátora (záložka Registrace): souhrn, seznam, ruční přidání, úprava, přesun (i nad kapacitu),
// odebrání z termínu, zrušení, e-maily, export CSV, QR kód a oprávnění.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// Fotky stránek (jen když je nastavená složka, např. U11_SHOTS=/tmp/u11-shots)
const SHOTS = process.env.U11_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const original = page.viewportSize();
  for (const [label, size] of [["telefon", PHONE], ["pocitac", DESKTOP]] as const) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
};

/**
 * Událost evO (autor učitel Petr) s termíny r1 (kapacita 2), r2 (kapacita 1), r3 (bez omezení), vlastním polem a skrytým polem „škola“:
 * - g1 Jana (+ 1 osoba navíc) na r1 a r3, telefon, poznámka, vlastní pole, škola (skryté pole s daty),
 * - g2 Petr na r2 (termín je plný),
 * - g3 Zrušená na r1.
 */
function seed() {
  resetDb();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','true') on conflict (key) do update set value='true'`);
  sql(
    `insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`
  );
  sql(
    `insert into "Event"(id,slug,title,place,status,"maxItemsPerRegistration","allowGuests","maxGuests","createdById","updatedAt") values ('evO','org','Den otevřených dveří','Budova A','PUBLISHED',2,true,2,'usr_teacher',now())`
  );
  sql(
    `insert into "EventItem"(id,"eventId",label,"startsAt","endsAt",capacity,"order") values ('r1','evO','Dopoledne',now() + interval '10 days',now() + interval '10 days 30 min',2,0),('r2','evO',null,now() + interval '10 days 30 min',now() + interval '10 days 1 hour',1,1),('r3','evO',null,now() + interval '11 days',now() + interval '11 days 30 min',null,2)`
  );
  sql(
    `insert into "EventField"(id,"eventId",key,type,label,mode,options,"order",builtin) values ('f1','evO','name','TEXT','Jméno a příjmení','REQUIRED','{}',0,true),('f2','evO','phone','TEXT','Telefon','OPTIONAL','{}',1,true),('f3','evO','school','TEXT','Současná škola','HIDDEN','{}',2,true),('f4','evO','guests','TEXT','Počet osob','HIDDEN','{}',3,true),('f5','evO','note','TEXTAREA','Poznámka','OPTIONAL','{}',4,true),('f6','evO','custom_1','SELECT','Oblíbený předmět','REQUIRED',ARRAY['Matematika','Fyzika'],10,false),('f7','evO','custom_2','CHECKBOX','Souhlas s fotkou','OPTIONAL','{}',11,false),('f8','evO','custom_3','TEXT','Skryté bez dat','HIDDEN','{}',12,false)`
  );
  const reg = (id: string, email: string, name: string | null, guests: number, status: string, answers: string, token: string, code: string) =>
    sql(
      `insert into "EventRegistration"(id,"eventId",email,name,guests,status,answers,"tokenHash",code,"consentAt","createdAt","updatedAt"${status === "CANCELLED" ? ',"cancelledAt"' : ""}) values ('${id}','evO','${email}',${name ? `'${name}'` : "null"},${guests},'${status}'::"EventRegistrationStatus",'${answers}'::jsonb,'${sha(token)}','${code}',now(),now() - interval '${id === "g1" ? 3 : id === "g2" ? 2 : 1} hours',now()${status === "CANCELLED" ? ",now()" : ""})`
    );
  reg("g1", "jana@example.com", "Jana Nová", 1, "CONFIRMED", `{"phone":"+420 123 456 789","note":"Přijdu s dcerou","school":"ZŠ Dukla","custom_1":"Fyzika","custom_2":true}`, "G".repeat(43), "AAA-2222");
  reg("g2", "petr@example.com", "Petr Plný", 0, "CONFIRMED", `{"custom_1":"Matematika"}`, "H".repeat(43), "BBB-3333");
  reg("g3", "zrusena@example.com", "Zrušená Eva", 0, "CANCELLED", `{"custom_1":"Matematika"}`, "I".repeat(43), "CCC-4444");
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('g1','r1'),('g1','r3'),('g2','r2'),('g3','r1')`);
  // Ještě jedna registrace pro ruční přesuny (r3)
  reg("g4", "karel@example.com", "Karel Volný", 0, "CONFIRMED", `{"custom_1":"Matematika"}`, "J".repeat(43), "DDD-5555");
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('g4','r3')`);
}

const items = (id: string) => sql(`select string_agg("itemId", ',' order by "itemId") from "EventRegistrationItem" where "registrationId"='${id}'`);
const mails = (event: string, where = "") => sql(`select count(*) from "EmailLog" where event='${event}' and status='SENT' ${where}`);
const audits = (action: string) => sql(`select count(*) from "AuditLog" where action='${action}'`);

async function openTab(browser: Browser, viewport = DESKTOP, email = "teacher@skola.cz", url = "/events/evO?tab=registrations") {
  const page = await login(browser, email);
  await page.setViewportSize(viewport);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return page;
}
const row = (page: Page, code: string) => page.locator(`[data-testid=reg-row][data-code="${code}"]`);
/** Akce řádku: na počítači v menu, na telefonu tlačítka v kartě. */
async function act(page: Page, code: string, action: string) {
  const r = row(page, code);
  await expect(page.locator("[role=menu]")).toHaveCount(0);
  if (await r.getByTestId("row-actions").count()) {
    await r.getByTestId("row-actions").click();
    await page.locator(`[role=menuitem][data-action=${action}]`).click();
  } else await r.locator(`button[data-action=${action}]`).click();
}

test("záložka Registrace: souhrn, obsazenost, seznam, hledání a filtr (počítač i telefon)", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  // aktivní registrace 3 (zrušená se nepočítá), osob 4 (Jana + 1, Petr, Karel), volno u omezených termínů: r1 0, r2 0 → 0
  await expect(page.getByTestId("sum-registrations")).toHaveText("3");
  await expect(page.getByTestId("sum-people")).toHaveText("4");
  await expect(page.getByTestId("sum-free")).toHaveText("0");
  await expect(page.locator("[data-testid=occupancy] [data-item=r1] [data-testid=occupancy-text]")).toHaveText("2 / 2");
  await expect(page.locator("[data-testid=occupancy] [data-item=r3] [data-testid=occupancy-text]")).toContainText("bez omezení");
  await expect(page.locator("[data-testid=occupancy] [data-item=r1] [role=img]")).toHaveAttribute("aria-label", "Obsazeno 2 z 2");
  // tabulka: zrušená skrytá, sloupce, stav
  await expect(page.getByTestId("reg-table")).toBeVisible();
  await expect(page.getByTestId("reg-row")).toHaveCount(3);
  await expect(row(page, "AAA-2222")).toContainText("Jana Nová");
  await expect(row(page, "AAA-2222")).toContainText("+420 123 456 789");
  await expect(row(page, "AAA-2222")).toContainText("Přijdu s dcerou");
  await expect(row(page, "AAA-2222").getByTestId("reg-status")).toHaveText("Potvrzená");
  await expect(page.getByTestId("reg-row").first()).toHaveAttribute("data-code", "DDD-5555"); // nejnovější nahoře
  // hledání (i bez diakritiky a podle telefonu) a filtr podle termínu
  await page.getByTestId("reg-search").fill("nova");
  await expect(page.getByTestId("reg-row")).toHaveCount(1);
  await page.getByTestId("reg-search").fill("420123456789");
  await expect(page.getByTestId("reg-row")).toHaveCount(1);
  await page.getByTestId("reg-search").fill("nikdo");
  await expect(page.getByTestId("reg-empty")).toContainText("nic nenašlo");
  await page.getByTestId("reg-search").fill("");
  await page.getByTestId("reg-item-filter").selectOption("r2");
  await expect(page.getByTestId("reg-row")).toHaveCount(1);
  await expect(row(page, "BBB-3333")).toBeVisible();
  await page.getByTestId("reg-item-filter").selectOption("");
  await page.getByTestId("show-cancelled").check();
  await expect(page.getByTestId("reg-row")).toHaveCount(4);
  await expect(row(page, "CCC-4444").getByTestId("reg-status")).toHaveText("Zrušená");
  await expect(row(page, "CCC-4444").getByTestId("row-actions")).toHaveCount(0);
  await page.getByTestId("show-cancelled").uncheck();
  await shot(page, "registrace");

  // telefon: karty místo tabulky, akce jako tlačítka
  await page.setViewportSize(PHONE);
  await expect(page.getByTestId("reg-cards")).toBeVisible();
  await expect(page.getByTestId("reg-table")).toHaveCount(0);
  await expect(page.getByTestId("reg-row")).toHaveCount(3);
  await expect(row(page, "AAA-2222")).toContainText("Přijdu s dcerou");
  await expect(row(page, "AAA-2222").locator("button[data-action=move]")).toBeVisible();
  await expect(row(page, "AAA-2222").locator("button[data-action=remove]")).toBeVisible(); // dva termíny
  await expect(row(page, "BBB-3333").locator("button[data-action=remove]")).toHaveCount(0); // jediný termín
  const box = await row(page, "AAA-2222").locator("button[data-action=move]").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43);
});

test("ruční přidání: bez antibotu, token a kód jako veřejná registrace, potvrzení volitelné, nad kapacitu jen s potvrzením", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  await page.getByTestId("add-registration").click();
  await expect(page.getByTestId("dialog-add")).toBeVisible();
  await expect(page.getByTestId("send-email")).toBeChecked();
  await shot(page, "pridani");
  // bez termínu nejde
  await expect(page.getByTestId("submit-reg")).toBeDisabled();
  await page.getByTestId("rf-email").fill("nova@example.com");
  await page.getByTestId("rf-name").fill("Nová Účastnice");
  await page.locator("input[data-item=r3]").check();
  // povinné vlastní pole nemusí být vyplněné (organizátor smí vše)
  await page.getByTestId("submit-reg").click();
  await expect(page.getByTestId("dialog-add")).toHaveCount(0);
  const created = sql(`select id||'|'||code||'|'||length("tokenHash")||'|'||status||'|'||guests||'|'||coalesce("userId",'-')||'|'||"confirmEmailFailed" from "EventRegistration" where email='nova@example.com'`).split("|");
  expect(created[1]).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}$/);
  expect(created.slice(2)).toEqual(["64", "CONFIRMED", "0", "-", "false"]);
  expect(sql(`select string_agg("itemId",',') from "EventRegistrationItem" where "registrationId"='${created[0]}'`)).toBe("r3");
  expect(mails("events.registration.confirmed", `and recipient='nova@example.com'`)).toBe("1");
  expect(sql(`select "actorId"||'|'||"actorName" from "AuditLog" where action='events.registration.create_manual'`)).toBe("usr_teacher|Učitel Petr");
  expect(sql(`select count(*) from "AuditLog" where data::text like '%nova@example.com%' or summary like '%nova@example.com%'`)).toBe("0");

  // plný termín r2: bez potvrzení nelze, s potvrzením ano; bez e-mailu se nic neodešle
  await page.getByTestId("add-registration").click();
  await page.getByTestId("rf-email").fill("navic@example.com");
  await page.locator("input[data-item=r2]").check();
  await expect(page.getByTestId("over-capacity")).toContainText("Termín je plný");
  await expect(page.getByTestId("submit-reg")).toBeDisabled();
  await page.getByTestId("force-over").check();
  await page.getByTestId("send-email").uncheck();
  await shot(page, "pridani-nad-kapacitu");
  await page.getByTestId("submit-reg").click();
  await expect(page.getByTestId("dialog-add")).toHaveCount(0);
  await expect.poll(() => sql(`select count(*) from "EventRegistration" where email='navic@example.com'`)).toBe("1");
  expect(sql(`select count(*) from "EventRegistrationItem" where "itemId"='r2'`)).toBe("2");
  expect(mails("events.registration.confirmed", `and recipient='navic@example.com'`)).toBe("0");
  await expect(page.locator("[data-item=r2] [data-testid=occupancy-text]")).toHaveText("2 / 1");
  // špatný e-mail se odmítne a dialog zůstane
  await page.getByTestId("add-registration").click();
  await page.getByTestId("rf-email").fill("a@b");
  await page.locator("input[data-item=r3]").check();
  await page.getByTestId("submit-reg").click();
  await expect(page.locator("[data-sonner-toast][data-type=error]").first()).toContainText("jmeno@domena.cz");
  await expect(page.getByTestId("dialog-add")).toBeVisible();
});

test("ruční přidání: vypnutý e-mail registraci nezastaví a označí varování; limit se neuplatní na uzávěrku", async ({ browser }) => {
  seed();
  sql(`insert into "SystemSetting"(key,value) values ('email.event.events.registration.confirmed.enabled','false') on conflict (key) do update set value='false'`);
  // uzavřená registrace: organizátor smí přidávat i tak
  sql(`update "Event" set status='CLOSED' where id='evO'`);
  const page = await openTab(browser);
  await page.getByTestId("add-registration").click();
  await page.getByTestId("rf-email").fill("pozde@example.com");
  await page.locator("input[data-item=r3]").check();
  await page.getByTestId("submit-reg").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "nepodařilo odeslat" })).toBeVisible();
  await expect.poll(() => sql(`select "confirmEmailFailed" from "EventRegistration" where email='pozde@example.com'`)).toBe("t");
  await expect(page.getByTestId("reg-row").filter({ hasText: "pozde@example.com" }).getByTestId("reg-email-failed")).toBeVisible();
  await expect(page.getByTestId("email-failed-warning")).toContainText("1 registrace");
});

test("úprava údajů organizátorem a audit", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  await act(page, "AAA-2222", "edit");
  await expect(page.getByTestId("dialog-edit")).toBeVisible();
  await expect(page.getByTestId("rf-email")).toHaveValue("jana@example.com");
  await expect(page.getByTestId("rf-phone")).toHaveValue("+420 123 456 789");
  await expect(page.getByTestId("rf-custom_1")).toHaveValue("Fyzika");
  await expect(page.getByTestId("rf-custom_2")).toBeChecked();
  await page.getByTestId("rf-phone").fill("777 111 222");
  await page.getByTestId("rf-name").fill("Jana Nováková");
  await page.getByTestId("rf-custom_1").selectOption("Matematika");
  await page.getByTestId("submit-reg").click();
  await expect(page.getByTestId("dialog-edit")).toHaveCount(0);
  await expect.poll(() => sql(`select name from "EventRegistration" where id='g1'`)).toBe("Jana Nováková");
  expect(sql(`select answers->>'phone' || '|' || (answers->>'custom_1') || '|' || (answers->>'school') from "EventRegistration" where id='g1'`)).toBe("777 111 222|Matematika|ZŠ Dukla"); // skrytá data zůstala
  expect(audits("events.registration.update_manual")).toBe("1");

  // víc osob na plném termínu: nad kapacitu jen s potvrzením (g2 na r2 s kapacitou 1)
  await act(page, "BBB-3333", "edit");
  await page.getByTestId("rf-guests").selectOption("1");
  await expect(page.getByTestId("over-capacity")).toBeVisible();
  await expect(page.getByTestId("submit-reg")).toBeDisabled();
  await page.getByTestId("force-over").check();
  await page.getByTestId("submit-reg").click();
  await expect.poll(() => sql(`select guests from "EventRegistration" where id='g2'`)).toBe("1");
});

test("přesun: kontrola kapacity, nad kapacitu s potvrzením, e-mail volitelný, audit", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  // Karel (r3) na plný r2 (kapacita 1, obsazeno Petrem)
  await act(page, "DDD-5555", "move");
  await expect(page.getByTestId("dialog-move")).toBeVisible();
  await expect(page.getByTestId("send-email")).toBeChecked();
  await expect(page.getByTestId("submit-move")).toBeDisabled();
  await page.getByTestId("move-to").selectOption("r2");
  await expect(page.getByTestId("over-capacity")).toContainText("Termín je plný");
  await expect(page.getByTestId("submit-move")).toBeDisabled();
  await shot(page, "presun");
  await page.getByTestId("force-over").check();
  await page.getByTestId("submit-move").click();
  await expect(page.getByTestId("dialog-move")).toHaveCount(0);
  await expect.poll(() => items("g4")).toBe("r2");
  await expect(page.locator("[data-testid=occupancy] [data-item=r2] [data-testid=occupancy-text]")).toHaveText("2 / 1");
  expect(mails("events.registration.moved", `and recipient='karel@example.com'`)).toBe("1");
  expect(sql(`select summary from "AuditLog" where action='events.registration.move'`)).toContain("nad kapacitu");
  expect(sql(`select "actorId" from "AuditLog" where action='events.registration.move'`)).toBe("usr_teacher");

  // zpět na r3 (bez omezení): žádné varování, bez e-mailu
  await act(page, "DDD-5555", "move");
  await page.getByTestId("move-to").selectOption("r3");
  await expect(page.getByTestId("over-capacity")).toHaveCount(0);
  await page.getByTestId("send-email").uncheck();
  await page.getByTestId("submit-move").click();
  await expect.poll(() => items("g4")).toBe("r3");
  expect(mails("events.registration.moved")).toBe("1");
  expect(audits("events.registration.move")).toBe("2");

  // registrace se dvěma termíny: z kterého termínu (Jana na r1 a r3 → r2)
  await act(page, "AAA-2222", "move");
  await expect(page.getByTestId("move-from")).toBeEnabled();
  await page.getByTestId("move-from").selectOption("r3");
  await page.getByTestId("move-to").selectOption("r2");
  await page.getByTestId("force-over").check();
  await page.getByTestId("submit-move").click();
  await expect.poll(() => items("g1")).toBe("r1,r2");
});

test("přesun: vypnutý e-mail o přesunu přesun nezastaví; server nad kapacitu bez potvrzení odmítne", async ({ browser }) => {
  seed();
  sql(`insert into "SystemSetting"(key,value) values ('email.event.events.registration.moved.enabled','false') on conflict (key) do update set value='false'`);
  const page = await openTab(browser);
  await act(page, "DDD-5555", "move");
  await page.getByTestId("move-to").selectOption("r1");
  // r1: kapacita 2, obsazeno Janou + 1 doprovod = 2 → plno
  await page.getByTestId("force-over").check();
  await page.getByTestId("submit-move").click();
  await expect.poll(() => items("g4")).toBe("r1");
  expect(mails("events.registration.moved")).toBe("0");
  expect(sql(`select count(*) from "EmailLog" where event='events.registration.moved' and status='SKIPPED_DISABLED'`)).toBe("1");

  // server: obsazenost se změnila po otevření dialogu (na r2 je obsazeno) a „přesto“ není zaškrtnuto → odmítne
  await act(page, "DDD-5555", "move");
  await page.getByTestId("move-to").selectOption("r3");
  sql(`update "EventItem" set capacity=1 where id='r3'`);
  sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('g2','r3')`);
  await page.getByTestId("submit-move").click();
  await expect(page.locator("[data-sonner-toast]").last()).toContainText("plný");
  expect(items("g4")).toBe("r1");
});

test("odebrání z termínu a zrušení registrace: e-maily podle volby, audit, místa se uvolní", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  // jediný termín: „odebrat z termínu“ se nenabízí
  await page.getByTestId("reg-row").first().scrollIntoViewIfNeeded();
  await row(page, "BBB-3333").getByTestId("row-actions").click();
  await expect(page.locator("[role=menuitem][data-action=remove]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[role=menu]")).toHaveCount(0);

  await act(page, "AAA-2222", "remove");
  await expect(page.getByTestId("dialog-remove")).toBeVisible();
  await page.getByTestId("remove-item").selectOption("r1");
  await shot(page, "odebrani");
  await page.getByTestId("submit-remove").click();
  await expect(page.getByTestId("dialog-remove")).toHaveCount(0);
  await expect.poll(() => items("g1")).toBe("r3");
  await expect(page.locator("[data-testid=occupancy] [data-item=r1] [data-testid=occupancy-text]")).toHaveText("0 / 2");
  expect(mails("events.registration.removed", `and recipient='jana@example.com'`)).toBe("1");
  expect(audits("events.registration.remove_item")).toBe("1");
  // teď je termín jediný: jen zrušení
  await row(page, "AAA-2222").getByTestId("row-actions").click();
  await expect(page.locator("[role=menuitem][data-action=remove]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[role=menu]")).toHaveCount(0);

  // zrušení bez e-mailu
  await act(page, "BBB-3333", "cancel");
  await expect(page.getByTestId("send-email")).toBeChecked();
  await page.getByTestId("send-email").uncheck();
  await page.getByTestId("submit-cancel").click();
  await expect.poll(() => sql(`select status||'|'||("cancelledAt" is not null) from "EventRegistration" where id='g2'`)).toBe("CANCELLED|true");
  expect(mails("events.registration.removed")).toBe("1");
  await expect(row(page, "BBB-3333")).toHaveCount(0);
  await expect(page.locator("[data-testid=occupancy] [data-item=r2] [data-testid=occupancy-text]")).toHaveText("0 / 1");
  // zrušení s e-mailem (výchozí)
  await act(page, "DDD-5555", "cancel");
  await page.getByTestId("submit-cancel").click();
  await expect.poll(() => sql(`select status from "EventRegistration" where id='g4'`)).toBe("CANCELLED");
  expect(mails("events.registration.removed", `and recipient='karel@example.com'`)).toBe("1");
  expect(audits("events.registration.cancel_manual")).toBe("2");
  // zrušená registrace už nejde dál měnit (server)
  expect(sql(`select count(*) from "AuditLog" where summary like '%@%'`)).toBe("0");
});

test("export CSV: všechna pole včetně vlastních a skrytých s daty, stav, termíny, čas registrace", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  const resp = await page.request.get("/api/events/evO/export");
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toContain("text/csv");
  expect(resp.headers()["content-disposition"]).toContain('filename="registrace-org.csv"');
  expect(resp.headers()["cache-control"]).toContain("no-store");
  const csv = await resp.text();
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trim().split("\r\n");
  expect(lines[0]).toBe("Kód;Stav;Jméno;E-mail;Telefon;Současná škola;Poznámka;Oblíbený předmět;Souhlas s fotkou;Počet osob;Termíny;Registrováno;Zrušeno");
  expect(lines).toHaveLength(5); // hlavička + 4 registrace (i zrušená)
  const jana = lines.find((l) => l.startsWith("AAA-2222"))!.split(";");
  expect(jana.slice(0, 10)).toEqual(["AAA-2222", "Potvrzená", "Jana Nová", "jana@example.com", "+420 123 456 789", "ZŠ Dukla", "Přijdu s dcerou", "Fyzika", "ano", "2"]);
  expect(jana[10]).toContain("Dopoledne");
  expect(jana[10]).toContain(" | ");
  expect(jana[11]).toMatch(/^\d{1,2}\. \d{1,2}\. \d{4} \d{2}:\d{2}$/);
  expect(lines.find((l) => l.startsWith("CCC-4444"))).toContain(";Zrušená;");
  expect(audits("events.registrations.export")).toBe("1");
  // tlačítko na stránce vede na export
  await expect(page.getByTestId("export-csv")).toHaveAttribute("href", "/api/events/evO/export");
});

test("QR kód odkazu: PNG a SVG ke stažení, jen pro organizátora", async ({ browser }) => {
  seed();
  const page = await openTab(browser);
  await expect(page.getByTestId("qr-image")).toBeVisible();
  expect(await page.getByTestId("qr-image").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
  const png = await page.request.get("/api/events/evO/qr");
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect(png.headers()["cache-control"]).toContain("no-store");
  expect((await png.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const svg = await page.request.get("/api/events/evO/qr?format=svg&download=1");
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(svg.headers()["content-disposition"]).toBe('attachment; filename="qr-org.svg"');
  expect(await svg.text()).toContain("<svg");
  expect((await page.request.get("/api/events/evO/qr?format=png&download=1")).headers()["content-disposition"]).toBe('attachment; filename="qr-org.png"');
  await expect(page.getByTestId("qr-png")).toHaveAttribute("href", "/api/events/evO/qr?format=png&download=1");
  await expect(page.getByTestId("qr-svg")).toHaveAttribute("href", "/api/events/evO/qr?format=svg&download=1");
  await expect(page.getByTestId("qr-card").getByTestId("copy-event-link")).toBeVisible();
  await shot(page, "qr");

  // nepřihlášený a cizí učitel: 404 (ani export, ani QR)
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.request.get("/api/events/evO/qr")).status()).not.toBe(200);
  expect((await anon.request.get("/api/events/evO/export")).status()).not.toBe(200);
});

test("oprávnění: cizí učitel nemá přístup, spoluorganizátor a admin ano, zobrazit jako je jen pro čtení", async ({ browser }) => {
  seed();
  // cizí učitel: záložka, export i QR se tváří, že neexistují
  const other = await login(browser, "teacher.b@skola.cz");
  const resp = await other.goto("/events/evO?tab=registrations");
  expect(resp!.status()).toBe(404);
  await expect(other.getByTestId("registrations-tab")).toHaveCount(0);
  expect((await other.request.get("/api/events/evO/export")).status()).toBe(404);
  expect((await other.request.get("/api/events/evO/qr")).status()).toBe(404);
  expect((await other.request.get("/api/events/evO/qr?format=svg")).status()).toBe(404);
  await other.context().close();

  // spoluorganizátor
  sql(`insert into "EventOrganizer"("eventId","userId") values ('evO','usr_teacher_b')`);
  const co = await openTab(browser, DESKTOP, "teacher.b@skola.cz");
  await expect(co.getByTestId("registrations-tab")).toBeVisible();
  await expect(co.getByTestId("reg-row")).toHaveCount(3);
  expect((await co.request.get("/api/events/evO/export")).status()).toBe(200);
  await co.context().close();
  sql(`delete from "EventOrganizer" where "userId"='usr_teacher_b'`);

  // admin spravuje všechno
  const admin = await openTab(browser, DESKTOP, "admin@skola.cz");
  await expect(admin.getByTestId("reg-row")).toHaveCount(3);
  await act(admin, "DDD-5555", "cancel");
  await admin.getByTestId("send-email").uncheck();
  await admin.getByTestId("submit-cancel").click();
  await expect.poll(() => sql(`select status from "EventRegistration" where id='g4'`)).toBe("CANCELLED");
  expect(sql(`select "actorId" from "AuditLog" where action='events.registration.cancel_manual'`)).toBe("usr_admin");

  // zobrazit jako učitel: jen čtení (bez tlačítek, akce server odmítne, export bez zápisu do historie)
  const before = audits("events.registrations.export");
  const cookie = await signImpersonation({ a: "usr_admin", t: "usr_teacher", r: "TEACHER", exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.NEXTAUTH_SECRET!);
  await admin.context().addCookies([{ name: IMPERSONATION_COOKIE, value: cookie, domain: "localhost", path: "/" }]);
  await admin.goto("/events/evO?tab=registrations");
  await admin.waitForLoadState("networkidle");
  await expect(admin.getByTestId("impersonation-banner")).toBeVisible();
  await expect(admin.getByTestId("registrations-tab")).toBeVisible();
  await expect(admin.getByTestId("add-registration")).toHaveCount(0);
  await expect(admin.getByTestId("row-actions")).toHaveCount(0);
  expect((await admin.request.get("/api/events/evO/export")).status()).toBe(200);
  expect(audits("events.registrations.export")).toBe(before);
});

test("archivovaná událost: jen čtení a export", async ({ browser }) => {
  seed();
  sql(`update "Event" set status='ARCHIVED' where id='evO'`);
  const page = await openTab(browser);
  await expect(page.getByTestId("add-registration")).toHaveCount(0);
  await expect(page.getByTestId("row-actions")).toHaveCount(0);
  await expect(page.getByTestId("export-csv")).toBeVisible();
});
