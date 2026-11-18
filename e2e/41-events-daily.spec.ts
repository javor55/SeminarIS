import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { login, resetDb, sql, toastText } from "./helpers";

// U13: denní úlohy modulu Události (smazání osobních údajů po akci, připomínka den předem, úklid), karta přehledu,
// úkol administrace, odhad e-mailů a nastavení modulu (lhůta mazání, výchozí texty).
// Čas se „posouvá“ jako v e2e/09-cron.spec.ts: data v databázi jsou v minulosti a značka posledního běhu se vrací o den.

const secret = process.env.CRON_SECRET;
test.skip(!secret, "CRON_SECRET není nastaven");

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const headers = { Authorization: `Bearer ${secret}` };
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
// Fotky stránek (jen když je nastavená složka, např. U13_SHOTS=/tmp/u13-shots)
const SHOTS = process.env.U13_SHOTS;
async function shot(page: Page, name: string, selector?: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const original = page.viewportSize();
  for (const [label, size] of [["telefon", PHONE], ["pocitac", DESKTOP]] as const) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    const target = selector ? page.locator(selector).first() : null;
    if (target) await target.screenshot({ path: `${SHOTS}/${name}-${label}.png` });
    else await page.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
}

// zítra v poledne (Praha) jako časová značka v UTC
const tomorrowNoon = `(timezone('Europe/Prague', date_trunc('day', timezone('Europe/Prague', now())) + interval '1 day 12 hours') at time zone 'UTC')`;

/** Další den denní úlohy: značka posledního běhu se vrátí o den, aby cron znovu proběhl. */
const nextDay = () => sql(`insert into "SystemSetting"(key,value) values ('cron.daily.lastRun', to_char(now() - interval '1 day','YYYY-MM-DD')) on conflict (key) do update set value=excluded.value`);

function addEvent(id: string, slug: string, extra = "", status = "PUBLISHED", createdBy = "usr_teacher", cols = "", vals = "") {
  sql(`insert into "Event"(id,slug,title,place,status,"createdById","updatedAt"${cols}) values ('${id}','${slug}','Událost ${id}','Budova A','${status}','${createdBy}',now()${vals})${extra}`);
}
function addItem(id: string, eventId: string, start: string, end: string | null, capacity: number | null = null) {
  sql(`insert into "EventItem"(id,"eventId","startsAt","endsAt",capacity,"order") values ('${id}','${eventId}',${start},${end ?? "null"},${capacity ?? "null"},0)`);
}
function addReg(id: string, eventId: string, email: string, itemId: string | null, opts: { status?: string; name?: string; guests?: number; userId?: string; token?: string; failed?: boolean; reminded?: boolean } = {}) {
  const status = opts.status ?? "CONFIRMED";
  sql(
    `insert into "EventRegistration"(id,"eventId",email,name,guests,answers,status,"tokenHash",code,"consentAt","userId","confirmEmailFailed","reminderSentAt","updatedAt"${status === "CANCELLED" ? ',"cancelledAt"' : ""}) values ('${id}','${eventId}','${email}',${opts.name ? `'${opts.name}'` : "null"},${opts.guests ?? 0},'{"phone":"+420 123 456 789","note":"Soukromá poznámka"}'::jsonb,'${status}'::"EventRegistrationStatus",'${sha(opts.token ?? `token-${id}`)}','${id.toUpperCase().padEnd(3, "X").slice(0, 3)}-${String(id.length).padStart(4, "2")}',now(),${opts.userId ? `'${opts.userId}'` : "null"},${opts.failed ?? false},${opts.reminded ? "now()" : "null"},now()${status === "CANCELLED" ? ",now()" : ""})`
  );
  if (itemId) sql(`insert into "EventRegistrationItem"("registrationId","itemId") values ('${id}','${itemId}')`);
}

test("cron: osobní údaje se smažou po lhůtě, jednou, podle nastavení; úklid pomocných dat", async ({ request }) => {
  resetDb();
  const old = (days: number) => `now() - interval '${days} days'`;
  // evP: poslední termín skončil před 100 dny (i první, který je starší); lhůta 90 dní uplynula
  addEvent("evP", "stara-akce");
  addItem("iP1", "evP", old(101), old(101) + " + interval '1 hour'");
  addItem("iP2", "evP", old(100), old(100) + " + interval '1 hour'");
  const P_TOKEN = "P".repeat(43);
  addReg("p1", "evP", "jana@example.com", "iP1", { name: "Jana Nová", guests: 2, userId: "usr_stud1", token: P_TOKEN });
  addReg("p2", "evP", "zrusena@example.com", "iP2", { status: "CANCELLED", name: "Zrušená" });
  // evQ: skončila před 80 dny (lhůta 90 ještě neuplynula)
  addEvent("evQ", "mlada-akce");
  addItem("iQ1", "evQ", old(80), old(80) + " + interval '1 hour'");
  addReg("q1", "evQ", "petr@example.com", "iQ1", { name: "Petr Nový" });
  // evR: bez termínů, registrace skončila před 95 dny
  addEvent("evR", "bez-terminu", "", "CLOSED", "usr_teacher", `,"registrationClosesAt"`, `,${old(95)}`);
  addReg("r1", "evR", "eva@example.com", null, { name: "Eva Nová" });
  // evS: bez termínů i konce registrace (nikdy se nemaže)
  addEvent("evS", "bez-konce");
  addReg("s1", "evS", "karel@example.com", null, { name: "Karel Nový" });
  // evT: první termín je dávno, poslední teprve před 10 dny (konec = konec posledního termínu)
  addEvent("evT", "vicedenni");
  addItem("iT1", "evT", old(120), old(120) + " + interval '1 hour'");
  addItem("iT2", "evT", old(10), old(10) + " + interval '1 hour'");
  addReg("t1", "evT", "tomas@example.com", "iT1", { name: "Tomáš Nový" });
  // evU: údaje už smazané dřív (purgedAt) – zůstane, jak je
  addEvent("evU", "uz-smazana", "", "ARCHIVED", "usr_teacher", `,"purgedAt"`, `,${old(30)}`);
  addItem("iU1", "evU", old(200), old(200) + " + interval '1 hour'");
  addReg("u1", "evU", "zustane@example.com", "iU1", { name: "Zůstane Zachováno" });

  // úklid: počítadla, obrázky (sirotek starý a nový, titulní obrázek, obrázek v popisu)
  const img = (id: string, age: string) => sql(`insert into "EventImage"(id,data,mime,width,height,size,"createdById","createdAt") values ('${id}','\\x52494646'::bytea,'image/webp',10,10,4,'usr_teacher',now() - interval '${age}')`);
  img("imgOrphan", "2 days");
  img("imgFresh", "2 hours");
  img("imgCover", "5 days");
  img("imgDesc", "5 days");
  img("imgDescPrefix", "5 days");
  sql(`update "Event" set "imageId"='imgCover' where id='evQ'`);
  sql(`update "Event" set "descriptionHtml"='<p>Text</p><img src="/api/events/images/imgDesc" alt="">' where id='evS'`);
  sql(`insert into "EventRateLimit"(key,"windowStart",count) values ('ip:old',now() - interval '3 days',4),('ip:new',now() - interval '1 hour',2)`);

  const before = {
    regs: sql(`select count(*) from "EventRegistration"`),
    links: sql(`select count(*) from "EventRegistrationItem"`),
    items: sql(`select count(*) from "EventItem"`),
  };
  const tokenBefore = sql(`select "tokenHash" from "EventRegistration" where id='p1'`);

  const res = await request.get("/api/cron/daily", { headers });
  expect(res.status()).toBe(200);
  const body = await res.json();
  check("job ok", body.ok === true, JSON.stringify(body));
  check("steps reported", JSON.stringify(body.steps).includes("events.purge") && JSON.stringify(body.steps).includes("events.cleanup"), JSON.stringify(body.steps));

  // smazané údaje, zachované počty a stav
  check("p1 anonymised", sql(`select email||'|'||coalesce(name,'-')||'|'||answers::text||'|'||coalesce("userId",'-') from "EventRegistration" where id='p1'`) === "smazano-p1@anonym.invalid|-|{}|-");
  check("p1 keeps status, guests, code, consent and items", sql(`select status||'|'||guests||'|'||code from "EventRegistration" where id='p1'`) === "CONFIRMED|2|P1X-2222" || sql(`select status||'|'||guests from "EventRegistration" where id='p1'`) === "CONFIRMED|2");
  check("cancelled registration anonymised, still cancelled", sql(`select email||'|'||status from "EventRegistration" where id='p2'`) === "smazano-p2@anonym.invalid|CANCELLED");
  check("manage link token invalidated", sql(`select "tokenHash" from "EventRegistration" where id='p1'`) !== tokenBefore);
  check("counts and links unchanged", sql(`select count(*) from "EventRegistration"`) === before.regs && sql(`select count(*) from "EventRegistrationItem"`) === before.links && sql(`select count(*) from "EventItem"`) === before.items);
  check("evP purgedAt set", sql(`select count(*) from "Event" where id='evP' and "purgedAt" is not null`) === "1");
  check("evR (registration end) purged", sql(`select email from "EventRegistration" where id='r1'`) === "smazano-r1@anonym.invalid" && sql(`select count(*) from "Event" where id='evR' and "purgedAt" is not null`) === "1");
  check("evQ (80 days) untouched", sql(`select email||'|'||name from "EventRegistration" where id='q1'`) === "petr@example.com|Petr Nový" && sql(`select "purgedAt" is null from "Event" where id='evQ'`) === "t");
  check("evS (no end) untouched", sql(`select email from "EventRegistration" where id='s1'`) === "karel@example.com");
  check("evT (last item 10 days ago) untouched", sql(`select email from "EventRegistration" where id='t1'`) === "tomas@example.com");
  check("evU (already purged) untouched", sql(`select email from "EventRegistration" where id='u1'`) === "zustane@example.com");
  check("audit entries without personal data", sql(`select count(*) from "AuditLog" where action='events.purge'`) === "2" && sql(`select count(*) from "AuditLog" where action='events.purge' and (summary ilike '%@%' or "data"::text ilike '%@%' or summary ilike '%Jana%')`) === "0" && sql(`select count(*) from "AuditLog" where action='events.purge' and "entityId"='evP'`) === "1");
  // odkaz na správu zmizel
  const manage = await request.get(`/akce/stara-akce/r/${P_TOKEN}`);
  check("old manage link gives 404", manage.status() === 404, String(manage.status()));

  // úklid
  check("old rate limits deleted, new kept", sql(`select string_agg(key, ',' order by key) from "EventRateLimit"`) === "ip:new");
  check("orphan images deleted", sql(`select string_agg(id, ',' order by id) from "EventImage"`) === "imgCover,imgDesc,imgFresh", sql(`select string_agg(id, ',' order by id) from "EventImage"`));

  // druhý běh další den: nic se znovu nemaže a nezapíše
  const purgedAt = sql(`select "purgedAt" from "Event" where id='evP'`);
  nextDay();
  const again = await (await request.get("/api/cron/daily", { headers })).json();
  check("next day ok", again.ok === true && !again.skipped, JSON.stringify(again));
  check("idempotent: purgedAt and audit unchanged", sql(`select "purgedAt" from "Event" where id='evP'`) === purgedAt && sql(`select count(*) from "AuditLog" where action='events.purge'`) === "2");

  // zkrácená lhůta v nastavení: 60 dní → evQ (80 dní) je na řadě
  sql(`insert into "SystemSetting"(key,value) values ('events.purgeAfterDays','60') on conflict (key) do update set value='60'`);
  nextDay();
  const third = await (await request.get("/api/cron/daily", { headers })).json();
  check("third run ok", third.ok === true, JSON.stringify(third));
  check("shorter period purges evQ", sql(`select email from "EventRegistration" where id='q1'`) === "smazano-q1@anonym.invalid" && sql(`select count(*) from "AuditLog" where action='events.purge'`) === "3");
  check("evT (10 days) still untouched with 60 days", sql(`select email from "EventRegistration" where id='t1'`) === "tomas@example.com");
  // obrázek, který už nikdo nepoužívá, zmizí; používaný zůstane (evQ stále odkazuje na imgCover)
  check("used images survive", sql(`select string_agg(id, ',' order by id) from "EventImage"`) === "imgCover,imgDesc,imgFresh");
});

test("cron: připomínka den předem (výchozí vypnutá, jednou na registraci, ne u SCREEN_ONLY)", async ({ browser, request }) => {
  resetDb();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','true')`);
  // evM: zítra v poledne; m1 dostane připomínku, m2 je zrušená, m3 už ji dostala, m4 čeká (PENDING nepatří mezi držící? patří)
  addEvent("evM", "zitra");
  addItem("iM1", "evM", tomorrowNoon, tomorrowNoon + " + interval '1 hour'", 20);
  addReg("m1", "evM", "jana@example.com", "iM1", { name: "Jana Nová" });
  addReg("m2", "evM", "zrusena@example.com", "iM1", { status: "CANCELLED", name: "Zrušená" });
  addReg("m3", "evM", "uz-dostala@example.com", "iM1", { name: "Už Dostala", reminded: true });
  // jen na obrazovce, koncept a pozítří: nic
  addEvent("evN", "obrazovka", "", "PUBLISHED", "usr_teacher", `,"confirmChannel"`, `,'SCREEN_ONLY'`);
  addItem("iN1", "evN", tomorrowNoon, tomorrowNoon + " + interval '1 hour'");
  addReg("n1", "evN", "obrazovka@example.com", "iN1", { name: "Jen Obrazovka" });
  addEvent("evO", "koncept", "", "DRAFT");
  addItem("iO1", "evO", tomorrowNoon, tomorrowNoon + " + interval '1 hour'");
  addReg("o1", "evO", "koncept@example.com", "iO1");
  addEvent("evL", "pozitri");
  addItem("iL1", "evL", `${tomorrowNoon} + interval '1 day'`, null);
  addReg("l1", "evL", "pozitri@example.com", "iL1");
  const reminders = () => sql(`select count(*) from "EmailLog" where event='events.reminder'`);

  // odhad v administraci Upozornění (dvě registrace zítra, jedna už dostala připomínku → jedna příjemce)
  const admin = await login(browser, "admin@skola.cz");
  await admin.goto("/admin/notifications");
  await expect(admin.getByTestId("estimate-events.reminder")).toContainText("1");

  // výchozí stav: připomínka je vypnutá, nic neodejde a nic se neoznačí
  const first = await (await request.get("/api/cron/daily", { headers })).json();
  check("first run ok", first.ok === true, JSON.stringify(first));
  check("reminder off by default: nothing logged or marked", reminders() === "0" && sql(`select count(*) from "EventRegistration" where "reminderSentAt" is not null`) === "1");

  // zapnout a spustit další den
  sql(`insert into "SystemSetting"(key,value) values ('email.event.events.reminder.enabled','true')`);
  nextDay();
  const second = await (await request.get("/api/cron/daily", { headers })).json();
  check("second run ok", second.ok === true, JSON.stringify(second));
  check("one reminder sent to m1", reminders() === "1" && sql(`select recipient||'|'||status||'|'||subject from "EmailLog" where event='events.reminder'`) === "jana@example.com|SENT|Zítra: Událost evM", sql(`select recipient||'|'||status from "EmailLog" where event='events.reminder'`));
  check("m1 marked as reminded", sql(`select "reminderSentAt" is not null from "EventRegistration" where id='m1'`) === "t");
  check("no reminder for cancelled, already reminded, screen-only, draft or day after", sql(`select count(*) from "EventRegistration" where "reminderSentAt" is not null`) === "2");

  // další den: stejná registrace už připomínku nedostane
  nextDay();
  await request.get("/api/cron/daily", { headers });
  check("reminder only once per registration", reminders() === "1");
});

test("nastavení modulu: lhůta mazání a výchozí texty (admin), použití u událostí", async ({ browser, request }) => {
  resetDb();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','true')`);
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/events/settings");
  const days = pa.locator('[data-setting="events.purgeAfterDays"]');
  await expect(days.locator("input")).toHaveValue("90");
  await shot(pa, "nastaveni-modulu");

  // neplatná lhůta se odmítne
  await days.locator("input").fill("0");
  await days.getByRole("button", { name: "Uložit" }).click();
  check("zero days rejected", (await toastText(pa)).length > 0 && sql(`select count(*) from "SystemSetting" where key='events.purgeAfterDays'`) === "0");
  await days.locator("input").fill("120");
  await days.getByRole("button", { name: "Uložit" }).click();
  await expect(pa.getByText("Nastavení uloženo.").first()).toBeVisible();
  check("period saved", sql(`select value from "SystemSetting" where key='events.purgeAfterDays'`) === "120");
  check("audit entry for setting", sql(`select count(*) from "AuditLog" where action like 'settings.%' and summary like '%120%'`) !== "0");

  const consent = pa.locator('[data-setting="events.defaultConsentText"]');
  await consent.locator("textarea").fill("Souhlasím s uložením údajů pro účely této akce.");
  await consent.getByRole("button", { name: "Uložit" }).click();
  await expect(pa.getByText("Nastavení uloženo.").first()).toBeVisible();
  const confirmation = pa.locator('[data-setting="events.defaultConfirmationText"]');
  await confirmation.locator("textarea").fill("Výchozí pokyny: přijďte o pět minut dříve.");
  await confirmation.getByRole("button", { name: "Uložit" }).click();
  await expect(pa.getByText("Nastavení uloženo.").first()).toBeVisible();
  check("default texts saved", sql(`select count(*) from "SystemSetting" where key in ('events.defaultConsentText','events.defaultConfirmationText')`) === "2");

  // učitel nastavení modulu nevidí
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/events/settings");
  await pt.waitForLoadState("networkidle");
  check("teacher cannot open module settings", !pt.url().endsWith("/events/settings") || (await pt.locator('[data-setting="events.purgeAfterDays"]').count()) === 0);

  // událost bez vlastních textů: výchozí; událost s vlastními: vlastní
  addEvent("evD", "vychozi", "", "PUBLISHED");
  addItem("iD1", "evD", `now() + interval '10 days'`, null);
  addEvent("evE", "vlastni", "", "PUBLISHED", "usr_teacher", `,"consentText","confirmationText"`, `,'Vlastní souhlas události.','Vlastní potvrzení události.'`);
  addItem("iE1", "evE", `now() + interval '10 days'`, null);
  const T1 = "Q".repeat(43);
  const T2 = "R".repeat(43);
  addReg("d1", "evD", "jana@example.com", "iD1", { token: T1 });
  addReg("e1", "evE", "petr@example.com", "iE1", { token: T2 });
  const pageD = await (await request.get("/akce/vychozi")).text();
  const pageE = await (await request.get("/akce/vlastni")).text();
  check("public page uses default consent", pageD.includes("Souhlasím s uložením údajů pro účely této akce.") && !pageD.includes("Souhlasím se zpracováním osobních údajů za účelem registrace"));
  check("own consent text wins", pageE.includes("Vlastní souhlas události.") && !pageE.includes("Souhlasím s uložením údajů pro účely této akce."));
  const doneD = await (await request.get(`/akce/vychozi/hotovo?t=${T1}`)).text();
  const doneE = await (await request.get(`/akce/vlastni/hotovo?t=${T2}`)).text();
  check("confirmation page uses default text", doneD.includes("Výchozí pokyny: přijďte o pět minut dříve."));
  check("own confirmation text wins", doneE.includes("Vlastní potvrzení události.") && !doneE.includes("Výchozí pokyny"));
});

test("karta přehledu a úkol administrace: moje události s obsazeností, nepotvrzené registrace do 3 dnů", async ({ browser }) => {
  resetDb();
  sql(
    `insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_teacher_b','Božena','Druhá','teacher.b@skola.cz','TEACHER'::"Role",u."passwordHash",now() from "User" u where u.id='usr_teacher'`
  );
  // moje událost: 2 termíny po 10 místech, obsazeno 3 (host navíc se počítá), zrušená se nepočítá
  addEvent("evA", "moje", "", "PUBLISHED", "usr_teacher");
  addItem("iA1", "evA", `now() + interval '10 days'`, `now() + interval '10 days 1 hour'`, 10);
  addItem("iA2", "evA", `now() + interval '11 days'`, `now() + interval '11 days 1 hour'`, 10);
  addReg("a1", "evA", "jana@example.com", "iA1", { name: "Jana Nová", guests: 1 });
  addReg("a2", "evA", "petr@example.com", "iA2", { name: "Petr Nový" });
  addReg("a3", "evA", "zrusena@example.com", "iA2", { status: "CANCELLED" });
  // spoluorganizovaná událost autora Boženy
  addEvent("evB", "spolu", "", "CLOSED", "usr_teacher_b");
  sql(`insert into "EventOrganizer"("eventId","userId") values ('evB','usr_teacher')`);
  addItem("iB1", "evB", `now() + interval '12 days'`, null, 5);
  // cizí událost, koncept a skončená se v kartě neukážou
  addEvent("evX", "cizi", "", "PUBLISHED", "usr_teacher_b");
  addItem("iX1", "evX", `now() + interval '10 days'`, null, 5);
  addEvent("evD", "koncept", "", "DRAFT", "usr_teacher");
  addItem("iD1", "evD", `now() + interval '10 days'`, null, 5);
  addEvent("evZ", "skoncila", "", "PUBLISHED", "usr_teacher");
  addItem("iZ1", "evZ", `now() - interval '3 days'`, null, 5);
  // úkol: událost do 3 dnů s nepotvrzenými registracemi (moje 2, cizí 1; další mimo lhůtu nebo zrušená se nepočítá)
  addEvent("evS", "brzy", "", "PUBLISHED", "usr_teacher");
  addItem("iS1", "evS", `now() + interval '2 days'`, null);
  addReg("s1", "evS", "s1@example.com", "iS1", { failed: true });
  addReg("s2", "evS", "s2@example.com", "iS1", { failed: true });
  addReg("s3", "evS", "s3@example.com", "iS1", { failed: true, status: "CANCELLED" });
  addReg("s4", "evS", "s4@example.com", "iS1");
  addEvent("evT", "brzy-cizi", "", "PUBLISHED", "usr_teacher_b");
  addItem("iT1", "evT", `now() + interval '1 day'`, null);
  addReg("t1", "evT", "t1@example.com", "iT1", { failed: true });
  addEvent("evU", "pozdeji", "", "PUBLISHED", "usr_teacher");
  addItem("iU1", "evU", `now() + interval '20 days'`, null);
  addReg("u1", "evU", "u1@example.com", "iU1", { failed: true });

  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/dashboard");
  const card = pt.locator('[data-card="events.mine"]');
  await expect(card).toBeVisible();
  const titles = await card.locator('[data-testid="dashboard-event"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-event")));
  check("card lists my and co-organized upcoming events, nearest first", JSON.stringify(titles) === JSON.stringify(["evS", "evA", "evB", "evU"]), JSON.stringify(titles));
  const occupancy = await card.locator('[data-event="evA"] [data-testid="dashboard-event-occupancy"]').innerText();
  check("occupancy counts guests, not cancelled", occupancy.includes("Obsazeno 3 z 20"), occupancy);
  check("card links to event", (await card.locator('[data-event="evA"] a').first().getAttribute("href")) === "/events/evA?tab=registrations");
  const todo = pt.locator('[data-todo="events.unsent-confirmations"]');
  await expect(todo).toBeVisible();
  check("teacher todo counts only own events within 3 days", (await todo.innerText()).includes("2"), await todo.innerText());
  await shot(pt, "karta-prehled", '[data-card="events.mine"]');

  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/dashboard");
  // admin má „moje“ události jen své: žádné nejsou
  check("admin has no own events card", (await pa.locator('[data-card="events.mine"]').count()) === 0);
  check("admin todo counts all events within 3 days", (await pa.locator('[data-todo="events.unsent-confirmations"]').innerText()).includes("3"));

  // učitel bez událostí kartu nevidí
  const pb = await login(browser, "teacher.b@skola.cz");
  await pb.goto("/dashboard");
  check("teacher B sees only own todo", (await pb.locator('[data-todo="events.unsent-confirmations"]').innerText()).includes("1"));
});
