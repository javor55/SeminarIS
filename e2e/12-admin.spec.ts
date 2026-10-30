import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText } from "./helpers";

// Administrace se sekcemi (F2): boční menu, přehled „co udělat“, nastavení přes registr,
// sekce modulů a diagnostika.

const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);
const auditCount = (where: string) => Number(sql(`select count(*) from "AuditLog" where ${where}`));

const NAV = ["Přehled", "Registrace a přihlášení", "Školní rok a třídy", "Moduly", "Upozornění", "Historie", "Diagnostika", "Semináře", "Dopisování"];

test("administrace: boční menu s oddíly, staré adresy fungují, na mobilu je výběr", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/admin");
  const nav = pa.getByTestId("admin-nav");
  await expect(nav).toBeVisible();
  check("nav lists core and module sections", JSON.stringify(await nav.getByRole("link").allInnerTexts()) === JSON.stringify(NAV), JSON.stringify(await nav.getByRole("link").allInnerTexts()));
  check("overview is current", (await nav.locator("[aria-current=page]").innerText()) === "Přehled");

  // každá sekce se otevře z menu
  const targets: [string, string, RegExp][] = [
    ["Registrace a přihlášení", "/admin/registration", /Registrace a přihlášení/],
    ["Školní rok a třídy", "/admin/school-year", /Školní rok a třídy/],
    ["Moduly", "/admin/modules", /Moduly/],
    ["Upozornění", "/admin/notifications", /Upozornění/],
    ["Historie", "/admin/history", /Historie změn|Změny v systému/],
    ["Diagnostika", "/admin/diagnostics", /Diagnostika/],
    ["Semináře", "/enrollments/settings", /Semináře/],
    ["Dopisování", "/makeup/settings", /Dopisování/],
  ];
  for (const [label, url, heading] of targets) {
    await pa.getByTestId("admin-nav").getByRole("link", { name: label, exact: true }).click();
    await pa.waitForURL("**" + url);
    await expect(pa.getByRole("heading", { level: 1 })).toContainText(heading);
    check(`${label}: menu stays and highlights`, (await pa.getByTestId("admin-nav").locator("[aria-current=page]").innerText()) === label);
  }

  // adresy z doby před menu zůstávají: průvodce uzavřením roku patří pod Školní rok a třídy
  for (const url of ["/admin/notifications", "/admin/history", "/admin/close-year"]) {
    const res = await pa.goto(url);
    check(`${url} still works`, res!.status() === 200 && pa.url().endsWith(url), String(res!.status()));
  }
  check("close-year highlights school year section", (await pa.getByTestId("admin-nav").locator("[aria-current=page]").innerText()) === "Školní rok a třídy");
  // správa tříd je v administraci, v Uživatelích zůstal odkaz
  await pa.goto("/users");
  await pa.getByTestId("classes-link").click();
  await pa.waitForURL("**/admin/school-year");

  // mobil: menu je výběr nad obsahem
  await pa.setViewportSize({ width: 390, height: 800 });
  await pa.goto("/admin");
  await expect(pa.getByTestId("admin-nav")).toBeHidden();
  const select = pa.getByTestId("admin-nav-select");
  await expect(select).toBeVisible();
  await select.selectOption({ label: "Moduly" });
  await pa.waitForURL("**/admin/modules");
  check("select follows the page", (await pa.getByTestId("admin-nav-select").inputValue()) === "/admin/modules");

  // ne-admin do administrace nesmí
  const pt = await login(browser, "teacher@skola.cz");
  for (const url of ["/admin", "/admin/diagnostics", "/enrollments/settings", "/makeup/settings"]) {
    await pt.goto(url);
    check(`teacher ${url} redirected`, pt.url().endsWith("/dashboard"), pt.url());
  }
});

test("přehled „co udělat“: položky jádra i modulů s odkazy, po vyřešení mizí, vypnutý modul nic nedodává", async ({ browser }) => {
  resetDb();
  seedSubjects();
  // čekající registrace, student bez třídy (a bez účasti v zápisu), termín dopisování bez předmětů
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('g1','Host','Jedna','g1@skola.cz','GUEST',now()),('g2','Host','Dva','g2@skola.cz','GUEST',now())`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('nc1','Bez','Třídy','nc1@skola.cz','STUDENT',now())`);
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('nos','usr_teacher',now()+interval '3 days',now()+interval '3 days 45 min','204',5,60,'usr_teacher',now())`);

  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/admin");
  const todo = (id: string) => pa.locator(`[data-todo="${id}"]`);
  await expect(pa.getByTestId("admin-todos")).toBeVisible();

  check("pending accounts counted", (await todo("core.pending-accounts").getByTestId("todo-count").innerText()) === "2");
  check("pending accounts links to approvals", (await todo("core.pending-accounts").getByRole("link").getAttribute("href")) === "/users?tab=approvals");
  check("students without class listed", (await todo("core.students-without-class").count()) === 1);
  // seminars: otevřené okno, ve kterém někdo chybí
  const windowId = sql(`select id from "EnrollmentWindow" where status='OPEN' limit 1`);
  const unenrolled = pa.locator(`[data-todo="seminars.unenrolled.${windowId}"]`);
  check("seminars todo present and links to the window", (await unenrolled.count()) === 1 && (await unenrolled.getByRole("link").getAttribute("href")) === `/enrollments/${windowId}`);
  // makeup
  check("makeup todo present", (await todo("makeup.without-subjects").count()) === 1 && (await todo("makeup.without-subjects").getByTestId("todo-count").innerText()) === "1");
  // informativní položky a závažnost
  check("daily job never ran is info", (await todo("core.cron-never").getAttribute("data-severity")) === "info");
  check("zero-count todos are hidden", (await todo("core.email-failed").count()) === 0 && (await todo("seminars.nonexistent").count()) === 0);
  check("stats are below todos", (await pa.getByTestId("admin-stats").innerText()).includes("Uživatelé celkem"));

  // položka vede na řešení
  await todo("core.pending-accounts").getByRole("link").click();
  await pa.waitForURL("**/users?tab=approvals");
  await expect(pa.locator("a[data-tab=approvals]")).toContainText("(2)");

  // vyřešeno -> položka zmizí
  sql(`update "User" set role='STUDENT' where id in ('g1','g2')`);
  sql(`update "User" set "classGroupId"=(select id from "ClassGroup" limit 1) where role='STUDENT' and "classGroupId" is null`);
  await pa.goto("/admin");
  check("pending todo gone after approval", (await todo("core.pending-accounts").count()) === 0);
  check("without class todo gone", (await todo("core.students-without-class").count()) === 0);

  // denní úloha, která chyběla/selhala, se objeví
  sql(`insert into "SystemSetting"(key,value) values ('cron.daily.lastRun', to_char(now() - interval '5 days','YYYY-MM-DD'))`);
  await pa.goto("/admin");
  check("stale daily job warns", (await todo("core.cron-stale").getAttribute("data-severity")) === "warning" && (await todo("core.cron-never").count()) === 0);

  // vypnutý modul nic nedodává (vypnout přes administraci, ať se zneplatní cache modulů)
  await pa.goto("/admin/modules");
  await pa.locator("#module-makeup").click();
  await toastText(pa);
  await pa.goto("/admin");
  check("makeup todo hidden when module disabled", (await todo("makeup.without-subjects").count()) === 0);
  check("seminars todo still there", (await unenrolled.count()) === 1);
  await pa.goto("/admin/modules");
  await pa.locator("#module-makeup").click();
  await toastText(pa);
  await pa.goto("/admin");
  check("makeup todo back when module re-enabled", (await todo("makeup.without-subjects").count()) === 1);
});

test("sekce modulu zmizí z menu a přestane být dostupná, když je modul vypnutý", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/admin/modules");
  await pa.locator("#module-seminars").click();
  check("module disabled via registry", (await toastText(pa)).includes("vypnut") && sql(`select value from "SystemSetting" where key='module.seminars.enabled'`) === "false");
  check("module toggle audited", auditCount(`action='settings.module' and summary='Modul „Zápis seminářů“ vypnut'`) === 1);
  const links = await pa.getByTestId("admin-nav").getByRole("link").allInnerTexts();
  check("section hidden in side menu", !links.includes("Semináře") && links.includes("Dopisování"), JSON.stringify(links));
  const res = await pa.goto("/enrollments/settings");
  check("section page is 404", res!.status() === 404, String(res!.status()));
  await pa.goto("/admin/modules");
  await pa.locator("#module-seminars").click();
  await toastText(pa);
  check("section back in menu", (await pa.getByTestId("admin-nav").getByRole("link", { name: "Semináře" }).count()) === 1);
  const res2 = await pa.goto("/enrollments/settings");
  check("section page back", res2!.status() === 200);
});

test("nastavení přes registr: formulář z deklarací, validace, historie změn, výchozí hodnota se použije", async ({ browser }) => {
  resetDb();
  seedSubjects();
  const pa = await login(browser, "admin@skola.cz");

  // nastavení modulu Dopisování (číslo)
  await pa.goto("/makeup/settings");
  const row = pa.locator('[data-setting="makeup.defaultCapacity"]');
  check("default shown", (await row.locator("input").inputValue()) === "10");
  check("save disabled until changed", await row.getByRole("button", { name: "Uložit" }).isDisabled());
  await row.locator("input").fill("0");
  await row.getByRole("button", { name: "Uložit" }).click();
  check("invalid value rejected with message", (await toastText(pa)).includes("Výchozí kapacita termínu: zadejte celé číslo 1–500"));
  check("nothing stored", sql(`select count(*) from "SystemSetting" where key='makeup.defaultCapacity'`) === "0" && auditCount(`action like 'settings.%'`) === 0);
  await row.locator("input").fill("25");
  await row.getByRole("button", { name: "Uložit" }).click();
  check("saved", (await toastText(pa)).includes("Nastavení uloženo") && sql(`select value from "SystemSetting" where key='makeup.defaultCapacity'`) === "25");
  check("change audited with readable summary", auditCount(`action='settings.value' and "actorId"='usr_admin' and \"entityId\"='makeup.defaultCapacity' and summary='Výchozí kapacita termínu: 10 → 25'`) === 1);

  // výběr (enum) a přepínač
  await pa.locator("#setting-makeup-defaultChangeDeadlineMinutes").selectOption("1440");
  await toastText(pa);
  check("enum stored as text", sql(`select value from "SystemSetting" where key='makeup.defaultChangeDeadlineMinutes'`) === "1440");
  await pa.goto("/enrollments/settings");
  await pa.locator("#setting-seminars-defaultVisibleToStudents").click();
  await toastText(pa);
  check("boolean stored as true/false", sql(`select value from "SystemSetting" where key='seminars.defaultVisibleToStudents'`) === "true");
  check("boolean change audited", auditCount(`summary='Nový zápis je hned viditelný studentům: vypnuto → zapnuto'`) === 1);

  // výchozí hodnoty se použijí v novém termínu i v novém zápisu
  await pa.goto("/makeup");
  await pa.getByTestId("new-session").click();
  await expect(pa.locator("#ms-capacity")).toHaveValue("25");
  await pa.keyboard.press("Escape");
  await pa.goto("/enrollments");
  await pa.getByRole("button", { name: "Vytvořit nový zápis" }).first().click();
  await expect(pa.locator("#visibleToStudents")).toHaveAttribute("data-state", "checked");

  // stávající nastavení jádra zůstala pod původními klíči a v původním tvaru
  await pa.goto("/admin/registration");
  await pa.selectOption("#setting-default_user_role", "STUDENT");
  await toastText(pa);
  check("default role stored under original key", sql(`select value from "SystemSetting" where key='default_user_role'`) === "STUDENT");
  check("role change audited under original action", auditCount(`action='settings.defaultRole' and summary='Výchozí role nových uživatelů: host → student'`) === 1);
  // bez změny se nic nezapisuje
  const before = auditCount("true");
  await pa.reload();
  check("registration reads stored value", (await pa.locator("#setting-default_user_role").inputValue()) === "STUDENT");
  check("no audit without a change", auditCount("true") === before);
  // M365 není nakonfigurováno: pole jsou nedostupná
  check("auth fields disabled without Microsoft 365", await pa.locator("#setting-auth-microsoft-enabled").isDisabled());
});

test("diagnostika: databáze a migrace, denní úloha, e-mail a verze", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/admin/diagnostics");
  const applied = sql(`select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null`);
  await expect(pa.getByTestId("diag-migrations")).toContainText(applied);
  check("database ok", (await pa.getByTestId("diag-db").innerText()).includes("v pořádku"));
  check("cron never ran", (await pa.getByTestId("diag-cron").innerText()).includes("ještě neběžela"));
  check("cron secret configured", !process.env.CRON_SECRET || (await pa.getByTestId("diag-cron").innerText()).includes("nastaveno"));
  check("email transport shown", (await pa.getByTestId("diag-email").innerText()).includes("Dnes odesláno"));
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  check("deployment commit shown", (await pa.getByTestId("diag-commit").innerText()).includes(commit ? commit.slice(0, 7) : "neznámý"));
  // stávající benchmark
  await pa.getByRole("button", { name: "Spustit test" }).click();
  await expect(pa.getByText("Latence databáze")).toBeVisible();
  await expect(pa.getByText("Studený start (Cold)").or(pa.getByText("Teplý start (Warm)"))).toBeVisible();
});
