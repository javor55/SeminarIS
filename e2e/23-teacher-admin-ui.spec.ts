import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login } from "./helpers";

// F13: učitel a admin ve stejném stylu jako student: přehled učitele (termíny se jmény a poznámkami, semináře v zápisu),
// detail termínu na telefonu, průběh zápisu u admina (Chybí dokončit) a administrace se skupinami a „K vyřízení“.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

test.beforeAll(() => {
  resetDb();
  seedSubjects();
  // termín za 2 dny s dvěma studenty (jeden s poznámkou), místnost s předponou „Učebna“
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('t1','usr_teacher',now()+interval '2 days',now()+interval '2 days 1 hour','Učebna 2.04',12,60,'usr_teacher',now())`);
  sql(`insert into "MakeupSessionSubject" values ('t1','sm')`);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId",note,"createdById","updatedAt") values ('tr1','t1','usr_stud1','Písemka z 12. 10. (derivace)','usr_stud1',now())`);
  sql(`insert into "MakeupRegistrationSubject"("registrationId","subjectId","subjectTeacherId") values ('tr1','sm','usr_teacher')`);
});

test("přehled učitele: nejbližší věci, termíny se jmény a poznámkami, semináře s obsazeností", async ({ browser }) => {
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/dashboard");
  await expect(pt.getByTestId("dashboard-highlights")).toBeVisible();
  const hl = await pt.getByTestId("dashboard-highlights").innerText();
  check("highlight: nearest makeup session with note count", hl.includes("dopisování") && hl.includes("1 student") && hl.includes("1 má poznámku"), hl);
  check("highlight: window running", (await pt.locator('[data-highlight^="seminars.window-"]').count()) === 1);
  const card = pt.locator('[data-card="makeup.supervision"]');
  const text = await card.innerText();
  check("card lists student, subject and note", text.includes("Student Jan") && text.includes("Matematika") && text.includes("Písemka z 12. 10. (derivace)"), text);
  check("room is not doubled", text.includes("učebna 2.04") && !/učebna\s+učebna/i.test(text), text);
  check("card has detail link", (await card.getByRole("link", { name: "Detail" }).getAttribute("href")) === "/makeup/sessions/t1");
  check("new session button on the card", (await card.getByTestId("dashboard-new-session").count()) === 1);
  check("seminars card: capacity bar and student list link", (await pt.locator('[data-card="seminars.my-occurrences"] [role=img]').count()) > 0 && (await pt.getByRole("link", { name: "Seznam zapsaných studentů" }).count()) === 1);
  // vše, co bylo na /makeup, tam zůstává
  await pt.goto("/makeup");
  check("makeup page still has own sessions and new session", (await pt.getByTestId("my-sessions").count()) === 1 && (await pt.getByTestId("new-session").count()) === 1);
});

test("detail termínu na telefonu 390×844: přehled, studenti, akce, nic nepřetéká", async ({ browser }) => {
  const pt = await login(browser, "teacher@skola.cz");
  await pt.setViewportSize({ width: 390, height: 844 });
  await pt.goto("/makeup/sessions/t1");
  await expect(pt.getByTestId("session-stats")).toBeVisible();
  check("stats: 1 registered, 11 free, 1 with note", (await pt.getByTestId("session-stat-registered").innerText()).startsWith("1") && (await pt.getByTestId("session-stat-free").innerText()).startsWith("11") && (await pt.getByTestId("session-stat-notes").innerText()).startsWith("1"));
  const card = pt.locator('[data-testid=registrations-cards] [data-student]').first();
  const ct = await card.innerText();
  check("student card: subject, note, attendance, actions", ct.includes("Matematika") && ct.includes("Písemka z 12. 10.") && ct.includes("Přesunout") && ct.includes("Odepsat"), ct);
  check("room is not doubled in header", !/učebna\s+učebna/i.test(await pt.locator("main").innerText()));
  for (const name of ["Upravit", "Zrušit termín", "Tisk"]) {
    const box = await pt.getByRole("button", { name, exact: true }).boundingBox();
    check(`button ${name} inside viewport`, !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  }
  check("no horizontal scroll", await pt.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

test("admin: průběh zápisu (souhrn, Chybí dokončit) a administrace se skupinami", async ({ browser }) => {
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/enrollments/enr_ls_2025");
  await expect(pa.getByTestId("window-progress")).toBeVisible();
  const done = await pa.getByTestId("progress-done").innerText();
  check("summary: done of audience", /0 \/ 2/.test(done), done);
  check("summary: not started / in progress / full tiles", (await pa.getByTestId("progress-not-started").count()) === 1 && (await pa.getByTestId("progress-in-progress").count()) === 1 && (await pa.getByTestId("progress-full").count()) === 1);
  const list = await pa.getByTestId("missing-list").innerText();
  check("missing list: names and class", (await pa.getByTestId("missing-row").count()) === 2 && list.includes("Student Jan") && list.includes("3.A") && list.includes("chybí Blok 2"), list);
  // akce okna zůstávají
  for (const id of ["duplicate-window", "close-window-early"]) check(`window action ${id}`, (await pa.getByTestId(id).count()) === 1);
  // odkaz na celý seznam přepne záložku Nezapsaní (export a připomínka tam zůstaly)
  await pa.getByTestId("missing-open-tab").click();
  await expect(pa.getByTestId("unenrolled-tab")).toBeVisible();
  check("unenrolled tab keeps remind and export", (await pa.getByTestId("unenrolled-remind").count()) === 1 && (await pa.getByTestId("unenrolled-export").count()) === 1);

  await pa.goto("/admin");
  const groups = await pa.getByTestId("admin-nav-group").allInnerTexts();
  check("nav groups", JSON.stringify(groups.map((g) => g.toLowerCase())) === JSON.stringify(["škola", "moduly", "provoz"]), JSON.stringify(groups));
  await expect(pa.getByTestId("admin-todos").getByRole("heading", { name: "K vyřízení" })).toBeVisible();
  const tiles = await pa.getByTestId("admin-tile").evaluateAll((els) => els.map((e) => e.getAttribute("data-tile")));
  check("system tiles", JSON.stringify(tiles) === JSON.stringify(["email", "login", "history", "modules"]), JSON.stringify(tiles));
  check("stats still present", (await pa.getByTestId("admin-stats").count()) === 1);

  // učitel dlaždice nevidí
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/admin");
  check("teacher has no system tiles", (await pt.getByTestId("admin-tile").count()) === 0);
});
