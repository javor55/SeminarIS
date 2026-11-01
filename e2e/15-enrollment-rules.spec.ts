import { test, expect, type Page } from "@playwright/test";
import { sql, resetDb, login, toastText, occ } from "./helpers";

// F5: konfigurovatelné zápisy – publikum okna (ročníky, třídy, studenti, výjimky), hromadná akce z Uživatelů,
// pravidla bloků (povinný/nepovinný, min/max), pravidla okna (odepsání, termín změn, viditelnost zapsaných),
// omezení výskytu na třídu, duplikace okna a souběh. Server vynucuje vše; testy často používají „zastaralou“
// stránku studenta (načtenou před změnou pravidla), aby bylo vidět, že odmítá server, ne jen UI.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const WINDOW = "enr_ls_2025";
const auditCount = (where: string) => Number(sql(`select count(*) from "AuditLog" where ${where}`));
const enrolled = (email: string) => Number(sql(`select count(*) from "StudentEnrollment" e join "User" u on u.id=e."studentId" where u.email='${email}' and e."deletedAt" is null`));
const classId = (grade: number, letter: string) => sql(`select id from "ClassGroup" where grade=${grade} and letter='${letter}'`);

/** Další studenti s heslem „password123“ (hash převzatý z Jana): Kamil a Dana v 2.A, Čeněk ve 4.A. */
function addStudents() {
  sql(`insert into "ClassGroup"(id,grade,letter,"updatedAt") values ('c2a',2,'A',now()),('c4a',4,'A',now())`);
  sql(
    `insert into "User"(id,"firstName","lastName",email,role,"classGroupId","passwordHash","updatedAt") select v.id, v.fn, v.ln, v.em, 'STUDENT'::"Role", v.cls, u."passwordHash", now() from (values ('kamil','Kamil','Dvojka','kamil@skola.cz','c2a'),('dana','Dana','Dvojková','dana@skola.cz','c2a'),('cenek','Čeněk','Čtvrťák','cenek@skola.cz','c4a')) v(id,fn,ln,em,cls), "User" u where u.id='usr_stud1'`
  );
}

/** Tři předměty a blok 3 se dvěma povinnými zápisy (výskyty Alfa, Beta, Gamma). */
function addBlockThree() {
  sql(`insert into "Subject"(id,name,"updatedAt") values ('sa','Alfa',now()),('sb','Beta',now()),('sc','Gamma',now())`);
  sql(`insert into "Block"(id,name,"order",required,"minEnrollments","maxEnrollments","enrollmentWindowId","createdById","updatedAt") values ('blk_3','Blok 3 – dva',3,true,2,2,'${WINDOW}','usr_admin',now())`);
  sql(
    `insert into "SubjectOccurrence"(id,"subjectId","blockId",capacity,"createdById","updatedAt") values ('occ3a','sa','blk_3',null,'usr_admin',now()),('occ3b','sb','blk_3',null,'usr_admin',now()),('occ3c','sc','blk_3',null,'usr_admin',now())`
  );
}

/** Student se zapisuje na stránce Zápisy (detail okna), dashboard má jen přehledové karty. */
async function enrollPage(p: Page) {
  await p.goto("/zapisy/" + WINDOW);
  await p.waitForLoadState("networkidle");
}

const row = (p: Page, text: string) => p.locator("tr", { hasText: text }).first();
const hasWindow = async (p: Page) => (await p.content()).includes("Zápis LS 2025");

test("publikum: třída + konkrétní student + výjimka (viditelnost, zápis povolen i zamítnut serverem, nezapsaní)", async ({ browser }) => {
  resetDb();
  addStudents();
  // stránky studentů se načtou, dokud je publikum prázdné (= všichni): potom je admin zúží
  const eva = await login(browser, "eva.studentova@skola.cz");
  const kamil = await login(browser, "kamil@skola.cz");
  await enrollPage(eva);
  await enrollPage(kamil);
  check("before: everybody sees the window", (await hasWindow(eva)) && (await hasWindow(kamil)));

  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  check("empty audience = all students in header", (await pa.getByTestId("window-audience").innerText()).includes("všichni studenti"));
  await pa.getByRole("button", { name: "Upravit zápis" }).click();
  await pa.waitForSelector("[data-testid=audience-picker]");
  await expect(pa.getByTestId("audience-count")).toContainText("určen 5 studentům"); // Jan, Eva, Kamil, Dana, Čeněk

  await pa.locator('#audience-classes [data-class="3.A"]').click();
  await expect(pa.getByTestId("audience-count")).toContainText("určen 1 studentovi");
  await pa.locator('#audience-classes [data-class="3.B"]').click();
  await pa.fill("#audience-user-search", "Čtvrťák");
  await pa.locator('[data-testid=audience-user-result][data-email="cenek@skola.cz"]').click();
  await expect(pa.getByTestId("audience-count")).toContainText("určen 3 studentům");
  await pa.fill("#audience-exclude-search", "Studentová");
  await pa.locator('[data-testid=audience-exclude-result][data-email="eva.studentova@skola.cz"]').click();
  await expect(pa.getByTestId("audience-count")).toContainText("určen 2 studentům");
  await pa.getByText("Zobrazit seznam studentů").click();
  const listed = await pa.getByTestId("audience-list").innerText();
  check("live list shows matching students only", listed.includes("Student Jan") && listed.includes("Čtvrťák Čeněk") && !listed.includes("Studentová") && !listed.includes("Dvojk"), listed);
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await toastText(pa);

  check("audience rows saved", sql(`select string_agg(type::text, ',' order by type::text, key) from "EnrollmentWindowAudience" where "windowId"='${WINDOW}'`) === "CLASS,CLASS,EXCLUDE_USER,USER", sql(`select string_agg(key, ',') from "EnrollmentWindowAudience"`));
  check("audience change audited with before/after", auditCount(`action='seminars.window.update' and summary like '%publikum: všichni studenti → třídy 3.A, 3.B, +1 student, kromě 1%'`) === 1, sql(`select summary from "AuditLog" where action='seminars.window.update'`));
  await pa.reload();
  await pa.waitForLoadState("networkidle");
  check("header shows the audience", (await pa.getByTestId("window-audience").innerText()).includes("třídy 3.A, 3.B, +1 student, kromě 1"), await pa.getByTestId("window-audience").innerText());

  // viditelnost po změně publika
  const jan = await login(browser, "jan.student@skola.cz");
  const cenek = await login(browser, "cenek@skola.cz");
  check("class member sees the window", await hasWindow(jan));
  check("specific user sees the window", await hasWindow(cenek));
  await enrollPage(eva);
  check("excluded class member does not see it", !(await hasWindow(eva)));
  await enrollPage(kamil);
  check("student of another class does not see it", !(await hasWindow(kamil)));

  // server odmítne zápis i ze zastaralé stránky (stránky Evy a Kamila se po změně nenačetly znovu)
  // (stránku jsme výše načetli znovu, proto použijeme čerstvě otevřené okno s původním stavem)
  sql(`delete from "EnrollmentWindowAudience" where "windowId"='${WINDOW}'`);
  const evaStale = await login(browser, "eva.studentova@skola.cz");
  const kamilStale = await login(browser, "kamil@skola.cz");
  await enrollPage(evaStale);
  await enrollPage(kamilStale);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"classGroupId",key) values ('a1','${WINDOW}','CLASS','${classId(3, "A")}','CLASS:${classId(3, "A")}'),('a2','${WINDOW}','CLASS','${classId(3, "B")}','CLASS:${classId(3, "B")}')`);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"userId",key) values ('a3','${WINDOW}','USER','cenek','USER:cenek'),('a4','${WINDOW}','EXCLUDE_USER','usr_stud2','EXCLUDE_USER:usr_stud2')`);
  await (await occ(evaStale, "Základy IoT")).getByTestId("enroll-button").click();
  check("excluded student denied by the server", (await toastText(evaStale)).includes("Tento zápis pro vás není určen"), await toastText(evaStale));
  await (await occ(kamilStale, "Základy IoT")).getByTestId("enroll-button").click();
  check("student outside the audience denied by the server", (await toastText(kamilStale)).includes("Tento zápis pro vás není určen"));
  check("nothing was enrolled for them", enrolled("kamil@skola.cz") === 0 && enrolled("eva.studentova@skola.cz") === 1);

  // zápis povolen členům publika
  await enrollPage(jan);
  await (await occ(jan, "Základy IoT")).getByTestId("enroll-button").click();
  await toastText(jan);
  await enrollPage(cenek);
  await (await occ(cenek, "Programování mikrokontrolérů")).getByTestId("enroll-button").click();
  await toastText(cenek);
  check("members of the audience can enroll", enrolled("jan.student@skola.cz") === 2 && enrolled("cenek@skola.cz") === 1);

  // nezapsaní a připomínky jdou jen přes publikum: Čeněk (chybí blok 2), Jan ne (má oba bloky); Dvojky a Eva nejsou vidět
  await pa.goto("/enrollments/" + WINDOW);
  await pa.locator("button[data-tab=unenrolled]").click();
  await expect(pa.getByTestId("unenrolled-count")).toContainText("Nezapsaných studentů: 1");
  check("only audience members in the non-enrolled list", (await pa.locator('tr[data-email="cenek@skola.cz"]').count()) === 1 && (await pa.locator('tr[data-email="kamil@skola.cz"]').count()) === 0 && (await pa.locator('tr[data-email="eva.studentova@skola.cz"]').count()) === 0);
  await expect(pa.getByTestId("unenrolled-remind")).toContainText("(1 e-mailů)");

  // dashboard / seznam předmětů: štítek „v zápisu“ jen u těch, komu je zápis určen
  await jan.goto("/subjects");
  await jan.waitForLoadState("networkidle");
  check("subject badge visible for audience member", (await row(jan, "Základy IoT").innerText()).includes("v zápisu"));
  await kamil.goto("/subjects");
  await kamil.waitForLoadState("networkidle");
  check("no badge for a student outside the audience", !(await kamil.locator("main").innerText()).includes("v zápisu"));
});

test("hromadná akce z Uživatelů: přidat do publika zápisu (náhled, audit, zablokování) a odebrat", async ({ browser }) => {
  resetDb();
  addStudents();
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"classGroupId",key) values ('a1','${WINDOW}','CLASS','${classId(3, "A")}','CLASS:${classId(3, "A")}')`);
  // druhé okno bez omezení publika (= všichni)
  sql(`insert into "EnrollmentWindow"(id,name,"startsAt","endsAt",published,"createdById","updatedAt") values ('w_all','Zápis pro všechny',now()-interval '1 hour',now()+interval '30 days',true,'usr_admin',now())`);

  const pa = await login(browser, "admin@skola.cz");
  const open = async () => {
    await pa.goto("/users?role=STUDENT");
    await pa.waitForSelector("[data-testid=users-table]");
    await pa.waitForLoadState("networkidle");
  };
  const pick = async (...emails: string[]) => {
    for (const e of emails) await pa.locator(`tr[data-user="${e}"] input[type=checkbox]`).check();
  };
  const finish = async () => {
    await pa.getByTestId("bulk-confirm").click();
    await pa.waitForSelector("[data-testid=bulk-dialog]", { state: "detached" });
  };

  await open();
  await pick("kamil@skola.cz", "dana@skola.cz", "jan.student@skola.cz");
  check("module action offered", (await pa.getByTestId("bulk-action-select").locator("option", { hasText: "Přidat do publika zápisu" }).count()) === 1);
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Přidat do publika zápisu" });
  await pa.waitForSelector("[data-testid=bulk-dialog]");
  await pa.locator("#bulk-windowId").selectOption({ label: "Zápis LS 2025 (otevřeno)" });
  await expect(pa.getByTestId("bulk-count")).toContainText("Vybráno 3, akce se týká 2");
  const preview = await pa.getByTestId("bulk-preview").innerText();
  check("preview: who is added and who is skipped", preview.includes("přidá 2 studenti") && preview.includes("už jsou v publiku"), preview);
  await finish();
  check("USER rows written", sql(`select string_agg("userId",',' order by "userId") from "EnrollmentWindowAudience" where "windowId"='${WINDOW}' and type='USER'`) === "dana,kamil");
  check("bulk summary audit", auditCount(`action='users.bulk.seminars.audience'`) === 1);
  check("window audit entry", auditCount(`action='seminars.window.audience' and "entityId"='${WINDOW}' and summary like '%přidáno: 2 studenti%'`) === 1);
  check("audit is in the history of an added student", auditCount(`action='users.bulk.seminars.audience' and data->'userIds' @> '"kamil"'`) === 1);

  const kamil = await login(browser, "kamil@skola.cz");
  check("added student sees the window", await hasWindow(kamil));
  const cenek = await login(browser, "cenek@skola.cz");
  check("not selected student of another class still does not", !(await hasWindow(cenek)));

  // okno bez omezení publika: přidávání nemá smysl, akce je zablokovaná
  await open();
  await pick("cenek@skola.cz");
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Přidat do publika zápisu" });
  await pa.locator("#bulk-windowId").selectOption({ label: "Zápis pro všechny (otevřeno)" });
  await expect(pa.getByTestId("bulk-blocked")).toContainText("určen všem studentům");
  check("confirm disabled for an unrestricted window", await pa.getByTestId("bulk-confirm").isDisabled());
  await pa.keyboard.press("Escape");

  // odebrání: Kamil (jmenovitě) zmizí, Jan (pokrývá ho třída 3.A) dostane výjimku
  await open();
  await pick("kamil@skola.cz", "jan.student@skola.cz");
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Odebrat z publika zápisu" });
  await pa.locator("#bulk-windowId").selectOption({ label: "Zápis LS 2025 (otevřeno)" });
  await expect(pa.getByTestId("bulk-count")).toContainText("Vybráno 2, akce se týká 2");
  check("preview explains the exception", (await pa.getByTestId("bulk-preview").innerText()).includes("přidají mezi vynechané"));
  await finish();
  check("named student removed, class member excluded", sql(`select string_agg(type||':'||"userId",',' order by "userId") from "EnrollmentWindowAudience" where "windowId"='${WINDOW}' and "userId" is not null`) === "USER:dana,EXCLUDE_USER:usr_stud1");
  const jan = await login(browser, "jan.student@skola.cz");
  check("excluded class member no longer sees it", !(await hasWindow(jan)));

  // odebrání posledního kladného člena by z publika udělalo „všichni“: akce to nedovolí
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"userId",key) values ('a9','w_all','USER','dana','USER:dana')`);
  await open();
  await pick("dana@skola.cz");
  await pa.getByTestId("bulk-action-select").selectOption({ label: "Odebrat z publika zápisu" });
  await pa.locator("#bulk-windowId").selectOption({ label: "Zápis pro všechny (otevřeno)" });
  await expect(pa.getByTestId("bulk-blocked")).toContainText("nikdo nezbyl");
  await pa.keyboard.press("Escape");
});

test("pravidla bloků: povinný/nepovinný, min a max zápisů, nezapsaní počítají jen povinné bloky", async ({ browser }) => {
  resetDb();
  addBlockThree();
  const pa = await login(browser, "admin@skola.cz");

  // blok 2 uděláme nepovinným a povolíme v něm víc zápisů přes dialog bloku
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  check("default rules shown on the block", (await pa.locator("h2", { hasText: "Blok 1 – povinné" }).locator("xpath=..").getByTestId("block-rules").innerText()) === "povinný, 1 zápis");
  check("block 3 shows min–max", (await pa.locator("h2", { hasText: "Blok 3 – dva" }).locator("xpath=..").getByTestId("block-rules").innerText()) === "povinný, 2 zápisy");
  const card = (name: string) => pa.locator("h2", { hasText: name }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await card("Blok 2 – volitelné").getByTestId("block-menu").click();
  await pa.getByRole("menuitem", { name: "Upravit blok" }).click();
  await pa.locator("#block-required").click();
  await pa.fill("#block-max", "2");
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await toastText(pa);
  check("optional block saved", sql(`select required||'/'||"minEnrollments"||'/'||"maxEnrollments" from "Block" where id='blk_2'`) === "false/1/2", sql(`select required||'/'||"maxEnrollments" from "Block" where id='blk_2'`));
  check("block rules change audited", auditCount(`action='seminars.block.update' and summary like '%pravidla: povinný, 1 zápis → nepovinný, 1–2 zápisy%'`) === 1, sql(`select summary from "AuditLog" where action='seminars.block.update'`));

  // nový blok z UI dostane výchozí 1/1 povinný
  await pa.getByRole("button", { name: "Přidat blok" }).click();
  await pa.fill("#block-name", "Blok 4 – nový");
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await toastText(pa);
  check("new block defaults to required 1/1", sql(`select required||'/'||"minEnrollments"||'/'||"maxEnrollments" from "Block" where name='Blok 4 – nový'`) === "true/1/1");
  sql(`delete from "Block" where name='Blok 4 – nový'`);

  // nezapsaní: nepovinný blok 2 se nepočítá, blok 3 chce 2 zápisy
  await pa.goto("/enrollments/" + WINDOW);
  await pa.locator("button[data-tab=unenrolled]").click();
  await expect(pa.getByTestId("unenrolled-count")).toContainText("Nezapsaných studentů: 2");
  const janRow = await pa.locator('tr[data-email="jan.student@skola.cz"]').innerText();
  check("only the required block is missing", janRow.includes("Blok 3 – dva (zapsáno 0 z 2)") && !janRow.includes("Blok 2"), janRow);

  // student: průběh v bloku, max 2 zápisy, třetí server odmítne
  const jan = await login(browser, "jan.student@skola.cz");
  await enrollPage(jan);
  const progress = jan.locator('[data-block="blk_3"]').getByTestId("block-progress");
  check("student sees block progress (block 3 is the one on turn)", (await progress.innerText()).includes("Zapsáno 0 z 2"));
  // druhá, „zastaralá“ stránka studenta (načtená, dokud je v bloku 0 z 2), pro zkoušku maxima na serveru
  const jan2 = await login(browser, "jan.student@skola.cz");
  await enrollPage(jan2);
  await (await occ(jan, "Alfa")).getByTestId("enroll-button").click();
  await toastText(jan);
  check("block stays open after the first of two", (await jan.locator('[data-block="blk_3"]').getByTestId("block-progress").innerText()).includes("Zapsáno 1 z 2"));
  await (await occ(jan, "Beta")).getByTestId("enroll-button").click();
  await toastText(jan);
  check("two enrollments in a 2-block", enrolled("jan.student@skola.cz") === 3);
  // plný blok s max 2: místo „Vybrat“ je „Vyměnit“ (výběr se vymění, počet se nezvýší)
  const gamma = await occ(jan, "Gamma");
  check("full block offers Vyměnit instead of Vybrat", (await gamma.getByTestId("enroll-button").innerText()) === "Vyměnit" && (await gamma.getByTestId("enroll-button").getAttribute("data-action")) === "switch");
  await gamma.getByTestId("enroll-button").click();
  check("Vyměnit asks which of the two choices to replace", (await jan.getByTestId("switch-from").count()) === 1);
  await jan.getByRole("button", { name: "Zrušit" }).click();
  // server vynutí maximum i ze zastaralé stránky (ta ještě ukazuje „Vybrat“)
  await (await occ(jan2, "Gamma")).getByTestId("enroll-button").click();
  check("third enrollment refused by the block maximum", (await toastText(jan2)).includes("nejvyšší povolený počet zápisů (2)"));
  check("still three", enrolled("jan.student@skola.cz") === 3);
  // v bloku s max 1 se zápis přepisuje jednou transakcí (původní zůstane, když nový selže)
  // student kód výskytu nevidí: výskyt B poznáme podle skupiny (u názvu „skupina B“); kapacita 14 při načtení je jen zastaralý stav stránky
  sql(`update "SubjectOccurrence" set capacity=14 where id='occ_aj_b_b1'`);
  await enrollPage(jan);
  sql(`update "SubjectOccurrence" set capacity=1 where id='occ_aj_b_b1'`);
  sql(`insert into "StudentEnrollment"(id,"studentId","subjectOccurrenceId","createdById","updatedAt") values ('blocker','usr_stud2','occ_aj_b_b1','usr_stud2',now())`);
  sql(`delete from "StudentEnrollment" where id='enroll_stud2_aj'`);
  await (await occ(jan, "skupina B")).getByTestId("enroll-button").click();
  await jan.getByRole("alertdialog").getByRole("button", { name: "Vyměnit" }).click();
  check("failed switch keeps the original enrollment", (await toastText(jan)).includes("Kapacita") && sql(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "subjectOccurrenceId"='occ_prog_b1'`) === "1");

  // Eva s jedním zápisem v bloku 3 má neúplné
  sql(`insert into "StudentEnrollment"(id,"studentId","subjectOccurrenceId","createdById","updatedAt") values ('ev3','usr_stud2','occ3a','usr_stud2',now())`);
  await pa.goto("/enrollments/" + WINDOW);
  await pa.locator("button[data-tab=unenrolled]").click();
  await expect(pa.getByTestId("unenrolled-count")).toContainText("Nezapsaných studentů: 1");
  check("incomplete block shows progress", (await pa.locator('tr[data-email="eva.studentova@skola.cz"]').innerText()).includes("Blok 3 – dva (zapsáno 1 z 2)"));

  // maximum nejde snížit pod zápisy, které studenti už mají
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  await card("Blok 3 – dva").getByTestId("block-menu").click();
  await pa.getByRole("menuitem", { name: "Upravit blok" }).click();
  await pa.fill("#block-min", "1");
  await pa.fill("#block-max", "1");
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  check("lowering the maximum below existing enrollments is refused", (await toastText(pa)).includes("víc zápisů"));
  check("rules unchanged", sql(`select "maxEnrollments" from "Block" where id='blk_3'`) === "2");
});

test("pravidla okna: zákaz odepsání, termín změn, viditelnost zapsaných, uložení z formuláře", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");

  // nastavení z formuláře okna
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  await pa.getByRole("button", { name: "Upravit zápis" }).click();
  await pa.waitForSelector("[data-testid=window-rules]");
  await pa.locator("#allowSelfUnenroll").click();
  await pa.locator("#resultsVisibility").selectOption("NAMES");
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await toastText(pa);
  check("rules saved from the form", sql(`select "allowSelfUnenroll"||'/'||"resultsVisibility" from "EnrollmentWindow" where id='${WINDOW}'`) === "false/NAMES");
  check("rules change audited", auditCount(`action='seminars.window.update' and summary like '%student se může sám odepsat: ano → ne%' and summary like '%jména i počty%'`) === 1, sql(`select summary from "AuditLog" where action='seminars.window.update'`));
  await pa.reload();
  await pa.waitForLoadState("networkidle");
  check("header summarizes the rules", (await pa.getByTestId("window-rules-summary").innerText()).includes("Student se nemůže sám odepsat"));
  // vlastní termín změn z formuláře (výchozí hodnota = konec okna)
  await pa.getByRole("button", { name: "Upravit zápis" }).click();
  await pa.locator("#allowSelfUnenroll").click();
  await pa.locator("#changesMode").selectOption("custom");
  await pa.waitForSelector("[data-testid=changes-until]");
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await toastText(pa);
  check("custom deadline saved", sql(`select "allowSelfUnenroll"||'/'||("changesUntil" is not null) from "EnrollmentWindow" where id='${WINDOW}'`) === "true/true");

  // server vynucuje: zastaralá stránka studenta, který se ještě „může“ odepsat
  sql(`update "EnrollmentWindow" set "allowSelfUnenroll"=true, "changesUntil"=null, "resultsVisibility"='COUNTS' where id='${WINDOW}'`);
  const jan = await login(browser, "jan.student@skola.cz");
  await enrollPage(jan);
  check("counts only: no participants button", (await jan.getByTestId("participants-button").count()) === 0);
  const janHtml = await jan.content();
  check("other students' ids are not sent to a student", !janHtml.includes("usr_stud2"), janHtml.slice(Math.max(0, janHtml.indexOf("usr_stud2") - 200), janHtml.indexOf("usr_stud2") + 100));

  sql(`update "EnrollmentWindow" set "allowSelfUnenroll"=false where id='${WINDOW}'`);
  await (await occ(jan, "Programování mikrokontrolérů")).getByTestId("unenroll-button").click();
  await jan.getByRole("button", { name: "Odhlásit se" }).click();
  check("unenrolling refused by the server when disabled", (await toastText(jan)).includes("nemůžete odepsat ani přepsat"), await toastText(jan));
  check("enrollment kept", enrolled("jan.student@skola.cz") === 1);
  await enrollPage(jan);
  check("button disabled with a reason after reload", await (await occ(jan, "Programování mikrokontrolérů")).getByTestId("unenroll-button").isDisabled());
  // přepsání v bloku s max 1 je také zakázáno (zápis zůstává)
  await (await occ(jan, "Angličtina")).getByTestId("enroll-button").click();
  check("switching refused as well", (await toastText(jan)).includes("nemůžete odepsat ani přepsat") || (await toastText(jan)).includes("nelze změnit"));

  // termín změn uplynul: odepsání nejde, nový zápis do prázdného bloku ano
  sql(`update "EnrollmentWindow" set "allowSelfUnenroll"=true where id='${WINDOW}'`);
  await enrollPage(jan);
  sql(`update "EnrollmentWindow" set "changesUntil"=now()-interval '10 minutes' where id='${WINDOW}'`);
  await (await occ(jan, "Programování mikrokontrolérů")).getByTestId("unenroll-button").click();
  await jan.getByRole("button", { name: "Odhlásit se" }).click();
  check("unenrolling refused after the change deadline", (await toastText(jan)).includes("Termín pro změny zápisu už uplynul"), await toastText(jan));
  await (await occ(jan, "Základy IoT")).getByTestId("enroll-button").click();
  await toastText(jan);
  check("new enrollment after the deadline is still allowed", enrolled("jan.student@skola.cz") === 2);

  // viditelnost výsledků: jména
  sql(`update "EnrollmentWindow" set "resultsVisibility"='NAMES', "changesUntil"=null where id='${WINDOW}'`);
  await enrollPage(jan);
  await (await occ(jan, "Angličtina")).getByTestId("participants-button").click();
  await jan.waitForSelector("[data-testid=participants-dialog] [data-testid=participant]");
  const names = await jan.getByTestId("participants-dialog").innerText();
  check("student sees the names when the window allows it", names.includes("Studentová Eva") && !names.includes("@"), names);
  await jan.keyboard.press("Escape");
});

test("výskyt omezený na třídu: viditelnost, zápis, štítek předmětu, nezapsaní", async ({ browser }) => {
  resetDb();
  const jan = await login(browser, "jan.student@skola.cz");
  const eva = await login(browser, "eva.studentova@skola.cz");
  await enrollPage(jan);

  // admin omezí „Základy IoT“ na třídu 3.B přes dialog výskytu
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  await row(pa, "Základy IoT").getByTestId("occurrence-menu").click();
  await pa.getByRole("menuitem", { name: "Upravit", exact: true }).click();
  await pa.locator('#occurrence-classes [data-class="3.B"]').click();
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await toastText(pa);
  check("restriction saved", sql(`select count(*) from "_OccurrenceClasses" where "B"='occ_iot_b2' and "A"='${classId(3, "B")}'`) === "1");
  check("restriction audited", auditCount(`action='seminars.occurrence.update' and summary like '%určeno pro: bez omezení → třídy 3.B%'`) === 1, sql(`select summary from "AuditLog" where action='seminars.occurrence.update'`));
  await pa.reload();
  await pa.waitForLoadState("networkidle");
  check("admin sees the restriction on the row", (await row(pa, "Základy IoT").getByTestId("occurrence-restriction-label").innerText()).includes("3.B"));

  // server odmítne zápis studenta 3.A ze zastaralé stránky
  await (await occ(jan, "Základy IoT")).getByTestId("enroll-button").click();
  check("student of another class refused by the server", (await toastText(jan)).includes("není určen pro váš ročník nebo třídu"), await toastText(jan));
  check("not enrolled", enrolled("jan.student@skola.cz") === 1);
  // po obnovení Jan předmět ani blok nevidí, Eva (3.B) ano
  await enrollPage(jan);
  check("student of another class does not see the occurrence or its block", !(await jan.content()).includes("Základy IoT") && !(await jan.content()).includes("Blok 2 – volitelné"));
  await enrollPage(eva);
  check("student of the class sees it", (await eva.content()).includes("Základy IoT"));
  await (await occ(eva, "Základy IoT")).getByTestId("enroll-button").click();
  await toastText(eva);
  check("student of the class can enroll", enrolled("eva.studentova@skola.cz") === 2);

  // seznam předmětů: štítek „v zápisu“ u IoT má jen 3.B
  await jan.goto("/subjects");
  await jan.waitForLoadState("networkidle");
  check("no window badge on the restricted subject for 3.A", !(await row(jan, "Základy IoT").innerText()).includes("v zápisu"));

  // nezapsaní: Jan blok 2 nemůže zapsat, tak mu nechybí; Eva ho má zapsaný
  sql(`delete from "StudentEnrollment" where "studentId"='usr_stud2' and "subjectOccurrenceId"='occ_iot_b2'`);
  await pa.goto("/enrollments/" + WINDOW);
  await pa.locator("button[data-tab=unenrolled]").click();
  await expect(pa.getByTestId("unenrolled-count")).toContainText("Nezapsaných studentů: 1");
  check("student who cannot choose in the block is not missing it", (await pa.locator('tr[data-email="jan.student@skola.cz"]').count()) === 0 && (await pa.locator('tr[data-email="eva.studentova@skola.cz"]').count()) === 1);
});

test("duplikace okna: bloky, výskyty, publikum a pravidla se zkopírují, zápisy ne, nové okno je koncept", async ({ browser }) => {
  resetDb();
  addBlockThree();
  sql(`update "EnrollmentWindow" set "allowSelfUnenroll"=false, "resultsVisibility"='NAMES', "changesUntil"=now()+interval '2 days', "reminderDaysBefore"=3 where id='${WINDOW}'`);
  sql(`update "Block" set required=false, "maxEnrollments"=2 where id='blk_2'`);
  sql(`insert into "_OccurrenceClasses"("A","B") values ('${classId(3, "B")}','occ_iot_b2')`);
  sql(`update "SubjectOccurrence" set "restrictGrades"='{3}' where id='occ_aj_a_b1'`);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"classGroupId",key) values ('a1','${WINDOW}','CLASS','${classId(3, "A")}','CLASS:${classId(3, "A")}')`);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"userId",key) values ('a2','${WINDOW}','EXCLUDE_USER','usr_stud2','EXCLUDE_USER:usr_stud2')`);

  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  await pa.getByTestId("duplicate-window").click();
  await pa.getByRole("button", { name: "Duplikovat", exact: true }).last().click();
  await pa.waitForURL((u) => u.pathname.startsWith("/enrollments/") && !u.pathname.endsWith(WINDOW), { timeout: 15_000 });

  const copy = sql(`select id from "EnrollmentWindow" where name like '% (kopie)'`);
  check("copy exists as a draft, hidden, with the rules", sql(`select published||'/'||("closedEarlyAt" is null)||'/'||"allowSelfUnenroll"||'/'||"resultsVisibility"||'/'||("changesUntil" is not null)||'/'||"reminderDaysBefore"||'/'||coalesce("reminderSentOn",'-')||'/'||("openedNotifiedAt" is null) from "EnrollmentWindow" where id='${copy}'`) === "false/true/false/NAMES/true/3/-/true", sql(`select published from "EnrollmentWindow" where id='${copy}'`));
  check("blocks copied with rules", sql(`select string_agg(name||':'||required||':'||"minEnrollments"||'-'||"maxEnrollments", '|' order by "order") from "Block" where "enrollmentWindowId"='${copy}'`) === sql(`select string_agg(name||':'||required||':'||"minEnrollments"||'-'||"maxEnrollments", '|' order by "order") from "Block" where "enrollmentWindowId"='${WINDOW}'`));
  check("occurrences copied", sql(`select count(*) from "SubjectOccurrence" o join "Block" b on b.id=o."blockId" where b."enrollmentWindowId"='${copy}'`) === sql(`select count(*) from "SubjectOccurrence" o join "Block" b on b.id=o."blockId" where b."enrollmentWindowId"='${WINDOW}'`) && sql(`select count(*) from "SubjectOccurrence" o join "Block" b on b.id=o."blockId" where b."enrollmentWindowId"='${copy}'`) === "7");
  check("occurrence restrictions copied", sql(`select count(*) from "SubjectOccurrence" o join "Block" b on b.id=o."blockId" where b."enrollmentWindowId"='${copy}' and (o."restrictGrades"='{3}' or exists (select 1 from "_OccurrenceClasses" oc where oc."B"=o.id))`) === "2");
  check("audience copied", sql(`select string_agg(key, ',' order by key) from "EnrollmentWindowAudience" where "windowId"='${copy}'`) === sql(`select string_agg(key, ',' order by key) from "EnrollmentWindowAudience" where "windowId"='${WINDOW}'`) && sql(`select count(*) from "EnrollmentWindowAudience" where "windowId"='${copy}'`) === "2");
  check("no enrollments in the copy", sql(`select count(*) from "StudentEnrollment" e join "SubjectOccurrence" o on o.id=e."subjectOccurrenceId" join "Block" b on b.id=o."blockId" where b."enrollmentWindowId"='${copy}'`) === "0");
  check("original untouched (enrollments and audience)", sql(`select count(*) from "StudentEnrollment"`) === "2" && sql(`select count(*) from "EnrollmentWindowAudience" where "windowId"='${WINDOW}'`) === "2");
  check("duplication audited", auditCount(`action='seminars.window.duplicate' and "entityId"='${copy}'`) === 1);
  check("copy page shows the audience", (await pa.getByTestId("window-audience").innerText()).includes("třída 3.A, kromě 1"), await pa.getByTestId("window-audience").innerText());
  const wcard = sql(`select count(*) from "EnrollmentWindow"`);
  check("two windows now", wcard === "2");
});

test("souběh: dva studenti zároveň na poslední místo – zapíše se jen jeden", async ({ browser }) => {
  resetDb();
  sql(`update "SubjectOccurrence" set capacity=1 where id='occ_iot_b2'`);
  const jan = await login(browser, "jan.student@skola.cz");
  const eva = await login(browser, "eva.studentova@skola.cz");
  await enrollPage(jan);
  await enrollPage(eva);
  const janBtn = (await occ(jan, "Základy IoT")).getByTestId("enroll-button");
  const evaBtn = (await occ(eva, "Základy IoT")).getByTestId("enroll-button");
  await Promise.all([janBtn.click(), evaBtn.click()]);
  const [t1, t2] = await Promise.all([toastText(jan), toastText(eva)]);
  check("exactly one enrollment on the last seat", sql(`select count(*) from "StudentEnrollment" where "subjectOccurrenceId"='occ_iot_b2'`) === "1", `${t1} | ${t2}`);
  check("the other student got a capacity message", [t1, t2].filter((t) => t.includes("Kapacita předmětu je již naplněna")).length === 1, `${t1} | ${t2}`);
});
