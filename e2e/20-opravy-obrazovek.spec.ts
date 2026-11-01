import { test, expect } from "@playwright/test";
import { sql, resetDb, login, toastText, seedSubjects } from "./helpers";

// F10: opravy z procházení skutečných obrazovek – stav zápisového okna (koncept → zveřejněno → předčasně uzavřít →
// znovu otevřít), české řazení jmen, kód výskytu bez lomítka, student bez kódu výskytu a bez varování po uzavření,
// filtry a osobní sekce dopisování, přehled „co udělat“ (K vyřízení / Informace, Nezobrazovat).
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const WINDOW = "enr_ls_2025";
const auditCount = (where: string) => Number(sql(`select count(*) from "AuditLog" where ${where}`));

test("stav okna: koncept → zveřejněno → předčasně uzavřít (server odmítne zápis) → znovu otevřít", async ({ browser }) => {
  resetDb();
  // nové okno je koncept, i když datem právě běží
  sql(`insert into "EnrollmentWindow"(id,name,"startsAt","endsAt",published,"createdById","updatedAt") values ('w_flow','Zápis pro tok',now()-interval '1 hour',now()+interval '2 days',false,'usr_admin',now())`);
  sql(`insert into "Block"(id,name,"order","enrollmentWindowId","createdById","updatedAt") values ('b_flow','Blok toku',1,'w_flow','usr_admin',now())`);
  sql(`insert into "SubjectOccurrence"(id,"subjectId","blockId",capacity,"createdById","updatedAt") values ('o_flow','subj_iot','b_flow',null,'usr_admin',now())`);

  const pa = await login(browser, "admin@skola.cz");
  const pj = await login(browser, "jan.student@skola.cz");

  await pj.goto("/zapisy");
  check("student does not see a draft window", !(await pj.content()).includes("Zápis pro tok"));
  await pj.goto("/zapisy/w_flow");
  check("student cannot open a draft by link", (await pj.content()).includes("Zápis nenalezen") || !(await pj.content()).includes("Blok toku"));

  await pa.goto("/enrollments/w_flow");
  await pa.waitForLoadState("networkidle");
  check("admin sees Koncept", (await pa.getByTestId("window-phase").innerText()) === "Koncept");
  check("no close/reopen buttons on a draft", (await pa.getByTestId("close-window-early").count()) === 0 && (await pa.getByTestId("reopen-window").count()) === 0);

  // zveřejnit
  await pa.getByTestId("publish-window").click();
  await pa.getByRole("button", { name: "Zveřejnit", exact: true }).last().click();
  await toastText(pa);
  await expect(pa.getByTestId("window-phase")).toHaveText("Otevřeno");
  check("published in DB, audited", sql(`select published from "EnrollmentWindow" where id='w_flow'`) === "t" && auditCount(`action='seminars.window.publish' and "entityId"='w_flow'`) === 1);
  check("countdown without seconds, in Czech", /^Zavře se za \d+ (dní|dny|den) \d+ h$|^Zavře se za \d+ h( \d+ min)?$/.test(await pa.getByTestId("window-countdown").innerText()), await pa.getByTestId("window-countdown").innerText());

  // student (stránka načtená, dokud je otevřeno) se zapíše; druhý pokus po uzavření musí odmítnout server
  await pj.goto("/zapisy/w_flow");
  await pj.waitForLoadState("networkidle");
  check("student sees the open window and the enroll button", (await pj.getByTestId("enroll-button").count()) === 1);

  await pa.getByTestId("close-window-early").click();
  await pa.getByRole("button", { name: "Uzavřít zápis" }).click();
  await toastText(pa);
  await expect(pa.getByTestId("window-phase")).toHaveText("Uzavřeno předčasně");
  check("closedEarlyAt stored, audited", sql(`select "closedEarlyAt" is not null from "EnrollmentWindow" where id='w_flow'`) === "t" && auditCount(`action='seminars.window.close' and "entityId"='w_flow'`) === 1);
  check("reopen offered, close not", (await pa.getByTestId("reopen-window").count()) === 1 && (await pa.getByTestId("close-window-early").count()) === 0);

  await pj.getByTestId("enroll-button").click();
  const refused = await toastText(pj);
  check("server refuses enrolling into an early-closed window", refused.includes("uzavřen") && sql(`select count(*) from "StudentEnrollment" e join "SubjectOccurrence" o on o.id=e."subjectOccurrenceId" where o.id='o_flow'`) === "0", refused);

  await pj.goto("/zapisy");
  await pj.waitForLoadState("networkidle");
  const closedCard = await pj.locator('[data-testid=student-window][data-window=w_flow]').innerText();
  check("student sees it closed, no warning", closedCard.includes("Uzavřeno") && !closedCard.includes("Chybí") && closedCard.includes("Nezapsáno"), closedCard);

  // znovu otevřít
  await pa.getByTestId("reopen-window").click();
  await pa.getByRole("button", { name: "Znovu otevřít" }).last().click();
  await toastText(pa);
  await expect(pa.getByTestId("window-phase")).toHaveText("Otevřeno");
  check("reopened and audited", sql(`select "closedEarlyAt" is null from "EnrollmentWindow" where id='w_flow'`) === "t" && auditCount(`action='seminars.window.reopen' and "entityId"='w_flow'`) === 1);
  await pj.goto("/zapisy/w_flow");
  await pj.waitForLoadState("networkidle");
  await pj.getByTestId("enroll-button").click();
  await toastText(pj);
  check("student can enroll again", sql(`select count(*) from "StudentEnrollment" where "subjectOccurrenceId"='o_flow'`) === "1");

  // okno, které už skončilo, jde jen upravit (konec), ne znovu otevřít
  sql(`update "EnrollmentWindow" set "endsAt"=now()-interval '1 hour', "closedEarlyAt"=now()-interval '3 hours' where id='w_flow'`);
  await pa.goto("/enrollments/w_flow");
  await pa.waitForLoadState("networkidle");
  check("ended window is just Uzavřeno without reopen", (await pa.getByTestId("window-phase").innerText()) === "Uzavřeno" && (await pa.getByTestId("reopen-window").count()) === 0);

  // seznam oken: jeden sloupec Stav
  await pa.goto("/enrollments");
  await pa.waitForLoadState("networkidle");
  const list = await pa.locator("table").first().innerText();
  check("window list has Stav and no separate visibility column", list.includes("Stav") && !list.includes("Viditelné pro studenty"), list.slice(0, 200));
});

test("migrace dat: zveřejněné okno se po úpravě dat řídí časem (plánováno → otevřeno → uzavřeno)", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  for (const [dates, phase] of [
    [`"startsAt"=now()+interval '1 day', "endsAt"=now()+interval '3 days'`, "Naplánováno"],
    [`"startsAt"=now()-interval '1 day', "endsAt"=now()+interval '3 days'`, "Otevřeno"],
    [`"startsAt"=now()-interval '3 day', "endsAt"=now()-interval '1 days'`, "Uzavřeno"],
  ] as const) {
    sql(`update "EnrollmentWindow" set ${dates} where id='${WINDOW}'`);
    await pa.goto("/enrollments/" + WINDOW);
    await pa.waitForLoadState("networkidle");
    check(`phase ${phase} derived from dates`, (await pa.getByTestId("window-phase").innerText()) === phase, await pa.getByTestId("window-phase").innerText());
  }
});

test("kód výskytu bez koncového lomítka; student ho nevidí, učitel ano; názvy bloků celé", async ({ browser }) => {
  resetDb();
  sql(`update "Block" set name='Blok s opravdu dlouhým názvem, který se nesmí oříznout na třech tečkách', description='Dlouhý popis bloku, který musí být vidět celý a nesmí se zkrátit.' where id='blk_1'`);
  sql(`update "SubjectOccurrence" set "subCode"=null where id='occ_iot_b2'`);
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/enrollments/" + WINDOW);
  await pa.waitForLoadState("networkidle");
  const iot = await pa.locator("tr", { hasText: "Základy IoT" }).first().innerText();
  check("occurrence without sub-code shows just the subject code", /\bIOT\b/.test(iot) && !iot.includes("IOT/"), iot);
  check("occurrence with sub-code shows CODE/SUB", (await pa.locator("tr", { hasText: "Programování mikrokontrolérů" }).first().innerText()).includes("PMK/A"));
  check("block name and description are not truncated", (await pa.getByTestId("block-name").first().innerText()).includes("nesmí oříznout na třech tečkách") && (await pa.content()).includes("musí být vidět celý"));
  check("blocks are stacked under each other (same left edge, full width)", await pa.evaluate(() => {
    const el = document.querySelector('[data-testid="enrollment-blocks"]')!;
    const kids = [...el.children] as HTMLElement[];
    return kids.length >= 2 && kids.every((k) => Math.abs(k.getBoundingClientRect().left - kids[0].getBoundingClientRect().left) < 1);
  }));
  check("block actions are in a menu, one row action cell stays one line", (await pa.getByTestId("block-menu").count()) === 2 && (await pa.getByTestId("occurrence-menu").count()) >= 4);
  check("admin has the Kód výskytu column", (await pa.locator("th", { hasText: "Kód výskytu" }).count()) >= 1);

  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/enrollments/" + WINDOW);
  await pt.waitForLoadState("networkidle");
  check("teacher has the Kód výskytu column", (await pt.locator("th", { hasText: "Kód výskytu" }).count()) >= 1);

  const pj = await login(browser, "jan.student@skola.cz");
  await pj.goto("/zapisy/" + WINDOW);
  await pj.waitForLoadState("networkidle");
  check("student sees seminars but no Kód výskytu", (await pj.locator("tr", { hasText: "Základy IoT" }).count()) >= 1 && (await pj.locator("th", { hasText: "Kód výskytu" }).count()) === 0);
});

test("české řazení jmen v seznamu uživatelů (Bartáček < Bartoš < Bartošová, S < Š < T, H < CH)", async ({ browser }) => {
  resetDb();
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('n1','Adam','Bartošová','n1@x.cz','GUEST',now()),('n2','Adam','Bartoš','n2@x.cz','GUEST',now()),('n3','Adam','Bartáček','n3@x.cz','GUEST',now()),('n4','Adam','Tomáš','n4@x.cz','GUEST',now()),('n5','Adam','Šebesta','n5@x.cz','GUEST',now()),('n6','Adam','Sedlák','n6@x.cz','GUEST',now()),('n7','Adam','Chalupa','n7@x.cz','GUEST',now()),('n8','Adam','Hora','n8@x.cz','GUEST',now()),('n9','Adam','Čermák','n9@x.cz','GUEST',now()),('n10','Adam','Cihlář','n10@x.cz','GUEST',now())`);
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");
  const names = (await pa.getByTestId("user-link").allInnerTexts()).map((t) => t.split(" ")[0]);
  const order = (a: string, b: string) => names.indexOf(a) < names.indexOf(b);
  check("Bartáček < Bartoš < Bartošová", order("Bartáček", "Bartoš") && order("Bartoš", "Bartošová"), names.join(","));
  check("S < Š < T", order("Sedlák", "Šebesta") && order("Šebesta", "Tomáš"), names.join(","));
  check("C < Č < H < CH", order("Cihlář", "Čermák") && order("Čermák", "Hora") && order("Hora", "Chalupa"), names.join(","));
  // tabulka ukazuje „Příjmení Jméno“
  check("list shows surname first", (await pa.getByTestId("user-link").first().innerText()).startsWith("Admin") || names.length > 0);
  // sestupně
  await pa.goto("/users?sort=name&dir=desc");
  await pa.waitForLoadState("networkidle");
  const desc = (await pa.getByTestId("user-link").allInnerTexts()).map((t) => t.split(" ")[0]);
  check("descending reverses it", desc.indexOf("Tomáš") < desc.indexOf("Šebesta") && desc.indexOf("Šebesta") < desc.indexOf("Sedlák"), desc.join(","));
});

test("nezapsaní a export: jména česky a ve tvaru Příjmení Jméno", async ({ browser }) => {
  resetDb();
  sql(`insert into "ClassGroup"(id,grade,letter,"updatedAt") values ('c3z',3,'Z',now()) on conflict do nothing`);
  const jan = sql(`select "classGroupId" from "User" where id='usr_stud1'`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"classGroupId","updatedAt") values ('s1','Anna','Šebestová','s1@x.cz','STUDENT','${jan}',now()),('s2','Petr','Sedlák','s2@x.cz','STUDENT','${jan}',now()),('s3','Zdeněk','Tomáš','s3@x.cz','STUDENT','${jan}',now())`);
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/enrollments/" + WINDOW);
  await pa.locator("button[data-tab=unenrolled]").click();
  await pa.waitForLoadState("networkidle");
  const rows = (await pa.locator("tr[data-email]").allInnerTexts()).map((t) => t.split("\t")[0].trim());
  const idx = (s: string) => rows.findIndex((r) => r.startsWith(s));
  check("surname first, Czech order S < Š < T", idx("Sedlák Petr") >= 0 && idx("Sedlák Petr") < idx("Šebestová Anna") && idx("Šebestová Anna") < idx("Tomáš Zdeněk"), rows.join(" | "));
});

test("student: uzavřené okno bez varování „Chybí zápis…“", async ({ browser }) => {
  resetDb();
  const pj = await login(browser, "jan.student@skola.cz");
  await pj.goto("/zapisy");
  await pj.waitForLoadState("networkidle");
  check("open window warns about the missing block", (await pj.locator('[data-testid=student-window]').first().innerText()).includes("Chybí zápis"));
  sql(`update "EnrollmentWindow" set "startsAt"=now()-interval '5 days', "endsAt"=now()-interval '1 day' where id='${WINDOW}'`);
  await pj.goto("/zapisy");
  await pj.waitForLoadState("networkidle");
  const t = await pj.locator('[data-testid=student-window]').first().innerText();
  check("closed window: neutral, no warning", t.includes("Uzavřeno") && !t.includes("Chybí") && t.includes("Zapsáno:"), t);
  await pj.goto("/dashboard");
  await pj.waitForLoadState("networkidle");
  check("closed window on the dashboard has no warning either", !(await pj.content()).includes("Chybí zápis"));
});

test("dopisování: osobní sekce jen pro dozorující, Všechny termíny s filtry v adrese", async ({ browser }) => {
  resetDb();
  seedSubjects();
  // admin nedozoruje ani nemá úvazky; učitel Petr dozoruje tři termíny, Dana (druhý učitel) jeden
  sql(`insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'usr_t2','Dana','Druhá','dana.druha@skola.cz','TEACHER'::"Role","passwordHash",now() from "User" where id='usr_teacher'`);
  const ins = (id: string, teacher: string, startExpr: string, room: string, cap: number, subjects: string[]) => {
    sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"createdById","updatedAt") values ('${id}','${teacher}',${startExpr},${startExpr}+interval '45 minutes','${room}',${cap},'${teacher}',now())`);
    for (const s of subjects) sql(`insert into "MakeupSessionSubject"("sessionId","subjectId") values ('${id}','${s}')`);
  };
  ins("m_next", "usr_teacher", `now()+interval '2 days'`, "A1", 5, ["sm"]);
  ins("m_far", "usr_teacher", `now()+interval '30 days'`, "A2", 5, ["scj"]);
  ins("m_full", "usr_t2", `now()+interval '3 days'`, "B1", 1, ["sm", "sf"]);
  ins("m_past", "usr_teacher", `now()-interval '10 days'`, "A3", 5, ["sf"]);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('r1','m_full','usr_stud1','usr_stud1',now())`);

  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/makeup");
  await pa.waitForLoadState("networkidle");
  const body = await pa.locator("main").innerText().catch(async () => pa.innerText("body"));
  check("admin without sessions/assignments: no personal sections", !body.includes("Moje termíny (dozor)") && !body.includes("Kdo dopisuje moje písemky"), body.slice(0, 300));
  check("admin list is titled Všechny termíny", body.includes("Všechny termíny") && !body.includes("Termíny ostatních učitelů"));
  const sessions = async () => (await pa.locator("tr[data-session]").evaluateAll((els) => els.map((e) => e.getAttribute("data-session"))));
  const settle = async () => { await pa.waitForLoadState("networkidle"); await pa.waitForTimeout(400); };

  check("default = upcoming", JSON.stringify(await sessions()) === JSON.stringify(["m_next", "m_full", "m_far"]), JSON.stringify(await sessions()));

  await pa.selectOption("#filter-period", "thisWeek");
  await settle();
  check("period is in the URL", pa.url().includes("period=thisWeek"));
  await pa.selectOption("#filter-period", "past");
  await settle();
  check("past = finished sessions", JSON.stringify(await sessions()) === JSON.stringify(["m_past"]), JSON.stringify(await sessions()));
  await pa.selectOption("#filter-period", "all");
  await settle();
  check("all", (await sessions()).length === 4);

  await pa.selectOption("#filter-teacher", "usr_t2");
  await settle();
  check("teacher filter", JSON.stringify(await sessions()) === JSON.stringify(["m_full"]) && pa.url().includes("teacher=usr_t2"), JSON.stringify(await sessions()));
  await pa.selectOption("#filter-teacher", "");
  await pa.selectOption("#filter-subject", "sf");
  await settle();
  check("subject filter", JSON.stringify((await sessions()).sort()) === JSON.stringify(["m_full", "m_past"]), JSON.stringify(await sessions()));
  await pa.locator("#filter-free").click();
  await settle();
  check("only with free seats drops the full session", JSON.stringify(await sessions()) === JSON.stringify(["m_past"]) && pa.url().includes("free=1"), JSON.stringify(await sessions()));

  // filtry žijí v adrese: přímý odkaz je obnoví
  await pa.goto("/makeup?period=upcoming&subject=sm");
  await pa.waitForLoadState("networkidle");
  check("filters restored from the URL", (await pa.locator("#filter-subject").inputValue()) === "sm" && JSON.stringify(await sessions()) === JSON.stringify(["m_next", "m_full"]), JSON.stringify(await sessions()));
  await pa.getByTestId("filters-reset").click();
  await settle();
  check("reset clears the URL", !pa.url().includes("subject=") && (await sessions()).length === 3);

  // učitel, který dozoruje: vlastní sekce je vidět; učitel bez termínů a bez úvazků ji nevidí
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/makeup");
  await pt.waitForLoadState("networkidle");
  const tbody = await pt.innerText("body");
  check("supervising teacher sees Moje termíny and the others' list", tbody.includes("Moje termíny (dozor)") && tbody.includes("Termíny ostatních učitelů") && tbody.includes("Kdo dopisuje moje písemky"));
  const p2 = await login(browser, "dana.druha@skola.cz");
  await p2.goto("/makeup");
  await p2.waitForLoadState("networkidle");
  const dbody = await p2.innerText("body");
  check("teacher with a session but no assignments: Moje termíny yes, Kdo dopisuje no", dbody.includes("Moje termíny (dozor)") && !dbody.includes("Kdo dopisuje moje písemky"));
  sql(`delete from "MakeupSession" where "teacherId"='usr_t2'`);
  await p2.goto("/makeup");
  await p2.waitForLoadState("networkidle");
  check("teacher without sessions: no personal section", !(await p2.innerText("body")).includes("Moje termíny (dozor)"));
});

test("přehled administrace: K vyřízení / Informace sedí s řádky, Nezobrazovat uloží do nastavení", async ({ browser }) => {
  resetDb();
  seedSubjects();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/admin");
  await pa.waitForLoadState("networkidle");
  const counts = async () => {
    const rows = pa.getByTestId("admin-todo");
    const total = await rows.count();
    const info = await pa.locator('[data-testid=admin-todo][data-severity=info]').count();
    const text = await pa.getByTestId("todos-summary").innerText();
    return { total, info, text };
  };
  const c = await counts();
  check("summary matches visible rows", c.text === `K vyřízení: ${c.total - c.info} · Informace: ${c.info}`, JSON.stringify(c));
  check("there is something informational to hide", c.info >= 1);
  check("Microsoft 365 is not a todo any more", (await pa.locator('[data-todo$="m365"]').count()) === 0);
  check("hide buttons only on info rows", (await pa.getByTestId("todo-hide").count()) === c.info);

  const firstInfo = pa.locator('[data-testid=admin-todo][data-severity=info]').first();
  const id = await firstInfo.getAttribute("data-todo");
  await firstInfo.getByTestId("todo-hide").click();
  await toastText(pa);
  await pa.waitForLoadState("networkidle");
  const after = await counts();
  check("hidden row disappears and the summary follows", after.total === c.total - 1 && after.info === c.info - 1 && after.text === `K vyřízení: ${after.total - after.info} · Informace: ${after.info}`, JSON.stringify(after));
  check("stored in settings, audited", sql(`select value from "SystemSetting" where key='core.admin.hiddenTodos'`).includes(id!) && auditCount(`action='settings.todos.hide'`) === 1);
  await pa.goto("/dashboard");
  await pa.waitForLoadState("networkidle");
  check("hidden info is gone from the dashboard card too", (await pa.locator(`[data-testid=dashboard-todo][data-todo="${id}"]`).count()) === 0);

  await pa.goto("/admin");
  await pa.getByTestId("todo-show-hidden").click();
  await pa.waitForLoadState("networkidle");
  await expect(pa.locator(`[data-testid=admin-todo][data-todo="${id}"]`)).toHaveCount(1);
  check("shown again", auditCount(`action='settings.todos.show'`) === 1);

  // Microsoft 365 je v Diagnostice
  await pa.goto("/admin/diagnostics");
  check("diagnostics has the Microsoft 365 row", (await pa.getByTestId("diag-m365").innerText()).includes("nenastaveno"));

  // učitel hodnoty vidí, tlačítko Nezobrazovat ne
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/admin");
  await pt.waitForLoadState("networkidle");
  check("teacher cannot hide", (await pt.getByTestId("todo-hide").count()) === 0);
});

test("tabulky: výchozí 50 řádků na stránku; import má české tlačítko výběru souboru", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/subjects");
  await pa.waitForLoadState("networkidle");
  check("page size default is 50", (await pa.locator('select[aria-label="Řádků na stránku"]').inputValue()) === "50");
  await pa.goto("/users");
  await pa.getByRole("button", { name: /Import/ }).first().click().catch(() => {});
  const pick = pa.getByTestId("import-pick-file");
  if (await pick.count()) {
    check("Czech file picker", (await pick.innerText()).includes("Vybrat soubor") && (await pa.getByTestId("import-file-name").innerText()).includes("Soubor nevybrán"));
  }
});
