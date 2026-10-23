import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText } from "./helpers";

// E-mailová upozornění: limity, vypnuté události, odhlášení z nepovinných, nezapsaní studenti
// a ruční připomínka. Resend je nahrazen EMAIL_TRANSPORT=log: odeslání se jen zapíše do EmailLogu.

const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const logCount = (where: string) => Number(sql(`select count(*) from "EmailLog" where ${where}`));

test("nezapsaní studenti: seznam, filtr třídy, export, ruční připomínka a denní limit", async ({ browser }) => {
  resetDb();
  // šest dalších studentů 3.A bez zápisu (seed: Jan 3.A a Eva 3.B mají zapsaný jen blok 1)
  sql(`insert into "User"(id,"firstName","lastName",email,role,"classGroupId","updatedAt") select 'ns'||g, 'Nový'||g, 'Žák'||g, 'ns'||g||'@skola.cz','STUDENT', c.id, now() from generate_series(1,6) g, "ClassGroup" c where c.grade=3 and c.letter='A'`);
  const pa = await login(browser, "admin@skola.cz");

  // limity v administraci: denní limit 3
  await pa.goto("/admin/notifications");
  await pa.waitForSelector("#notif-daily");
  await pa.fill("#notif-daily", "3");
  await pa.getByTestId("notif-save").click();
  expect(await toastText(pa)).toContain("Nastavení uloženo");
  check("daily limit stored", sql(`select value from "SystemSetting" where key='email.dailyLimit'`) === "3");

  // záložka Nezapsaní v detailu zápisového okna
  await pa.goto("/enrollments/enr_ls_2025");
  await pa.locator("button[data-tab=unenrolled]").click();
  await expect(pa.getByTestId("unenrolled-count")).toContainText("Nezapsaných studentů: 8");
  check("Jan lacks block 2", (await pa.locator('tr[data-email="jan.student@skola.cz"]').innerText()).includes("Blok 2 – volitelné"));
  check("new student lacks both blocks", (await pa.locator('tr[data-email="ns1@skola.cz"]').innerText()).includes("Blok 1 – povinné, Blok 2 – volitelné"));
  check("tab label shows count", (await pa.locator("button[data-tab=unenrolled]").innerText()).includes("(8)"));

  // filtr třídy + export CSV
  await pa.selectOption('select[aria-label="Třída"]', { label: "3.A" });
  await expect(pa.getByTestId("unenrolled-count")).toContainText("ve vybrané třídě 7");
  check("Eva (3.B) filtered out", (await pa.locator('tr[data-email="eva.studentova@skola.cz"]').count()) === 0);
  const [download] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("unenrolled-export").click()]);
  const csv = await (await import("fs")).promises.readFile((await download.path())!, "utf8");
  check("csv has Jan and not Eva", csv.includes("jan.student@skola.cz") && !csv.includes("eva.studentova@skola.cz"));
  await pa.selectOption('select[aria-label="Třída"]', { label: "Všechny třídy" });

  // ruční připomínka s potvrzením: 8 e-mailů, limit 3 → 3 odeslány, 5 přeskočeno (událost je ve výchozím stavu vypnutá,
  // ruční odeslání ji obchází)
  await expect(pa.getByTestId("unenrolled-remind")).toContainText("(8 e-mailů)");
  await pa.getByTestId("unenrolled-remind").click();
  await pa.getByRole("button", { name: "Poslat", exact: true }).click();
  expect(await toastText(pa)).toContain("3 z 8 e-mailů");
  check("3 sent", logCount(`event='seminars.window.reminder' and status='SENT'`) === 3);
  check("5 skipped over the limit", logCount(`event='seminars.window.reminder' and status='SKIPPED_LIMIT' and error like '%denní limit%'`) === 5);
  check("manual reminder in audit log", Number(sql(`select count(*) from "AuditLog" where action='seminars.window.remind' and summary like '%odesláno 3 z 8%'`)) === 1);

  // administrace ukazuje vyčerpaný limit a přeskočené e-maily
  await pa.goto("/admin/notifications");
  await expect(pa.getByTestId("limit-warning")).toContainText("Denní limit je vyčerpán");
  await expect(pa.getByTestId("email-usage")).toContainText("Dnes 3 / 3");
  await pa.selectOption('select[aria-label="Stav"]', { label: "přeskočeno (limit)" });
  await expect(pa.getByTestId("email-log-row")).toHaveCount(5);
  // zkušební e-mail je nad limit
  await pa.getByTestId("email-send").click();
  expect(await toastText(pa)).toContain("limit");
  check("test e-mail skipped by limit", logCount(`event='test' and status='SKIPPED_LIMIT'`) === 1);

  // druhý den (limit dne je znovu volný): včerejší záznamy se do dnešního limitu nepočítají
  sql(`update "EmailLog" set "createdAt" = "createdAt" - interval '1 day'`);
  await pa.goto("/admin/notifications");
  await expect(pa.getByTestId("email-usage")).toContainText("Dnes 0 / 3");
  check("limit warning gone", (await pa.getByTestId("limit-warning").count()) === 0);
});

test("vypnutá událost, hlavní vypínač a odhlášení z nepovinných upozornění", async ({ browser }) => {
  resetDb();
  seedSubjects();
  // tři budoucí termíny dopisování s Janem (dozor: Učitel Petr)
  for (const [id, hour] of [["c1", 8], ["c2", 10], ["c3", 12]] as const) {
    sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('${id}','usr_teacher', now()+interval '3 days'+interval '${hour} hours', now()+interval '3 days'+interval '${hour} hours 45 min','30${hour}',5,60,'usr_teacher',now()); insert into "MakeupSessionSubject" values ('${id}','sm'); insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('r${id}','${id}','usr_stud1','usr_stud1',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('r${id}','sm')`);
  }
  const pt = await login(browser, "teacher@skola.cz");
  const pa = await login(browser, "admin@skola.cz");
  const ps = await login(browser, "jan.student@skola.cz");

  const cancel = async (id: string) => {
    await pt.goto(`/makeup/sessions/${id}`);
    await pt.getByRole("button", { name: "Zrušit termín" }).click();
    await pt.fill("#cancel-reason", "nemoc");
    await pt.click("[data-testid=cancel-submit]");
    await toastText(pt);
  };

  // 1) zapnutá povinná událost: student dostane e-mail o zrušení
  await cancel("c1");
  check("cancellation e-mail sent", logCount(`event='makeup.session.cancelled' and status='SENT' and recipient='jan.student@skola.cz' and subject like '%zrušen%'`) === 1);

  // 2) admin událost vypne: další zrušení se jen zapíše jako SKIPPED_DISABLED
  await pa.goto("/admin/notifications");
  const row = pa.getByTestId("event-makeup.session.cancelled");
  await row.getByRole("switch").click();
  expect(await toastText(pa)).toContain("vypnuto");
  check("event switch stored", sql(`select value from "SystemSetting" where key='email.event.makeup.session.cancelled.enabled'`) === "false");
  await cancel("c2");
  check("disabled event logged as skipped", logCount(`event='makeup.session.cancelled' and status='SKIPPED_DISABLED' and error like '%vypnuté%'`) === 1);
  check("action itself went through", sql(`select count(*) from "MakeupSession" where "cancelledAt" is not null`) === "2");

  // 3) student vypne nepovinná upozornění; povinné (zrušení) mu přesto chodí
  await row.getByRole("switch").click();
  await toastText(pa);
  await ps.goto("/profile");
  await ps.locator("#optional-emails").click();
  expect(await toastText(ps)).toContain("vypnuta");
  check("opt-out stored", sql(`select "receiveOptionalEmails" from "User" where id='usr_stud1'`) === "f");
  await cancel("c3");
  check("mandatory e-mail ignores opt-out", logCount(`event='makeup.session.cancelled' and status='SENT'`) === 2);

  // 4) nepovinná připomínka nezapsaným: Jan (odhlášený) dostane SKIPPED_DISABLED, Eva e-mail
  await pa.goto("/enrollments/enr_ls_2025");
  await pa.locator("button[data-tab=unenrolled]").click();
  await pa.getByTestId("unenrolled-remind").click();
  await pa.getByRole("button", { name: "Poslat", exact: true }).click();
  await toastText(pa);
  check("opted-out student skipped", logCount(`event='seminars.window.reminder' and status='SKIPPED_DISABLED' and recipient='jan.student@skola.cz' and error like '%nepovinná%'`) === 1);
  check("other student got the reminder", logCount(`event='seminars.window.reminder' and status='SENT' and recipient='eva.studentova@skola.cz'`) === 1);

  // 5) hlavní vypínač: nic se neodešle (ruční odeslání ho nepřebíjí)
  await pa.goto("/admin/notifications");
  await pa.locator("#notif-enabled").click();
  await pa.getByTestId("notif-save").click();
  expect(await toastText(pa)).toContain("Nastavení uloženo");
  check("global switch stored", sql(`select value from "SystemSetting" where key='email.enabled'`) === "false");
  await pa.goto("/enrollments/enr_ls_2025");
  await pa.locator("button[data-tab=unenrolled]").click();
  await pa.getByTestId("unenrolled-remind").click();
  await pa.getByRole("button", { name: "Poslat", exact: true }).click();
  await toastText(pa);
  check("global switch off → skipped", logCount(`event='seminars.window.reminder' and status='SKIPPED_DISABLED' and error like '%jsou vypnutá%'`) === 2);
  // ...ale zkušební e-mail jde vždy
  await pa.goto("/admin/notifications");
  await pa.getByTestId("email-send").click();
  expect(await toastText(pa)).toContain("Zkušební e-mail odeslán");
});

test("šablona upozornění: vlastní text, kontrola proměnných a návrat k výchozímu", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/admin/notifications");
  await pa.getByTestId("edit-account.approved").click();
  await pa.fill("#subj-account\\.approved", "Vítejte, {{jmeno}}");
  await pa.getByTestId("save-account.approved").click();
  expect(await toastText(pa)).toContain("Text uložen");
  check("custom subject stored", sql(`select value from "SystemSetting" where key='email.event.account.approved.subject'`) === "Vítejte, {{jmeno}}");
  // překlep v proměnné se odmítne
  await pa.fill("#subj-account\\.approved", "Ahoj {{jmno}}");
  await pa.getByTestId("save-account.approved").click();
  expect(await toastText(pa)).toContain("neznámé proměnné");
  check("typo not stored", sql(`select value from "SystemSetting" where key='email.event.account.approved.subject'`) === "Vítejte, {{jmeno}}");

  // schválený host dostane e-mail s vlastním předmětem
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('g1','Nová','Žákyně','g1@skola.cz','GUEST',now())`);
  await pa.goto("/users?tab=approvals");
  await pa.locator('tr[data-user="g1@skola.cz"]').getByTestId("approve").click();
  await toastText(pa);
  check("approval e-mail with custom subject", sql(`select subject from "EmailLog" where event='account.approved' and recipient='g1@skola.cz' and status='SENT'`) === "Vítejte, Nová");
});
