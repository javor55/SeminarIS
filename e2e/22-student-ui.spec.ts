import { test, expect, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, navLabels, toastText, pickSubjectChip } from "./helpers";

// F12: zjednodušené rozhraní studenta. Navigace jen se záložkami, na kterých něco je (počítá server), úvod „/“ podle
// stavu, zápis po krocích (sbalitelné bloky, Vybrat / Vyměnit / Odepsat, nepovinný blok), dopisování přes čip předmětu
// s poznámkou a host jen ke čtení. Mobilní spodní lišta je v 21-mobile.spec.ts.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const WINDOW = "enr_ls_2025";
const count = (query: string) => Number(sql(query));

/** Nadcházející termín dopisování (matematika) za `days` dní. */
function makeupSession(id: string, days = 3, cancelled = false) {
  sql(
    `insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt"${cancelled ? ',"cancelledAt"' : ""}) values ('${id}','usr_teacher',now()+interval '${days} days',now()+interval '${days} days 45 min','204',5,60,'usr_teacher',now()${cancelled ? ",now()" : ""}); insert into "MakeupSessionSubject" values ('${id}','sm')`
  );
}

const tabs = async (p: Page) => (await navLabels(p)).filter(Boolean);
const dot = (p: Page) => p.locator('header [data-testid="student-tabs"] [data-testid=tab-attention]').count();

test("navigace studenta podle stavu: záložky počítá server, úvod „/“ vybere stránku, prázdný stav", async ({ browser }) => {
  resetDb();
  seedSubjects();
  const p = await login(browser, "jan.student@skola.cz");

  // jen zápis (otevřené okno, chybí blok 2): bez lišty, rovnou zápis, menu účtu místo Dashboardu a Předmětů
  check("only the window: lands on it", p.url().endsWith("/zapisy/" + WINDOW), p.url());
  check("only the window: no tab bar", (await tabs(p)).length === 0 && (await p.getByTestId("student-tabs").count()) === 0);
  check("old items are not in the main navigation", !(await p.locator("header").innerText()).includes("Dashboard") && !(await p.locator("header").innerText()).includes("Předměty"));

  // zápis i dopisování: dvě záložky, tečka u zápisu (blok 2 chybí), aktivní záložka
  makeupSession("m1");
  await p.goto("/zapisy/" + WINDOW);
  check("two tabs", JSON.stringify(await tabs(p)) === JSON.stringify(["Zápis seminářů", "Dopisování písemek"]), JSON.stringify(await tabs(p)));
  check("dot on the unfinished enrollment", (await dot(p)) === 1);
  check("active tab marked", (await p.locator('header [data-tab="seminars.windows"]').getAttribute("aria-current")) === "page" && (await p.locator('header [data-tab="makeup.sessions"]').getAttribute("aria-current")) === null);
  await p.locator('header [data-tab="makeup.sessions"]').click();
  await p.waitForURL("**/makeup");
  check("makeup tab becomes active", (await p.locator('header [data-tab="makeup.sessions"]').getAttribute("aria-current")) === "page");

  // úvod: nedokončený zápis má přednost
  await p.goto("/");
  await p.waitForURL("**/zapisy/" + WINDOW);
  // zápis hotový → úvod vede na dopisování, tečka zmizí
  sql(`insert into "StudentEnrollment"(id,"studentId","subjectOccurrenceId","createdById","updatedAt") values ('e_iot','usr_stud1','occ_iot_b2','usr_stud1',now())`);
  await p.goto("/");
  await p.waitForURL("**/makeup");
  check("complete enrollment: no dot, both tabs stay", (await dot(p)) === 0 && (await tabs(p)).length === 2);

  // naplánované okno: záložka je, tečka ne
  sql(`update "EnrollmentWindow" set "startsAt"=now()+interval '2 days', "endsAt"=now()+interval '9 days' where id='${WINDOW}'`);
  await p.goto("/makeup");
  check("planned window: tab without dot", (await tabs(p)).length === 2 && (await dot(p)) === 0);

  // okno uzavřené: zůstane jen dopisování, bez lišty, úvod ho otevře
  sql(`update "EnrollmentWindow" set "startsAt"=now()-interval '9 days', "endsAt"=now()-interval '2 days' where id='${WINDOW}'`);
  await p.goto("/makeup");
  check("closed window: tab gone, one tab means no bar", (await tabs(p)).length === 0);
  await p.goto("/");
  await p.waitForURL("**/makeup");

  // okno předčasně uzavřené správcem, skryté (koncept) a mimo publikum se nezobrazí
  sql(`update "EnrollmentWindow" set "startsAt"=now()-interval '1 day', "endsAt"=now()+interval '5 days', "closedEarlyAt"=now() where id='${WINDOW}'`);
  await p.goto("/makeup");
  check("early-closed window: no tab", (await tabs(p)).length === 0);
  sql(`update "EnrollmentWindow" set "closedEarlyAt"=null, published=false where id='${WINDOW}'`);
  await p.goto("/makeup");
  check("draft window: no tab", (await tabs(p)).length === 0);
  sql(`update "EnrollmentWindow" set published=true where id='${WINDOW}'`);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"userId",key) values ('ex_jan','${WINDOW}','EXCLUDE_USER','usr_stud1','EXCLUDE_USER:usr_stud1')`);
  await p.goto("/makeup");
  check("window outside the audience: no tab", (await tabs(p)).length === 0 && !(await p.content()).includes("Zápis LS 2025"));

  // zrušený termín bez přihlášky záložku nedělá; s budoucí přihláškou ano (přepsat se)
  sql(`delete from "MakeupSession" where id='m1'`);
  makeupSession("mc", 3, true);
  await p.goto("/");
  await p.waitForURL("**/dashboard");
  check("nothing waits: friendly empty state, no tabs", (await p.getByTestId("student-empty").innerText()).includes("Teď tu nic nečeká") && (await p.getByTestId("student-empty").innerText()).includes("e-mailem") && (await tabs(p)).length === 0);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('rc','mc','usr_stud1','usr_stud1',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('rc','sm')`);
  await p.goto("/");
  await p.waitForURL("**/makeup");
  check("future registration on a cancelled session keeps the makeup tab", (await p.locator('[data-registration][data-session-id="mc"]').count()) === 1);

  // učitel a admin: navigace beze změny
  const pt = await login(browser, "teacher@skola.cz");
  check("teacher keeps the old navigation", (await navLabels(pt)).join(",") === "Dashboard,Zápisy,Předměty,Moje předměty,Dopisování,Uživatelé,Administrace,Můj profil", (await navLabels(pt)).join(","));
  check("teacher has no student account menu", (await pt.getByTestId("account-menu").count()) === 0);
});

test("zápis po krocích: bloky, Vybrat, Vyměnit, Odepsat, nepovinný blok, odkaz na předmět, volná místa", async ({ browser }) => {
  resetDb();
  // blok 3 je nepovinný (max 1) s Alfou a Betou; „Angličtina B“ má jediné místo
  sql(`insert into "Subject"(id,name,"updatedAt") values ('sa','Alfa',now()),('sb','Beta',now())`);
  sql(`insert into "Block"(id,name,"order",required,"minEnrollments","maxEnrollments","enrollmentWindowId","createdById","updatedAt") values ('blk_3','Blok 3 – nepovinný',3,false,0,1,'${WINDOW}','usr_admin',now())`);
  sql(`insert into "SubjectOccurrence"(id,"subjectId","blockId",capacity,"createdById","updatedAt") values ('occ3a','sa','blk_3',null,'usr_admin',now()),('occ3b','sb','blk_3',null,'usr_admin',now())`);
  sql(`update "SubjectOccurrence" set capacity=3 where id='occ_aj_a_b1'`); // Eva je zapsaná → zbývají 2 místa
  sql(`update "SubjectOccurrence" set capacity=1 where id='occ_aj_b_b1'`); // 1 volné místo
  const p = await login(browser, "jan.student@skola.cz");

  // výchozí stav: rozbalený je blok 2 (na řadě), blok 1 je hotový a sbalený se zvoleným předmětem
  const toggle = (id: string) => p.locator(`[data-block="${id}"] [data-testid=block-toggle]`);
  check("block on turn is open, done block collapsed", (await toggle("blk_2").getAttribute("aria-expanded")) === "true" && (await toggle("blk_1").getAttribute("aria-expanded")) === "false" && (await toggle("blk_3").getAttribute("aria-expanded")) === "false");
  check("done block: tick and chosen seminar", (await p.locator('[data-block="blk_1"]').getAttribute("data-done")) === "true" && (await p.locator('[data-block="blk_1"] [data-testid=block-state]').innerText()) === "Programování mikrokontrolérů");
  check("optional block says it is optional", (await p.locator('[data-block="blk_3"] [data-testid=block-state]').innerText()).startsWith("Nepovinné"));
  check("sticky bar says what is missing; no big congratulation", (await p.getByTestId("enrollment-status-bar").innerText()).includes("Zbývá vybrat: Blok 2 – volitelné") && !(await p.locator("main").innerText()).includes("Máte hotovo"));
  check("progress: 1 of 2 required blocks", (await p.getByTestId("window-progress-bar").innerText()).includes("1 ze 2 hotovo"));

  // volná místa česky, neomezená kapacita, plné na konci a neaktivní, odkaz na detail předmětu
  await toggle("blk_1").click();
  const free = async (id: string) => (await p.locator(`[data-occurrence="${id}"] [data-testid=occurrence-free]`).innerText()).trim();
  check("free places declined in Czech", (await free("occ_aj_a_b1")) === "2 volná místa" && (await free("occ_aj_b_b1")) === "1 volné místo", `${await free("occ_aj_a_b1")} | ${await free("occ_aj_b_b1")}`);
  check("many free places", (await free("occ_prog_b1")) === "19 volných míst", await free("occ_prog_b1"));
  sql(`insert into "StudentEnrollment"(id,"studentId","subjectOccurrenceId","createdById","updatedAt") values ('blocker','usr_stud2','occ_aj_b_b1','usr_stud2',now())`);
  await p.reload();
  await toggle("blk_1").click();
  const ids = await p.locator('[data-block="blk_1"] [data-occurrence]').evaluateAll((els) => els.map((e) => e.getAttribute("data-occurrence")));
  check("full seminar is last and inactive", ids[ids.length - 1] === "occ_aj_b_b1" && (await p.locator('[data-occurrence="occ_aj_b_b1"] [data-testid=enroll-button]').isDisabled()) && (await p.locator('[data-occurrence="occ_aj_b_b1"] [data-testid=enroll-button]').innerText()) === "Plno", JSON.stringify(ids));
  const link = p.locator('[data-occurrence="occ_aj_a_b1"]').getByRole("link", { name: "Angličtina pro techniky" });
  check("seminar name links to the subject detail", ((await link.getAttribute("href")) ?? "").startsWith("/subjects/"));

  // Vyměnit: v bloku 1 už Jan má Programování, jiný výskyt nabízí „Vyměnit“ (jedna transakce)
  check("chosen one shows Vybráno and Odepsat, others Vyměnit", (await p.locator('[data-occurrence="occ_prog_b1"]').innerText()).includes("Vybráno") && (await p.locator('[data-occurrence="occ_prog_b1"] [data-testid=unenroll-button]').count()) === 1 && (await p.locator('[data-occurrence="occ_aj_a_b1"] [data-testid=enroll-button]').innerText()) === "Vyměnit");
  await p.locator('[data-occurrence="occ_aj_a_b1"] [data-testid=enroll-button]').click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Vyměnit" }).click();
  const t = await toastText(p);
  check("swap done in one step (old one gone, new one in)", count(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "subjectOccurrenceId"='occ_prog_b1' and "deletedAt" is null`) === 0 && count(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "subjectOccurrenceId"='occ_aj_a_b1' and "deletedAt" is null`) === 1, t);
  check("swap audited as remove + add", count(`select count(*) from "AuditLog" where action in ('seminars.enrollment.remove','seminars.enrollment.add') and "actorId"='usr_stud1'`) === 2);

  // Odepsat v bloku 1 (hotovo → chybí), pak blok 2 vybrat a blok se sbalí
  await p.reload();
  await toggle("blk_1").click();
  await p.locator('[data-occurrence="occ_aj_a_b1"] [data-testid=unenroll-button]').click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Odhlásit se" }).click();
  await toastText(p);
  check("unenrolled", count(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "deletedAt" is null`) === 0);
  await p.locator('[data-block="blk_1"] [data-occurrence="occ_prog_b1"] [data-testid=enroll-button]').click();
  await toastText(p);
  // blok 1 je hotový → sbalí se a otevře blok 2, který je na řadě
  await expect(toggle("blk_1")).toHaveAttribute("aria-expanded", "false");
  await expect(toggle("blk_2")).toHaveAttribute("aria-expanded", "true");
  await p.locator('[data-occurrence="occ_iot_b2"] [data-testid=enroll-button]').click();
  await toastText(p);
  await expect(toggle("blk_2")).toHaveAttribute("aria-expanded", "false");
  check("after the last required block: complete", (await p.getByTestId("enrollment-status-bar").getAttribute("data-complete")) === "true" && (await p.getByTestId("enrollment-status-bar").innerText()).includes("Zápis je kompletní") && (await p.getByTestId("window-progress-bar").innerText()).includes("2 ze 2 hotovo"));
  check("optional block does not block completion", count(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "deletedAt" is null`) === 2);

  // nepovinný blok: vybrat, pak „Nechci nic z tohoto bloku“ odepíše a sbalí
  await toggle("blk_3").click();
  await p.locator('[data-occurrence="occ3a"] [data-testid=enroll-button]').click();
  await toastText(p);
  check("optional block selection stored", count(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "subjectOccurrenceId"='occ3a'`) === 1);
  await p.reload();
  await toggle("blk_3").click();
  check("optional block offers Nechci nic", (await p.getByTestId("skip-block").count()) === 1 && (await p.getByTestId("skip-block").innerText()) === "Nechci nic z tohoto bloku");
  await p.getByTestId("skip-block").click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Odhlásit se" }).click();
  await toastText(p);
  check("Nechci nic: unenrolled and collapsed", count(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "subjectOccurrenceId"='occ3a' and "deletedAt" is null`) === 0 && (await toggle("blk_3").getAttribute("aria-expanded")) === "false");
  // bez výběru „Nechci nic“ jen sbalí
  await toggle("blk_3").click();
  await p.getByTestId("skip-block").click();
  check("Nechci nic without a selection just collapses", (await toggle("blk_3").getAttribute("aria-expanded")) === "false" && (await p.getByRole("alertdialog").count()) === 0);
  // povinný blok „Nechci nic“ nenabízí
  await toggle("blk_1").click();
  check("required block has no skip", (await p.getByTestId("skip-block").count()) === 0);

  // odkaz na detail předmětu funguje
  await p.locator('[data-occurrence="occ_aj_a_b1"]').getByRole("link", { name: "Angličtina pro techniky" }).click();
  await p.waitForURL("**/subjects/**");
  check("subject detail opens", (await p.locator("main").innerText()).includes("Angličtina pro techniky"));
});

test("blok s více výběry: druhý výběr přibude, při plném počtu se vyměňuje a student volí, který výběr nahradit", async ({ browser }) => {
  resetDb();
  sql(`insert into "Subject"(id,name,"updatedAt") values ('sa','Alfa',now()),('sb','Beta',now()),('sc','Gamma',now())`);
  sql(`insert into "Block"(id,name,"order",required,"minEnrollments","maxEnrollments","enrollmentWindowId","createdById","updatedAt") values ('blk_3','Blok 3 – dva',3,true,1,2,'${WINDOW}','usr_admin',now())`);
  sql(`insert into "SubjectOccurrence"(id,"subjectId","blockId",capacity,"createdById","updatedAt") values ('occ3a','sa','blk_3',null,'usr_admin',now()),('occ3b','sb','blk_3',null,'usr_admin',now()),('occ3c','sc','blk_3',null,'usr_admin',now())`);
  sql(`insert into "StudentEnrollment"(id,"studentId","subjectOccurrenceId","createdById","updatedAt") values ('e_iot','usr_stud1','occ_iot_b2','usr_stud1',now())`);
  const p = await login(browser, "jan.student@skola.cz");
  const toggle = p.locator('[data-block="blk_3"] [data-testid=block-toggle]');
  check("block 3 is on turn", (await toggle.getAttribute("aria-expanded")) === "true");
  await p.locator('[data-occurrence="occ3a"] [data-testid=enroll-button]').click();
  await toastText(p);
  // minimum splněno, ale max 2: blok zůstává otevřený a nabízí druhý výběr
  check("block with room for a second choice stays open and is done", (await toggle.getAttribute("aria-expanded")) === "true" && (await p.locator('[data-block="blk_3"]').getAttribute("data-done")) === "true" && (await p.locator('[data-occurrence="occ3b"] [data-testid=enroll-button]').innerText()) === "Vybrat");
  await p.locator('[data-occurrence="occ3b"] [data-testid=enroll-button]').click();
  await toastText(p);
  check("two choices in the block", count(`select count(*) from "StudentEnrollment" e join "SubjectOccurrence" o on o.id=e."subjectOccurrenceId" where e."studentId"='usr_stud1' and o."blockId"='blk_3' and e."deletedAt" is null`) === 2);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  // plný počet: Vyměnit, student vybere, který výběr nahradí
  await p.locator('[data-occurrence="occ3c"] [data-testid=enroll-button]').click();
  const dlg = p.getByRole("alertdialog");
  await expect(dlg.getByTestId("switch-from")).toBeVisible();
  await dlg.getByLabel("Beta").check();
  await dlg.getByRole("button", { name: "Vyměnit" }).click();
  await toastText(p);
  check("the chosen choice was replaced, the other one kept", sql(`select string_agg(o.id, ',' order by o.id) from "StudentEnrollment" e join "SubjectOccurrence" o on o.id=e."subjectOccurrenceId" where e."studentId"='usr_stud1' and o."blockId"='blk_3' and e."deletedAt" is null`) === "occ3a,occ3c");
});

test("dopisování: čip předmětu, přihlášení z dialogu s poznámkou pro vyučujícího, další předmět z termínu, úprava poznámky", async ({ browser }) => {
  resetDb();
  seedSubjects();
  sql(`update "EnrollmentWindow" set published=false where id='${WINDOW}'`);
  makeupSession("m1");
  sql(`insert into "MakeupSessionSubject" values ('m1','scj')`);
  const p = await login(browser, "jan.student@skola.cz");
  check("lands on makeup, which is the only tab", p.url().endsWith("/makeup") && (await tabs(p)).length === 0, p.url());
  check("sections: Moje přihlášky and the subject question", (await p.getByTestId("no-registrations").innerText()).includes("Zatím nejste přihlášeni") && (await p.locator("main").innerText()).includes("Který předmět potřebujete dopsat?"));
  check("no subject filter select, no 'only mine' switch", (await p.locator("#subject-filter, #only-mine").count()) === 0);
  await pickSubjectChip(p, "Matematika");
  await p.locator('[data-session="m1"]').getByRole("button", { name: "Přihlásit se" }).click();
  const dialog = p.getByRole("dialog");
  check("dialog: subject prefilled, other subjects of the term can be added, note field labelled", (await dialog.locator("#reg-subjects [data-subject=M]").isChecked()) && (await dialog.locator("#reg-subjects [data-subject=CJ]").isChecked()) === false && (await dialog.getByLabel("Poznámka pro vyučujícího (nepovinné)").count()) === 1 && (await dialog.getByRole("button", { name: "Potvrdit přihlášku" }).count()) === 1);
  await dialog.locator("#reg-subjects [data-subject=CJ]").check();
  await dialog.getByLabel("Poznámka pro vyučujícího (nepovinné)").fill("písemka z 12. 10., kalkulačka");
  await dialog.getByRole("button", { name: "Potvrdit přihlášku" }).click();
  await toastText(p);
  check("registered with two subjects and the note", sql(`select string_agg(s."subjectId", ',' order by s."subjectId") from "MakeupRegistrationSubject" s join "MakeupRegistration" r on r.id=s."registrationId" where r."sessionId"='m1'`) === "scj,sm" && sql(`select note from "MakeupRegistration" where "sessionId"='m1'`) === "písemka z 12. 10., kalkulačka");
  const mine = p.locator('[data-registration][data-session-id="m1"]');
  const text = await mine.innerText();
  check("my registration shows time, room, supervisor, subjects and note", text.includes("učebna 204") && text.includes("dozor Učitel Petr") && text.includes("Matematika") && text.includes("Čeština") && text.includes("písemka z 12. 10., kalkulačka") && text.includes("Změny a odhlášení jsou možné do"), text);
  // změna poznámky (Upravit) a odhlášení
  await mine.getByRole("button", { name: "Upravit" }).click();
  await p.getByLabel("Poznámka pro vyučujícího (nepovinné)").fill("jen matematika");
  await p.locator("#reg-subjects [data-subject=CJ]").uncheck();
  await p.getByTestId("reg-submit").click();
  await toastText(p);
  check("note and subjects changed", sql(`select note from "MakeupRegistration" where "sessionId"='m1'`) === "jen matematika" && count(`select count(*) from "MakeupRegistrationSubject"`) === 1);
  await mine.getByRole("button", { name: "Odhlásit se" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Odhlásit", exact: true }).click();
  await toastText(p);
  check("cancelled registration", count(`select count(*) from "MakeupRegistration"`) === 0 && (await p.getByTestId("no-registrations").count()) === 1);
});

test("host: zápis jen ke čtení (bez tlačítek), všechny bloky rozbalené, nabídka beze změny", async ({ browser }) => {
  resetDb();
  sql(`update "User" set role='GUEST' where id='usr_stud2'`);
  const pg = await login(browser, "eva.studentova@skola.cz");
  check("guest keeps the old landing (dashboard) and the old menu", pg.url().endsWith("/dashboard") && (await navLabels(pg)).join(",") === "Zápisy", (await navLabels(pg)).join(","));
  await pg.goto("/zapisy/" + WINDOW);
  await pg.waitForSelector("[data-testid=block-toggle]");
  check("guest sees all seminars, no buttons, the approval banner", (await pg.locator("[data-occurrence]").count()) === 4 && (await pg.getByTestId("enroll-button").count()) === 0 && (await pg.locator("main").innerText()).includes("čeká na schválení"));
  // server by zápis hosta stejně odmítl (seminars.enroll.self); tady stačí, že UI nic nenabízí
});
