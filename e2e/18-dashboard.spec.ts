import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText, occ } from "./helpers";

// F8: dashboard je přehled s kartami podle role, zapisuje se na stránce Zápisy (/zapisy). Student nikde neuvidí
// skryté okno, koncept ani okno určené jiné třídě (dashboard, seznam Zápisy i detail okna přímým odkazem).
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const WINDOW = "enr_ls_2025";

test("dashboard: karty učitele a admina (průběh zápisu, co udělat, statistiky)", async ({ browser }) => {
  resetDb();
  seedSubjects();

  const pt = await login(browser, "teacher@skola.cz");
  const mine = pt.locator('[data-card="seminars.my-occurrences"]');
  await expect(mine).toBeVisible();
  const text = await mine.innerText();
  check("teacher card lists my occurrence with occupancy", text.includes("Programování mikrokontrolérů") && text.includes("zapsáno 1/20"), text);
  check("teacher card shows how many students are not done", text.includes("nezapsáno 2 studenti"), text);
  check("teacher card links to the window detail", (await mine.getByRole("link", { name: "Zápis LS 2025" }).getAttribute("href")) === `/enrollments/${WINDOW}`);
  check("teacher todos: only items that concern him", (await pt.locator('[data-card="core.todos"] [data-todo^="seminars.unenrolled"]').count()) === 1 && (await pt.locator('[data-todo="core.pending-accounts"]').count()) === 0);
  check("teacher has no student or admin cards", (await pt.locator('[data-card="seminars.windows"], [data-card="seminars.progress"], [data-card="core.stats"]').count()) === 0);

  const pa = await login(browser, "admin@skola.cz");
  const progress = pa.locator('[data-card="seminars.progress"]');
  await expect(progress).toBeVisible();
  const ptext = await progress.innerText();
  check("admin progress card: window with not-done count", ptext.includes("Zápis LS 2025") && ptext.includes("nezapsáno 2") && ptext.includes("Hotovo 0 z 2"), ptext);
  check("admin progress links to the window", (await progress.getByRole("link", { name: "Zápis LS 2025" }).getAttribute("href")) === `/enrollments/${WINDOW}`);
  check("admin todos card links into administration", (await pa.locator('[data-card="core.todos"]').getByRole("link", { name: /Přehled administrace|Všech/ }).getAttribute("href")) === "/admin");
  check("admin stats card", (await pa.locator('[data-card="core.stats"]').innerText()).includes("Otevřené zápisy"));
  check("admin has no student card", (await pa.locator('[data-card="seminars.windows"]').count()) === 0);
  // vypnutí modulu odebere jeho karty i položky v kartě „Co udělat“
  await pa.goto("/admin/modules");
  await pa.waitForSelector("#module-seminars");
  await pa.waitForTimeout(800);
  await pa.click("#module-seminars");
  await pa.waitForTimeout(2500);
  await pa.goto("/dashboard");
  await pa.waitForLoadState("networkidle");
  check("module cards gone when disabled", (await pa.locator('[data-card^="seminars."]').count()) === 0 && (await pa.locator('[data-todo^="seminars."]').count()) === 0);
  await pa.goto("/admin/modules");
  await pa.waitForSelector("#module-seminars");
  await pa.waitForTimeout(800);
  await pa.click("#module-seminars");
  await pa.waitForTimeout(2500);
  check("seminars enabled again", sql(`select value from "SystemSetting" where key='module.seminars.enabled'`) === "true");
});

test("student: karta Zápisy, stránka Zápisy a zápis, skrytá okna se nikde neukážou", async ({ browser }) => {
  resetDb();
  seedSubjects();
  const week = `now() + interval '7 days'`;
  // naplánované okno (vidět), skryté, koncept a okno jen pro 3.B (Jan je ve 3.A)
  sql(`insert into "EnrollmentWindow"(id,name,"startsAt","endsAt",published,"createdById","updatedAt") values ('w_plan','Naplánovaný zápis',now()+interval '3 days',${week},true,'usr_admin',now()),('w_hid','Skrytý zápis',now()-interval '1 hour',${week},false,'usr_admin',now()),('w_draft','Koncept zápisu',now()-interval '1 hour',${week},false,'usr_admin',now()),('w_3b','Zápis jen pro 3.B',now()-interval '1 hour',${week},true,'usr_admin',now())`);
  sql(`insert into "EnrollmentWindowAudience"(id,"windowId",type,"classGroupId",key) select 'aud_3b','w_3b','CLASS',id,'CLASS:'||id from "ClassGroup" where grade=3 and letter='B'`);

  const pj = await login(browser, "jan.student@skola.cz");
  // F12: student po přihlášení přistane na zápisu; přehled s kartami je dál na /dashboard (jen bez odkazu v menu)
  await pj.goto("/dashboard");
  await pj.waitForLoadState("networkidle");
  const card = pj.locator('[data-card="seminars.windows"]');
  await expect(card).toBeVisible();
  const cardText = await card.innerText();
  check("card shows open and upcoming window", cardText.includes("Zápis LS 2025") && cardText.includes("Naplánovaný zápis") && cardText.includes("Otevřeno") && cardText.includes("Naplánováno"), cardText);
  check("card shows what is missing in required blocks", cardText.includes("Chybí zápis v bloku: Blok 2 – volitelné"), cardText);
  check("hidden, draft and foreign-class windows are not on the dashboard", !cardText.includes("Skrytý") && !cardText.includes("Koncept") && !cardText.includes("3.B") && !(await pj.content()).includes("Skrytý zápis"));
  check("open window with an enrollment offers to edit it, upcoming one only to view", (await card.locator('[data-window="enr_ls_2025"] a[data-testid=window-action]').innerText()) === "Upravit zápis" && (await card.locator('[data-window="w_plan"] a[data-testid=window-action]').innerText()) === "Zobrazit");
  check("student has no makeup card without anything to show or with free terms only", (await pj.locator('[data-card="makeup.student"]').count()) === 0);

  // stránka Zápisy: jen jemu viditelná okna, seřazená otevřená → naplánovaná
  await pj.goto("/zapisy");
  await pj.waitForLoadState("networkidle");
  const ids = await pj.getByTestId("student-window").evaluateAll((els) => els.map((e) => e.getAttribute("data-window")));
  check("Zápisy lists exactly the visible windows, open first", JSON.stringify(ids) === JSON.stringify([WINDOW, "w_plan"]), JSON.stringify(ids));
  const list = await pj.locator("main").innerText();
  check("Zápisy shows dates, progress and my enrollments", list.includes("Chybí zápis v bloku") && list.includes("Zapsáno: Programování mikrokontrolérů"), list);
  for (const id of ["w_hid", "w_draft", "w_3b"]) {
    await pj.goto("/zapisy/" + id);
    await pj.waitForLoadState("networkidle");
    const html = await pj.content();
    check(`window ${id} is not reachable by a direct link`, html.includes("Zápis nenalezen") && !html.includes("Skrytý zápis") && !html.includes("Koncept zápisu") && !html.includes("Zápis jen pro 3.B"), id);
  }

  // zápis na detailu okna; karta a seznam pak hlásí hotovo
  await pj.goto("/zapisy/" + WINDOW);
  await pj.waitForLoadState("networkidle");
  await (await occ(pj, "Základy IoT")).getByTestId("enroll-button").click();
  await toastText(pj);
  check("enrolled on the Zápisy detail", sql(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1' and "deletedAt" is null`) === "2");
  await pj.goto("/dashboard");
  await pj.waitForLoadState("networkidle");
  check("card says required blocks are done", (await pj.locator('[data-card="seminars.windows"] [data-window="enr_ls_2025"] [data-testid=window-progress]').getAttribute("data-complete")) === "true");

  // po uzavření vidí své zapsané semináře
  sql(`delete from "EnrollmentWindow" where id in ('w_plan','w_hid','w_draft','w_3b')`);
  sql(`update "EnrollmentWindow" set "startsAt"=now()-interval '3 days', "endsAt"=now()-interval '1 day' where id='${WINDOW}'`);
  await pj.goto("/dashboard");
  await pj.waitForLoadState("networkidle");
  const closed = await pj.getByTestId("dashboard-closed-window").innerText();
  check("closed window shows my enrolled seminars", closed.includes("Programování mikrokontrolérů") && closed.includes("Základy IoT") && closed.includes("Uzavřeno"), closed);

  // host: vidí okno bez omezení publika, jen ke čtení; bez oken žádná karta
  sql(`update "EnrollmentWindow" set "startsAt"=now()-interval '1 hour', "endsAt"=now()+interval '7 days' where id='${WINDOW}'`);
  sql(`update "User" set role='GUEST' where id='usr_stud2'`);
  const pg = await login(browser, "eva.studentova@skola.cz");
  const gcard = await pg.locator('[data-card="seminars.windows"]').innerText();
  check("guest sees the open window read-only", gcard.includes("Zápis LS 2025") && !gcard.includes("Chybí") && !gcard.includes("Zapsat se") && gcard.includes("Zobrazit"), gcard);
  sql(`update "EnrollmentWindow" set published=false where id='${WINDOW}'`);
  await pg.goto("/dashboard");
  await pg.waitForLoadState("networkidle");
  check("hidden window disappears from the guest dashboard", (await pg.locator('[data-card^="seminars."]').count()) === 0 && !(await pg.content()).includes("Zápis LS 2025"));
});
