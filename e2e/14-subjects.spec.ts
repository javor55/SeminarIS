import { test, expect, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, navLabels } from "./helpers";

// F4: předměty napříč moduly – záložky detailu, štítky a filtry v seznamu, mazání použitého předmětu,
// „Moje předměty“ a výběr předmětů ve formuláři termínu dopisování.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const tabIds = async (p: Page) => await p.locator("[data-testid=subject-tabs] [data-tab]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tab")));
const session = (id: string, teacher: string, startOffset: string, room: string, capacity: number, subject: string, extra = "") => {
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"createdById","updatedAt"${extra ? ',"cancelledAt"' : ""}) values ('${id}','${teacher}',now()+interval '${startOffset}',now()+interval '${startOffset}'+interval '45 min','${room}',${capacity},'${teacher}',now()${extra ? ",now()" : ""})`);
  sql(`insert into "MakeupSessionSubject"("sessionId","subjectId") values ('${id}','${subject}')`);
};
const register = (id: string, sessionId: string, student: string, subject: string, teacher: string | null, attendance = "REGISTERED") => {
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById",attendance,"updatedAt") values ('${id}','${sessionId}','${student}','${student}','${attendance}',now())`);
  sql(`insert into "MakeupRegistrationSubject"("registrationId","subjectId","subjectTeacherId") values ('${id}','${subject}',${teacher ? `'${teacher}'` : "null"})`);
};

async function toggleModule(p: Page, id: string) {
  await p.goto("/admin/modules");
  await p.waitForSelector(`#module-${id}`);
  await p.waitForTimeout(800);
  await p.click(`#module-${id}`);
  await p.waitForTimeout(2500);
}

test.beforeAll(() => {
  resetDb();
  seedSubjects();
  // Matematika (sm): 2 nadcházející termíny, 1 zrušený, 1 starý; Čeština: 1 nadcházející
  session("f1", "usr_teacher", "3 days", "B12", 5, "sm");
  session("f2", "usr_admin", "4 days", "B13", 2, "sm");
  session("cnc", "usr_teacher", "5 days", "B14", 2, "sm", "cancelled");
  session("pst", "usr_teacher", "-10 days", "B15", 3, "sm");
  session("fcj", "usr_teacher", "6 days", "B16", 3, "scj");
  register("r1", "f1", "usr_stud1", "sm", "usr_teacher");
  register("r2", "f2", "usr_stud2", "sm", null);
  register("r3", "pst", "usr_stud2", "sm", "usr_teacher", "ATTENDED");
});

test("detail předmětu: záložky podle modulů, počty, oprávnění po záložkách", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/subjects/sm");
  await pa.waitForSelector("[data-testid=subject-tabs]");
  check("admin tabs", JSON.stringify(await tabIds(pa)) === JSON.stringify(["overview", "teaching", "seminars.occurrences", "makeup.sessions"]), JSON.stringify(await tabIds(pa)));
  check("overview is default and shows code and grades", (await pa.getByTestId("subject-code").innerText()) === "M" && (await pa.getByTestId("subject-grades").innerText()).includes("všechny ročníky"));

  await pa.locator('[data-tab="teaching"]').click();
  await pa.waitForSelector("[data-testid=teaching-grid]");
  check("teaching tab in URL", pa.url().includes("tab=teaching"));

  await pa.locator('[data-tab="makeup.sessions"]').click();
  await pa.waitForSelector("[data-testid=subject-makeup]");
  const upcoming = pa.getByTestId("subject-makeup-upcoming");
  check("3 upcoming sessions (incl. cancelled)", (await upcoming.getByTestId("subject-makeup-session").count()) === 3);
  const f1 = upcoming.locator('[data-session="f1"]');
  check("counts and registered student for admin", (await f1.innerText()).includes("zapsáno 1/5") && (await f1.innerText()).includes("Student Jan") && (await f1.innerText()).includes("zapsán(a)"), await f1.innerText());
  check("admin sees registrations of someone else's session", (await upcoming.locator('[data-session="f2"]').innerText()).includes("Studentová Eva"));
  check("cancelled marked", (await upcoming.locator('[data-session="cnc"]').innerText()).includes("zrušeno"));
  const recent = pa.getByTestId("subject-makeup-recent");
  check("recent session with attendance", (await recent.locator('[data-session="pst"]').innerText()).includes("dopsal(a)"));

  // semináře: panel výskytů s počty
  await pa.goto("/subjects/subj_prog?tab=seminars.occurrences");
  await pa.waitForSelector("[data-testid=subject-occurrences]");
  check("seminars tab summary", (await pa.getByTestId("subject-occurrences-summary").innerText()).includes("zápisová okna: 1"));
  check("seminars tab shows capacity", (await pa.getByTestId("subject-occurrences").innerText()).includes("1/20"), await pa.getByTestId("subject-occurrences").innerText());

  // učitel: studenty vidí u termínů, které dozoruje, nebo u svých předmětů, ne u cizích termínů
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/subjects/sm?tab=makeup.sessions");
  await pt.waitForSelector("[data-testid=subject-makeup]");
  check("teacher sees own session students", (await pt.locator('[data-session="f1"]').innerText()).includes("Student Jan"));
  check("teacher does not see foreign registration", !(await pt.locator('[data-session="f2"]').innerText()).includes("Studentová Eva") && (await pt.locator('[data-session="f2"]').innerText()).includes("zapsáno 1/2"));
  check("teacher sees student of own subject in past session", (await pt.locator('[data-session="pst"]').innerText()).includes("Studentová Eva"));

  // student: termíny a vlastní zápis, bez jmen a bez záložky Zápisy
  const ps = await login(browser, "jan.student@skola.cz");
  await ps.goto("/subjects/sm");
  await ps.waitForSelector("[data-testid=subject-tabs]");
  check("student tabs", JSON.stringify(await tabIds(ps)) === JSON.stringify(["overview", "teaching", "makeup.sessions"]), JSON.stringify(await tabIds(ps)));
  await ps.goto("/subjects/sm?tab=makeup.sessions");
  await ps.waitForSelector("[data-testid=subject-makeup]");
  check("student sees own registration marker", (await ps.locator('[data-session="f1"]').innerText()).includes("jste zapsán(a)"));
  check("student does not see other students", (await ps.getByTestId("subject-makeup-students").count()) === 0 && !(await ps.getByTestId("subject-makeup").innerText()).includes("Studentová Eva"));
  await ps.goto("/subjects/sm?tab=seminars.occurrences");
  check("student cannot force a foreign tab", (await ps.locator('[data-subject-tab="overview"]').count()) === 1 && (await ps.getByTestId("subject-occurrences").count()) === 0);
});

test("seznam předmětů: štítek s počtem termínů dopisování, filtr podle štítku a hledání", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/subjects");
  await pa.waitForSelector("table");
  const row = (name: string) => pa.locator("table tbody tr", { hasText: name }).first();
  check("Matematika badge counts only upcoming, not cancelled", (await row("Matematika").innerText()).includes("2 termíny dopisování"), await row("Matematika").innerText());
  check("Čeština badge singular", (await row("Čeština").innerText()).includes("1 termín dopisování"));
  check("Fyzika without badge", !(await row("Fyzika").innerText()).includes("dopisování"));

  await pa.getByRole("button", { name: "Filtry" }).click();
  const popover = pa.locator("[data-radix-popper-content-wrapper]");
  await popover.getByRole("combobox").nth(1).selectOption({ label: "S termínem dopisování" });
  let text = await pa.locator("table").innerText();
  check("filter keeps subjects with makeup", text.includes("Matematika") && text.includes("Čeština") && !text.includes("Fyzika") && !text.includes("Programování"), text.slice(0, 300));
  await pa.keyboard.press("Escape");
  await pa.reload();
  await pa.waitForSelector("table");
  await pa.getByPlaceholder(/Hledat/).fill("Učitel");
  text = await pa.locator("table").innerText();
  check("fulltext finds by teacher", text.includes("Matematika") && !text.includes("Fyzika"), text.slice(0, 300));

  const ps = await login(browser, "jan.student@skola.cz");
  await ps.goto("/subjects");
  await ps.waitForSelector("table");
  check("student sees makeup badge too", (await ps.locator("table").innerText()).includes("termíny dopisování"));
});

test("archivace a mazání: dialog ukáže použití, použitý předmět nejde smazat", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/subjects/sm");
  await pa.waitForLoadState("networkidle");
  await pa.getByTestId("subject-archive").click();
  const dialog = pa.getByTestId("subject-lifecycle-dialog");
  const usage = await dialog.getByTestId("subject-usage").innerText();
  check("usage text", usage.includes("Úvazky vyučujících") && usage.includes("Termíny dopisování s tímto předmětem") && usage.includes("Zápisy studentů na dopisování tohoto předmětu"), usage);
  await dialog.getByRole("button", { name: "Zrušit" }).click();
  await dialog.waitFor({ state: "detached" });

  // smazání je zablokované, nabízí se archivace
  await pa.getByTestId("subject-delete").click();
  check("delete blocked, no confirm button", (await dialog.getByText("Předmět nelze smazat").count()) === 1 && (await dialog.getByTestId("subject-confirm").count()) === 0 && (await dialog.getByTestId("subject-usage").count()) === 1);
  await dialog.getByTestId("subject-archive-instead").click();
  await pa.waitForTimeout(2000);
  check("archived instead of deleted", sql(`select "isActive" from "Subject" where id='sm'`) === "f");
  await pa.reload();
  await pa.getByTestId("subject-delete").click();
  check("archived but still used: delete still blocked, no archive offer", (await pa.getByTestId("subject-confirm").count()) === 0 && (await pa.getByTestId("subject-archive-instead").count()) === 0);
  sql(`update "Subject" set "isActive"=true where id='sm'`);

  // nepoužitý předmět: smazání projde, ale server znovu ověří použití
  await pa.goto("/subjects/sf");
  await pa.waitForLoadState("networkidle");
  await pa.getByTestId("subject-delete").click();
  await pa.getByTestId("subject-confirm").waitFor();
  session("late", "usr_teacher", "7 days", "B20", 3, "sf"); // použití vzniklo po otevření stránky
  await pa.getByTestId("subject-confirm").click();
  await pa.waitForTimeout(2000);
  check("server refuses to delete used subject", sql(`select count(*) from "Subject" where id='sf'`) === "1");
  check("error is shown", (await pa.locator("[data-sonner-toast]").allInnerTexts()).join(" ").includes("používá"));
  sql(`delete from "MakeupSession" where id='late'`);
  await pa.reload();
  await pa.waitForLoadState("networkidle");
  await pa.getByTestId("subject-delete").click();
  await pa.getByTestId("subject-confirm").click();
  await pa.waitForURL("**/subjects", { timeout: 15000 });
  check("unused subject deleted", sql(`select count(*) from "Subject" where id='sf'`) === "0");
  check("deletion audited", sql(`select count(*) from "AuditLog" where action='subjects.subject.delete'`) === "1");
});

test("Moje předměty: učitel, student, admin bez stránky, vypnutý modul", async ({ browser }) => {
  const pt = await login(browser, "teacher@skola.cz");
  check("teacher nav has Moje předměty", (await navLabels(pt)).includes("Moje předměty"));
  await pt.goto("/subjects/mine");
  await pt.waitForSelector("[data-testid=my-subjects]");
  const teaching = await pt.getByTestId("my-teaching").innerText();
  check("teacher sees assignments", teaching.includes("Matematika") && teaching.includes("3.A"), teaching);
  const seminars = await pt.locator('[data-section="seminars.teacher"]').innerText();
  check("teacher sees occurrences he teaches", seminars.includes("Programování mikrokontrolérů") && seminars.includes("zapsáno 1/20"), seminars);
  const makeup = await pt.locator('[data-section="makeup.teacher"]').innerText();
  check("teacher sees who registers for his subjects", makeup.includes("Matematika") && makeup.includes("Student Jan") && makeup.includes("Studentová Eva"), makeup);
  const active = await pt.locator("header nav a.bg-accent").allInnerTexts();
  check("only Moje předměty highlighted in nav", JSON.stringify(active.map((s) => s.trim())) === JSON.stringify(["Moje předměty"]), JSON.stringify(active));

  const ps = await login(browser, "jan.student@skola.cz");
  check("student nav has Moje předměty", (await navLabels(ps)).includes("Moje předměty"));
  await ps.goto("/subjects/mine");
  await ps.waitForSelector("[data-testid=my-subjects]");
  const grade = await ps.getByTestId("my-grade-subjects").innerText();
  check("student sees subjects of his grade with teacher", grade.includes("Matematika") && grade.includes("Učitel Petr") && grade.includes("Čeština"), grade);
  check("student sees enrolled seminar", (await ps.getByTestId("my-seminar-enrollments").innerText()).includes("Programování mikrokontrolérů"));
  // zápis ze skrytého okna (nebo okna, ze kterého je student vyloučen) se mu nezobrazí
  const janWindow = sql(
    `select b."enrollmentWindowId" from "StudentEnrollment" e join "SubjectOccurrence" o on o.id=e."subjectOccurrenceId" join "Block" b on b.id=o."blockId" join "Subject" s on s.id=o."subjectId" where e."studentId"='usr_stud1' and e."deletedAt" is null and s.name='Programování mikrokontrolérů' limit 1`
  );
  sql(`update "EnrollmentWindow" set "visibleToStudents"=false where id='${janWindow}'`);
  await ps.reload();
  await ps.waitForSelector("[data-testid=my-subjects]");
  check("hidden window enrollment not shown", !(await ps.locator('[data-section^="seminars."]').innerText()).includes("Programování mikrokontrolérů"));
  sql(`update "EnrollmentWindow" set "visibleToStudents"=true where id='${janWindow}'`);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"userId",key) values ('ex_jan','${janWindow}','EXCLUDE_USER','usr_stud1','EXCLUDE_USER:usr_stud1')`);
  await ps.reload();
  await ps.waitForSelector("[data-testid=my-subjects]");
  check("excluded student does not see enrollment", !(await ps.locator('[data-section^="seminars."]').innerText()).includes("Programování mikrokontrolérů"));
  sql(`delete from "EnrollmentWindowAudience" where id='ex_jan'`);
  const regs = await ps.getByTestId("my-makeup-registrations").innerText();
  check("student sees makeup registration", regs.includes("B12") && regs.includes("Matematika"), regs);

  const pa = await login(browser, "admin@skola.cz");
  check("admin nav without Moje předměty", !(await navLabels(pa)).includes("Moje předměty"));
  await pa.goto("/subjects/mine");
  check("admin /subjects/mine redirected", pa.url().endsWith("/dashboard"), pa.url());

  // vypnuté Dopisování: sekce, záložka i štítek zmizí; data zůstanou a stále blokují smazání
  await toggleModule(pa, "makeup");
  check("makeup disabled", sql(`select value from "SystemSetting" where key='module.makeup.enabled'`) === "false");
  await ps.goto("/subjects/mine");
  await ps.waitForSelector("[data-testid=my-subjects]");
  check("student section of disabled module gone", (await ps.locator('[data-section="makeup.student"]').count()) === 0 && (await ps.locator('[data-section="seminars.student"]').count()) === 1);
  await pa.goto("/subjects/sm");
  await pa.waitForSelector("[data-testid=subject-tabs]");
  check("tab and badge of disabled module gone", JSON.stringify(await tabIds(pa)) === JSON.stringify(["overview", "teaching", "seminars.occurrences"]) && !(await pa.locator("main").innerText()).includes("dopisování"), JSON.stringify(await tabIds(pa)));
  await pa.getByTestId("subject-delete").click();
  check("disabled module's data still blocks delete", (await pa.getByTestId("subject-usage").innerText()).includes("(modul je vypnutý)"));
  await toggleModule(pa, "makeup");
  await pa.goto("/subjects/sm");
  await pa.waitForSelector("[data-testid=subject-tabs]");
  check("makeup tab is back", (await tabIds(pa)).includes("makeup.sessions"));
});

test("formulář termínu dopisování: předměty po ročnících, úvazky nahoře, hledání", async ({ browser }) => {
  sql(`update "Subject" set grades='{3}' where id='scj'`);
  sql(`insert into "Subject"(id,name,code,grades,"updatedAt") values ('sf2','Fyzika 4','FY4','{4}',now())`);

  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/makeup");
  await pt.getByTestId("new-session").click();
  await pt.waitForSelector("#ms-subjects [data-group]");
  const groups = async () => await pt.locator("#ms-subjects [data-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-group")));
  check("groups: teacher's subjects first, then by grade", JSON.stringify(await groups()) === JSON.stringify(["mine", "grades-3", "grades-4", "grades-all"]), JSON.stringify(await groups()));
  const mine = await pt.locator('#ms-subjects [data-group="mine"]').innerText();
  check("mine group holds Matematika from assignments only", mine.includes("Matematika") && !mine.includes("Čeština"), mine);
  check("each subject listed once", (await pt.locator('#ms-subjects [data-subject="M"]').count()) === 1);
  check("Čeština in grade 3 group, Fyzika in grade 4 group", (await pt.locator('#ms-subjects [data-group="grades-3"]').innerText()).includes("Čeština") && (await pt.locator('#ms-subjects [data-group="grades-4"]').innerText()).includes("Fyzika"));

  await pt.fill("#ms-subject-search", "cest");
  check("search ignores diacritics", JSON.stringify(await groups()) === JSON.stringify(["grades-3"]), JSON.stringify(await groups()));
  await pt.fill("#ms-subject-search", "");
  await pt.click('#ms-subjects [data-subject="FY4"]');
  await pt.fill("#ms-subject-search", "cest");
  check("selected subject stays visible while searching", (await pt.locator('#ms-subjects [data-subject="FY4"]').count()) === 1 && (await pt.getByTestId("ms-selected-count").innerText()).includes("1"));
  await pt.keyboard.press("Escape");

  // admin: výběr dozorujícího přepne předměty z úvazků
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/makeup");
  await pa.getByTestId("new-session").click();
  await pa.waitForSelector("#ms-subjects [data-group]");
  check("admin has no assignments, no mine group", (await pa.locator('#ms-subjects [data-group="mine"]').count()) === 0);
  await pa.selectOption("#ms-teacher", { label: "Učitel Petr" });
  check("mine group appears for chosen supervisor", (await pa.locator('#ms-subjects [data-group="mine"]').innerText()).includes("Matematika"));
});
