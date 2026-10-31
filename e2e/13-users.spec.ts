import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, navLabels } from "./helpers";

// F3: detail uživatele se záložkami, filtry v URL, výběr „vše odpovídající filtru“, hromadné akce.
// E-maily se neposílají (EMAIL_TRANSPORT=log), jen zapisují do EmailLog.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const auditCount = (where: string) => Number(sql(`select count(*) from "AuditLog" where ${where}`));
const classOf = (email: string) => sql(`select coalesce(c.grade||c.letter,'-') from "User" u left join "ClassGroup" c on c.id=u."classGroupId" where u.email='${email}'`);

/** Otevře adresu a počká na vykreslení tabulky a hydrataci (jinak se kliknutí na zaškrtávátka ztratí). */
async function openList(p: import("@playwright/test").Page, url: string) {
  await p.goto(url);
  await p.waitForSelector("[data-testid=users-table]");
  await p.waitForLoadState("networkidle");
}

test.beforeAll(() => {
  resetDb();
  seedSubjects();
});

test("detail uživatele: záložky, moduly, učitel jen čte, student nemá přístup", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");

  // ze seznamu odkaz na detail (dialogy v seznamu už nejsou)
  await openList(pa, "/users");
  check("no details dialog button in list", (await pa.locator('button[title="Upravit profil uživatele"]').count()) === 0);
  await pa.locator('tr[data-user="jan.student@skola.cz"] [data-testid=user-link]').click();
  await pa.waitForURL("**/users/usr_stud1");
  await pa.waitForSelector("[data-testid=user-tabs]");

  const tabs = async (p: typeof pa) => (await p.locator("[data-testid=user-tabs] [data-tab]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tab"))));
  check("student tabs for admin", JSON.stringify(await tabs(pa)) === JSON.stringify(["profile", "classes", "history", "emails", "seminars.enrollments", "makeup.makeup"]), JSON.stringify(await tabs(pa)));
  const profile = await pa.getByTestId("user-profile").innerText();
  check("profile shows name, e-mail, role", profile.includes("Jan Student") && profile.includes("jan.student@skola.cz") && profile.includes("Student"));
  check("admin sees actions incl. impersonation", (await pa.getByTestId("user-actions").count()) === 1 && (await pa.getByTestId("impersonate").count()) === 1 && (await pa.getByTestId("user-edit").count()) === 1);

  await pa.locator('[data-tab="classes"]').click();
  await pa.waitForSelector("[data-testid=user-classes]");
  check("classes tab shows class history", (await pa.getByTestId("class-history-row").count()) === 1 && (await pa.getByTestId("user-classes").innerText()).includes("3.A"));

  await pa.locator('[data-tab="seminars.enrollments"]').click();
  await pa.waitForSelector("[data-testid=user-enrollments]");
  check("seminars tab shows enrollments per window", (await pa.getByTestId("user-enrollment-window").count()) >= 1 && (await pa.getByTestId("user-enrollment").count()) >= 1, await pa.getByTestId("user-enrollments").innerText());
  check("tab is in the URL (shareable)", pa.url().includes("tab=seminars.enrollments"));

  // dopisování: zápis s docházkou
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"createdById","updatedAt") values ('ms1','usr_teacher',now()+interval '3 days',now()+interval '3 days 1 hour','B12',5,'usr_teacher',now())`);
  sql(`insert into "MakeupSessionSubject"("sessionId","subjectId") values ('ms1','sm')`);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId",attendance,"createdById","updatedAt") values ('mr1','ms1','usr_stud1','ATTENDED','usr_stud1',now())`);
  sql(`insert into "MakeupRegistrationSubject"("registrationId","subjectId","subjectTeacherId") values ('mr1','sm','usr_teacher')`);
  await pa.goto("/users/usr_stud1?tab=makeup.makeup");
  await pa.waitForSelector("[data-testid=user-makeup]");
  const mk = await pa.getByTestId("user-makeup-registration").first().innerText();
  check("makeup tab shows registration with attendance", mk.includes("B12") && mk.includes("Matematika") && mk.includes("dopsal(a)"), mk);

  // učitel: úvazky a dozorované termíny
  await pa.goto("/users/usr_teacher");
  await pa.waitForSelector("[data-testid=user-tabs]");
  check("teacher tabs", JSON.stringify(await tabs(pa)) === JSON.stringify(["profile", "assignments", "history", "emails", "makeup.makeup"]), JSON.stringify(await tabs(pa)));
  await pa.locator('[data-tab="assignments"]').click();
  await pa.waitForSelector("[data-testid=user-assignments]");
  check("assignments tab lists Matematika 3.A", (await pa.getByTestId("user-assignment").first().innerText()).includes("Matematika") && (await pa.getByTestId("user-assignment").first().innerText()).includes("3.A"));
  await pa.locator('[data-tab="makeup.makeup"]').click();
  await pa.waitForSelector("[data-testid=user-makeup]");
  check("makeup tab shows supervised sessions for teacher", (await pa.getByTestId("user-makeup-session").count()) === 1);

  // neexistující uživatel
  await pa.goto("/users/neexistuje");
  check("unknown user message", (await pa.getByTestId("user-not-found").count()) === 1);

  // vypnutý modul = jeho záložka zmizí (Dopisování zůstává)
  await pa.goto("/admin/modules");
  await pa.waitForSelector("#module-seminars");
  await pa.waitForTimeout(800);
  await pa.click("#module-seminars");
  await pa.waitForTimeout(2500);
  check("seminars disabled", sql(`select value from "SystemSetting" where key='module.seminars.enabled'`) === "false");
  await pa.goto("/users/usr_stud1");
  await pa.waitForSelector("[data-testid=user-tabs]");
  check("seminars tab gone, makeup stays", JSON.stringify(await tabs(pa)) === JSON.stringify(["profile", "classes", "history", "emails", "makeup.makeup"]), JSON.stringify(await tabs(pa)));
  const direct = await pa.goto("/users/usr_stud1?tab=seminars.enrollments");
  check("disabled module tab falls back to profile", direct?.status() === 200 && (await pa.getByTestId("user-enrollments").count()) === 0 && (await pa.getByTestId("user-profile").count()) === 1);
  await pa.goto("/admin/modules");
  await pa.waitForSelector("#module-seminars");
  await pa.waitForTimeout(800);
  await pa.click("#module-seminars");
  await pa.waitForTimeout(2500);
  await pa.goto("/users/usr_stud1");
  check("seminars tab back after enabling", (await tabs(pa)).includes("seminars.enrollments"));

  // „Zobrazit jako“ zůstává dostupné z detailu
  await pa.getByTestId("impersonate").click();
  await pa.waitForURL("**/dashboard");
  await pa.waitForLoadState("networkidle");
  check("impersonating the student", (await navLabels(pa)).includes("Můj profil") && !(await navLabels(pa)).includes("Uživatelé"));
  const denied = await pa.goto("/users/usr_stud2");
  check("student in preview cannot open other user detail", pa.url().endsWith("/dashboard"), `${denied?.status()} ${pa.url()}`);
  await pa.context().clearCookies();

  // učitel čte, ale nic neupravuje
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/users/usr_stud1");
  await pt.waitForSelector("[data-testid=user-tabs]");
  check("teacher sees profile", (await pt.getByTestId("user-profile").innerText()).includes("jan.student@skola.cz"));
  check("teacher has no actions", (await pt.getByTestId("user-actions").count()) === 0 && (await pt.getByTestId("user-edit").count()) === 0 && (await pt.getByTestId("impersonate").count()) === 0);
  check("teacher has no history and e-mails tabs", JSON.stringify(await tabs(pt)) === JSON.stringify(["profile", "classes", "seminars.enrollments", "makeup.makeup"]), JSON.stringify(await tabs(pt)));
  await pt.goto("/users/usr_stud1?tab=history");
  check("teacher cannot reach history tab by URL", (await pt.getByTestId("user-history-tab").count()) === 0 && (await pt.getByTestId("user-profile").count()) === 1);
  // v makeup záložce učitel vidí jen své termíny: zápis Jana na jeho termín ano
  await pt.goto("/users/usr_stud1?tab=makeup.makeup");
  check("teacher sees registration on own session", (await pt.getByTestId("user-makeup-registration").count()) === 1);
  await openList(pt, "/users");
  await pt.locator('tr[data-user="jan.student@skola.cz"] input[type=checkbox]').check();
  check("teacher has no bulk actions, only export", (await pt.getByTestId("bulk-action-select").count()) === 0 && (await pt.getByTestId("export-csv").count()) === 1);
  check("teacher cannot change roles in the list", (await pt.locator("[data-testid=role-select]").first().isDisabled()));

  // student cizí detail nevidí
  const ps = await login(browser, "eva.studentova@skola.cz");
  await ps.goto("/users/usr_stud1");
  check("student redirected from user detail", ps.url().endsWith("/dashboard"), ps.url());
  await ps.goto("/users");
  check("student redirected from users", ps.url().endsWith("/dashboard"), ps.url());
});

test("seznam uživatelů: filtry v URL, fulltext a stránkování na serveru", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  // třída 2.A s 60 studenty, studující bez třídy, absolvent, neaktivní a hosté
  sql(`insert into "ClassGroup"(id,grade,letter,"updatedAt") values ('c2a',2,'A',now())`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"classGroupId","updatedAt") select 'h'||n,'Hromadný'||n,'Žák'||lpad(n::text,2,'0'),'h'||n||'@skola.cz','STUDENT','c2a',now() from generate_series(1,60) n`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('nc1','Bez','Třídy','nc@skola.cz','STUDENT',now()),('gr1','Absolvent','Bývalý','grad@skola.cz','STUDENT',now()),('in1','Neaktivní','Účet','inactive@skola.cz','STUDENT',now()),('g1','Host','Jedna','host1@skola.cz','GUEST',now()),('g2','Host','Dva','host2@skola.cz','GUEST',now())`);
  sql(`update "User" set "studyStatus"='GRADUATED',"studyEndReason"='GRADUATED',"isActive"=false where id='gr1'`);
  sql(`update "User" set "isActive"=false where id='in1'`);

  const rows = (p: typeof pa) => p.getByTestId("user-row");

  await openList(pa, "/users?role=STUDENT&class=2.A");
  check("filter by role and class: total", (await pa.getByTestId("total-count").innerText()) === "60");
  check("server paginates to 50 rows", (await rows(pa).count()) === 50);
  check("pagination text", (await pa.getByTestId("pagination").innerText()).includes("Strana 1 z 2"));
  check("filter controls reflect the URL", (await pa.getByTestId("filter-role").inputValue()) === "STUDENT" && (await pa.getByTestId("filter-class").inputValue()) === "2.A");
  await pa.getByTestId("page-next").click();
  await pa.waitForURL("**page=2**");
  check("page 2 has the remaining 10", (await rows(pa).count()) === 10, String(await rows(pa).count()));

  // fulltext z formuláře se propíše do URL
  await openList(pa, "/users");
  await pa.getByTestId("filter-q").fill("Hromadný7");
  await pa.waitForURL("**q=Hromadn**");
  await pa.waitForTimeout(800);
  check("fulltext in URL", pa.url().includes("q=Hromadn"), pa.url());
  check("fulltext finds Hromadný7", (await rows(pa).count()) === 1 && (await rows(pa).first().innerText()).includes("Hromadný7"));
  // více slov, příjmení + jméno
  await pa.goto("/users?q=" + encodeURIComponent("Žák07 Hromadný"));
  check("fulltext words match across fields", (await rows(pa).count()) === 1);
  // sdílený odkaz otevřený jinde ukáže totéž
  const other = await login(browser, "admin@skola.cz");
  await other.goto("/users?q=h7%40");
  check("fulltext in e-mail", (await rows(other).count()) === 1);

  // jednotlivé filtry
  await pa.goto("/users?noclass=1");
  check("filter: students without class (active, studying)", (await rows(pa).count()) === 1 && (await pa.locator("main").innerText()).includes("nc@skola.cz"), String(await rows(pa).count()));
  await pa.goto("/users?study=GRADUATED");
  check("filter: study status", (await rows(pa).count()) === 1 && (await rows(pa).first().innerText()).includes("grad@skola.cz"));
  await pa.goto("/users?active=0");
  check("filter: inactive", (await rows(pa).count()) === 2);
  await pa.goto("/users?pending=1");
  check("filter: pending approval", (await rows(pa).count()) === 2);
  await pa.goto("/users?grade=2");
  check("filter: grade", (await pa.getByTestId("total-count").innerText()) === "60");
  await pa.goto("/users?role=NEPLATNA&page=abc&sort=zzz");
  check("invalid parameters are ignored", (await rows(pa).count()) >= 4);
  await pa.goto("/users?class=2.A&sort=email&dir=desc");
  const firstEmail = await rows(pa).first().getAttribute("data-user");
  check("sorting is done on the server", firstEmail === "h9@skola.cz", String(firstEmail));
  // filtr se dá změnit selectem a promítne se do URL
  await openList(pa, "/users");
  await pa.getByTestId("filter-role").selectOption("GUEST");
  await pa.waitForURL("**role=GUEST**");
  check("select filter updates URL and list", (await rows(pa).count()) === 2);
  await pa.getByTestId("filter-reset").click();
  await pa.waitForURL((u) => !u.search);
  await other.close();
});

test("výběr všech odpovídajících filtru, hromadný přesun do třídy a jeden záznam v historii", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  await openList(pa, "/users?role=STUDENT&class=2.A");
  await pa.getByTestId("select-page").check();
  check("banner offers all matching", (await pa.getByTestId("select-all-banner").innerText()).includes("Vybrat všech 60"));
  await pa.getByTestId("select-all-matching").click();
  check("all 60 selected", (await pa.getByTestId("selection-count").innerText()).includes("60"));
  // odškrtnutí jednoho řádku (výjimka)
  await pa.locator('tr[data-user="h1@skola.cz"] input[type=checkbox]').uncheck();
  check("exception reduces the count to 59", (await pa.getByTestId("selection-count").innerText()).includes("59"));
  check("client sent no list of ids (page has 50 rows only)", (await pa.getByTestId("user-row").count()) === 50);

  await pa.getByTestId("bulk-action-select").selectOption({ label: "Přesunout do třídy" });
  await pa.waitForSelector("[data-testid=bulk-dialog]");
  await pa.locator("#bulk-classGroupId").selectOption({ label: "3.B" });
  await expect(pa.getByTestId("bulk-count")).toContainText("Vybráno 59, akce se týká 59");
  const preview = await pa.getByTestId("bulk-preview").innerText();
  check("preview describes impact", preview.includes("Do třídy 3.B se přesune 59") && preview.includes("z 2.A (59)"), preview);
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });

  check("59 moved to 3.B, exception stays in 2.A", sql(`select count(*) from "User" u join "ClassGroup" c on c.id=u."classGroupId" where c.grade=3 and c.letter='B' and u.id like 'h%'`) === "59" && classOf("h1@skola.cz") === "2A");
  check("class history written", sql(`select count(*) from "ClassMembership" m join "User" u on u.id=m."userId" where u.id like 'h%'`) === "59");
  check("exactly one summary audit entry", auditCount(`action='users.bulk.class'`) === 1 && auditCount(`action='users.class'`) === 0);
  check("audit carries affected ids", sql(`select jsonb_array_length(data->'userIds') from "AuditLog" where action='users.bulk.class'`) === "59" && sql(`select summary from "AuditLog" where action='users.bulk.class'`).includes("Hromadný přesun do třídy 3.B"));

  // historie uživatele zahrnuje hromadnou akci
  await pa.goto("/users/h5?tab=history");
  await pa.waitForSelector("[data-testid=user-history-tab]");
  check("user history tab shows the bulk entry", (await pa.getByTestId("user-history-tab").innerText()).includes("Hromadný přesun do třídy 3.B"));
  await pa.goto("/admin/history?user=h5");
  await pa.waitForSelector("[data-testid=history-card]");
  await pa.waitForTimeout(1200);
  check("admin history of the user shows it too", (await pa.getByTestId("history-card").innerText()).includes("Hromadný přesun"));

  // opakování nad stejným filtrem: nikdo už v 2.A (kromě výjimky) není
  await pa.goto("/users?role=STUDENT&class=2.A");
  check("only the exception is left in 2.A", (await pa.getByTestId("total-count").innerText()) === "1");
});

test("hromadný e-mail: odhad, limity, záznamy a audit", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  sql(`insert into "SystemSetting"(key,value) values ('email.dailyLimit','5') on conflict (key) do update set value='5'`);

  await openList(pa, "/users?role=STUDENT&class=3.B");
  await pa.getByTestId("select-page").check();
  await pa.getByTestId("select-all-matching").click();
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Poslat e-mail" });
  await pa.waitForSelector("[data-testid=bulk-dialog]");
  await pa.fill("#bulk-subject", "Důležité oznámení");
  await pa.fill("#bulk-body", "Dobrý den, {{jmeno}}, zítra se sejdeme v aule.");
  await expect(pa.getByTestId("bulk-count")).toContainText("akce se týká 60");
  const preview = await pa.getByTestId("bulk-preview").innerText();
  check("estimate shown before sending", preview.includes("odešle se 5 z 60") && preview.includes("dnes odesláno 0 z 5") && preview.includes("neodešle"), preview);
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });

  const log = (status: string) => sql(`select count(*) from "EmailLog" where event='manual.bulk' and status='${status}'`);
  check("limit respected: 5 sent", log("SENT") === "5", log("SENT"));
  check("rest skipped because of the limit", log("SKIPPED_LIMIT") === "55", log("SKIPPED_LIMIT"));
  check("counted toward daily limit", Number(sql(`select count(*) from "EmailLog" where status='SENT' and "createdAt" > now() - interval '1 day'`)) >= 5);
  check("audit entry for the e-mail", auditCount(`action='users.bulk.email' and summary like '%odesláno 5 z 60%'`) === 1, sql(`select summary from "AuditLog" where action='users.bulk.email'`));
  check("e-mail text with name is not in audit data", !sql(`select data::text from "AuditLog" where action='users.bulk.email'`).includes("zítra se sejdeme"));

  // znovu: limit vyčerpán, akce je zablokovaná
  await pa.getByTestId("select-page").check();
  await pa.getByTestId("select-all-matching").click();
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Poslat e-mail" });
  await pa.fill("#bulk-subject", "Znovu");
  await pa.fill("#bulk-body", "Text");
  await expect(pa.getByTestId("bulk-blocked")).toContainText("limit");
  check("confirm disabled at the limit", await pa.getByTestId("bulk-confirm").isDisabled());
  await pa.keyboard.press("Escape");

  // E-maily v detailu příjemce
  const recipient = sql(`select "recipientUserId" from "EmailLog" where event='manual.bulk' and status='SENT' limit 1`);
  await pa.goto(`/users/${recipient}?tab=emails`);
  await pa.waitForSelector("[data-testid=user-emails]");
  check("e-mail shown in recipient's detail", (await pa.locator('[data-testid=user-email-row][data-event="manual.bulk"][data-status="SENT"]').count()) === 1);
  sql(`delete from "SystemSetting" where key='email.dailyLimit'`);
});

test("hromadný e-mail respektuje hlavní vypínač, zkušební e-mail ne", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  const manual = () => Number(sql(`select count(*) from "EmailLog" where event='manual.bulk'`));
  const before = manual();
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','false') on conflict (key) do update set value='false'`);

  await openList(pa, "/users?role=STUDENT&class=3.B");
  await pa.getByTestId("select-page").check();
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Poslat e-mail" });
  await pa.waitForSelector("[data-testid=bulk-dialog]");
  await pa.fill("#bulk-subject", "Vypnuto");
  await pa.fill("#bulk-body", "Text");
  await expect(pa.getByTestId("bulk-blocked")).toContainText("vypnutá");
  check("confirm disabled when e-mails are off", await pa.getByTestId("bulk-confirm").isDisabled());
  await pa.keyboard.press("Escape");
  check("nothing was sent or logged", manual() === before, String(manual()));

  // zkušební e-mail sobě vypínač ignoruje
  if (process.env.EMAIL_FROM) {
    await pa.goto("/admin/notifications");
    await pa.getByTestId("email-send").click();
    await expect.poll(() => sql(`select count(*) from "EmailLog" where event='test' and status='SENT'`)).not.toBe("0");
  }

  // po zapnutí je akce zase dostupná
  sql(`delete from "SystemSetting" where key='email.enabled'`);
  await openList(pa, "/users?role=STUDENT&class=3.B");
  await pa.getByTestId("select-page").check();
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Poslat e-mail" });
  await pa.waitForSelector("[data-testid=bulk-dialog]");
  await pa.fill("#bulk-subject", "Zapnuto");
  await pa.fill("#bulk-body", "Text");
  await expect(pa.getByTestId("bulk-preview")).toContainText("odešle se");
  check("confirm enabled again", await pa.getByTestId("bulk-confirm").isEnabled());
  await pa.keyboard.press("Escape");
});

test("ostatní hromadné akce: role, deaktivace, schválení, studium, smazání s potvrzením, export CSV", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  const pick = async (...emails: string[]) => {
    for (const e of emails) await pa.locator(`tr[data-user="${e}"] input[type=checkbox]`).check();
  };
  const runAction = async (label: string) => {
    await pa.getByTestId("bulk-action-select").selectOption({ label });
    await pa.waitForSelector("[data-testid=bulk-dialog]");
  };

  // schválení hostů
  await openList(pa, "/users?q=host");
  await pick("host1@skola.cz", "host2@skola.cz");
  await runAction("Schválit (hosté)");
  await expect(pa.getByTestId("bulk-count")).toContainText("akce se týká 2");
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  check("guests approved as students", sql(`select string_agg(role::text, ',') from "User" where email in ('host1@skola.cz','host2@skola.cz')`) === "STUDENT,STUDENT");
  check("approval audited once", auditCount(`action='users.bulk.approve'`) === 1);

  // deaktivace: sebe sama přeskočí
  await openList(pa, "/users");
  await pick("admin@skola.cz", "jan.student@skola.cz");
  await runAction("Deaktivovat účty");
  await expect(pa.getByTestId("bulk-count")).toContainText("Vybráno 2, akce se týká 1");
  check("self is skipped with a reason", (await pa.getByTestId("bulk-preview").innerText()).includes("vy sami"));
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  check("only the other user deactivated", sql(`select string_agg(email||'='||"isActive", ',' order by email) from "User" where email in ('admin@skola.cz','jan.student@skola.cz')`) === "admin@skola.cz=true,jan.student@skola.cz=false");
  check("audit says skipped 1", sql(`select summary from "AuditLog" where action='users.bulk.deactivate'`).includes("přeskočeno 1"));

  // změna role, vlastní role se přeskočí
  await openList(pa, "/users");
  await pick("admin@skola.cz", "eva.studentova@skola.cz");
  await runAction("Změnit roli");
  await pa.locator("#bulk-role").selectOption("TEACHER");
  await expect(pa.getByTestId("bulk-count")).toContainText("akce se týká 1");
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  check("role changed (admin untouched)", sql(`select string_agg(email||'='||role::text, ',' order by email) from "User" where email in ('admin@skola.cz','eva.studentova@skola.cz')`) === "admin@skola.cz=ADMIN,eva.studentova@skola.cz=TEACHER");
  check("role audit has before map", sql(`select data->'before'->>'usr_stud2' from "AuditLog" where action='users.bulk.role'`) === "STUDENT");

  // ukončení a obnovení studia
  await openList(pa, "/users?q=Hromadn");
  await pick("h2@skola.cz");
  await runAction("Ukončit studium");
  await pa.locator("#bulk-reason").selectOption("TRANSFER");
  await pa.fill("#bulk-note", "přestup na jinou školu");
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  check("study ended in bulk", sql(`select "studyStatus"||'|'||"isActive"||'|'||"studyEndReason" from "User" where email='h2@skola.cz'`) === "LEFT|false|TRANSFER");
  await openList(pa, "/users?study=LEFT");
  await pa.getByTestId("select-page").check();
  await runAction("Obnovit studium");
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  check("study restored in bulk", sql(`select "studyStatus"||'|'||"isActive" from "User" where email='h2@skola.cz'`) === "ACTIVE|true");

  // export CSV vybraných
  await openList(pa, "/users?q=Hromadn");
  await pick("h3@skola.cz", "h4@skola.cz");
  check("export button shows count", (await pa.getByTestId("export-csv").innerText()).includes("(2)"));
  const [download] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("export-csv").click()]);
  const path = await download.path();
  const csv = (await import("fs")).readFileSync(path!, "utf8");
  check("CSV contains exactly the selection", csv.includes("h3@skola.cz") && csv.includes("h4@skola.cz") && !csv.includes("h5@skola.cz") && csv.split("\r\n").length === 3, csv);

  // smazání: dvojité potvrzení (opsat SMAZAT), vlastní účet se přeskočí
  await openList(pa, "/users?q=Hromadn");
  await pick("h3@skola.cz", "h4@skola.cz");
  await runAction("Trvale smazat");
  await expect(pa.getByTestId("bulk-count")).toContainText("akce se týká 2");
  check("delete disabled until the word is typed", await pa.getByTestId("bulk-confirm").isDisabled());
  await pa.fill("#bulk-confirmWord", "smazat?");
  check("delete still disabled with wrong word", await pa.getByTestId("bulk-confirm").isDisabled());
  await pa.fill("#bulk-confirmWord", "SMAZAT");
  await pa.getByTestId("bulk-confirm").click();
  await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  check("users deleted", sql(`select count(*) from "User" where email in ('h3@skola.cz','h4@skola.cz')`) === "0");
  check("delete audit records who was deleted", sql(`select jsonb_array_length(data->'users') from "AuditLog" where action='users.bulk.delete'`) === "2" && sql(`select data->'users'->0->>'email' from "AuditLog" where action='users.bulk.delete'`).endsWith("@skola.cz"));
});
