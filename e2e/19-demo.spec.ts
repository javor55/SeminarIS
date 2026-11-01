import { test, expect, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText } from "./helpers";

// F9: ukázková data pro prezentaci (Administrace → Ukázková data). Naplnit → počty a stránky → smazat →
// zůstanou jen původní data; skutečné záznamy nezávislé na ukázkových se neztratí; druhé naplnění je zablokované;
// učitel sekci nevidí; e-mailová vrstva přeskakuje adresy na .invalid.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const TABLES = ["User", "ClassGroup", "ClassMembership", "Subject", "TeachingAssignment", "EnrollmentWindow", "Block", "SubjectOccurrence", "StudentEnrollment", "MakeupSession", "MakeupRegistration", "SchoolYear", "DemoRecord"];
const snapshot = () => Object.fromEntries(TABLES.map((t) => [t, Number(sql(`select count(*) from "${t}"`))]));
const demoUsers = (role: string) => Number(sql(`select count(*) from "User" where role='${role}' and email like '%@ukazka.invalid'`));

async function openDemo(page: Page) {
  await page.goto("/admin/demo");
  await page.waitForSelector('[data-testid="demo-status"]');
}

async function confirmDialog(page: Page, open: string, word: string) {
  await page.click(`[data-testid="${open}"]`);
  await page.fill('[data-testid="demo-confirm"]', word);
  await page.click('[data-testid="demo-confirm-submit"]');
}

test("ukázková data: naplnit, stránky rolí, smazat jen vlastní, znovu naplnit stejně", async ({ browser }) => {
  resetDb();
  seedSubjects();
  const baseline = snapshot();

  const pa = await login(browser, "admin@skola.cz");
  await openDemo(pa);
  check("initially no demo data", (await pa.locator('[data-testid="demo-state"]').innerText()).includes("nejsou"));
  check("clear disabled without data", await pa.locator('[data-testid="demo-clear-open"]').isDisabled());
  check("no password before seeding", (await pa.locator('[data-testid="demo-password"]').count()) === 0);

  // potvrzení vyžaduje slovo
  await pa.click('[data-testid="demo-seed-open"]');
  await pa.fill('[data-testid="demo-confirm"]', "něco jiného");
  check("seed confirm needs the word", await pa.locator('[data-testid="demo-confirm-submit"]').isDisabled());
  await pa.fill('[data-testid="demo-confirm"]', "UKÁZKA");
  const t0 = Date.now();
  await pa.click('[data-testid="demo-confirm-submit"]');
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("jsou v systému", { timeout: 55_000 });
  const seedMs = Date.now() - t0;
  console.log(`naplnění ukázkových dat trvalo ${seedMs} ms`);
  check("seed is fast enough", seedMs < 30_000, String(seedMs));

  // počty
  check("240 demo students", demoUsers("STUDENT") === 240, String(demoUsers("STUDENT")));
  check("15 demo teachers", demoUsers("TEACHER") === 15);
  check("4 demo guests with requested class", demoUsers("GUEST") === 4 && sql(`select count(*) from "User" where role='GUEST' and "requestedClassGroupId" is not null`) === "4");
  check("12 classes 1.A-4.C (10 new)", sql(`select count(*) from "ClassGroup"`) === "12" && sql(`select count(*) from "DemoRecord" where model='ClassGroup'`) === "10");
  check("every student has class and membership", sql(`select count(*) from "User" where role='STUDENT' and email like '%@ukazka.invalid' and "classGroupId" is not null`) === "240" && sql(`select count(*) from "ClassMembership" m join "User" u on u.id=m."userId" where u.email like '%@ukazka.invalid'`) === "240");
  check("20 students per demo class", sql(`select count(*) from (select "classGroupId" from "User" where email like '%@ukazka.invalid' and role='STUDENT' group by 1 having count(*)=20) x`) === "12");
  check("subjects with grades (compulsory and 4th grade seminars)", Number(sql(`select count(*) from "Subject" where id like 'demo-subj-%'`)) === 22 && Number(sql(`select count(*) from "Subject" where id like 'demo-subj-%' and grades=ARRAY[4]`)) === 9);
  check("teaching assignments by grade", Number(sql(`select count(*) from "TeachingAssignment" where id like 'demo-ta-%'`)) > 100);
  check("two windows, open one for grade 4", sql(`select count(*) from "EnrollmentWindow" where id like 'demo-win-%'`) === "2" && sql(`select published and "startsAt" < now() and "endsAt" > now() from "EnrollmentWindow" where id='demo-win-open'`) === "t" && sql(`select grade from "EnrollmentWindowAudience" where "windowId"='demo-win-open'`) === "4" && sql(`select published and "endsAt" < now() from "EnrollmentWindow" where id='demo-win-closed'`) === "t");
  check("blocks and occurrences", sql(`select count(*) from "Block" where id like 'demo-win-%'`) === "4" && sql(`select count(*) from "SubjectOccurrence" where id like 'demo-win-%'`) === "13");
  const enrolled = Number(sql(`select count(distinct "studentId") from "StudentEnrollment" e join "SubjectOccurrence" o on o.id=e."subjectOccurrenceId" join "Block" b on b.id=o."blockId" where b."enrollmentWindowId"='demo-win-open'`));
  check("part of 4th graders enrolled, some not", enrolled > 30 && enrolled < 60, String(enrolled));
  check("no occurrence over capacity", sql(`select count(*) from (select o.id from "SubjectOccurrence" o join "StudentEnrollment" e on e."subjectOccurrenceId"=o.id where o.capacity is not null group by o.id, o.capacity having count(*)>o.capacity) x`) === "0");
  check("makeup sessions in the next two weeks plus one past with attendance", sql(`select count(*) from "MakeupSession" where id like 'demo-ms-%'`) === "11" && sql(`select count(*) from "MakeupSession" where id like 'demo-ms-%' and "startsAt" > now() and "startsAt" < now() + interval '17 days'`) === "10" && sql(`select count(*) from "MakeupSession" where id like 'demo-ms-%' and "endsAt" < now()`) === "1");
  check("past session has attendance", Number(sql(`select count(*) from "MakeupRegistration" r join "MakeupSession" s on s.id=r."sessionId" where s."endsAt" < now() and r.id like 'demo-mr-%' and r.attendance in ('ATTENDED','NO_SHOW')`)) >= 5);
  check("registrations with notes", Number(sql(`select count(*) from "MakeupRegistration" where id like 'demo-mr-%' and note is not null`)) > 5);
  check("evidence covers all created records", sql(`select count(*) from "DemoRecord" where model='User'`) === "259" && sql(`select count(*) from "DemoRecord" where model='StudentEnrollment'`) === sql(`select count(*) from "StudentEnrollment" where id like 'demo-enr-%'`));
  check("no e-mails during seeding", sql(`select count(*) from "EmailLog"`) === "0");
  check("audit entry", sql(`select count(*) from "AuditLog" where action='system.demo.seed'`) === "1");

  // sekce ukazuje počty
  await openDemo(pa);
  check("UI counts students", (await pa.locator('[data-testid="demo-count-User.STUDENT"]').innerText()).includes("240"));
  check("UI counts guests", (await pa.locator('[data-testid="demo-count-User.GUEST"]').innerText()).includes("4"));
  check("UI lists module records", (await pa.locator('[data-testid="demo-count-MakeupSession"]').innerText()).includes("11"));

  // druhé naplnění je zablokované (tlačítko i server)
  check("seed button disabled while data exist", await pa.locator('[data-testid="demo-seed-open"]').isDisabled());
  const emailsFirst = sql(`select string_agg(email, ',' order by id) from "User" where email like '%@ukazka.invalid'`);

  // náhodné heslo: zobrazené adminovi, uložené jen v nastavení, není v kódu
  const PASSWORD = (await pa.locator('[data-testid="demo-password"]').innerText()).trim();
  check("random password shown", /^Ukazka-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(PASSWORD), PASSWORD);
  check("password stored in settings", sql(`select value from "SystemSetting" where key='demo.password'`) === PASSWORD);

  // účty pro „Zobrazit jako“
  const studentEmail = (await pa.locator('[data-testid="demo-account"][data-role="STUDENT"]').first().getAttribute("data-email")) as string;
  const teacherEmail = (await pa.locator('[data-testid="demo-account"][data-role="TEACHER"]').first().getAttribute("data-email")) as string;
  check("accounts offered for impersonation", !!studentEmail && !!teacherEmail && (await pa.locator('[data-testid="demo-account"][data-role="GUEST"]').count()) === 1);

  // dashboard a stránky studenta 4. ročníku (přihlášení společným heslem)
  const ps = await login(browser, studentEmail, PASSWORD);
  await expect(ps.locator('[data-card="seminars.windows"]')).toBeVisible();
  check("student card shows the open window", (await ps.locator('[data-card="seminars.windows"]').innerText()).includes("Zápis volitelných seminářů – 4. ročník"));
  await ps.goto("/zapisy");
  await ps.waitForLoadState("networkidle");
  check("student sees window on Zápisy", (await ps.locator("main").innerText()).includes("Zápis volitelných seminářů – 4. ročník"));
  await ps.goto("/zapisy/demo-win-open");
  await ps.waitForLoadState("networkidle");
  check("student sees blocks and seminars", (await ps.locator("main").innerText()).includes("Seminář z fyziky") && (await ps.locator("main").innerText()).includes("Blok B"));
  await ps.goto("/makeup");
  await ps.waitForLoadState("networkidle");
  check("student sees makeup sessions", (await ps.locator("main").innerText()).includes("Učebna"));

  // učitel
  const pt = await login(browser, teacherEmail, PASSWORD);
  await expect(pt.locator('[data-card="seminars.my-occurrences"]')).toBeVisible();
  check("teacher sees own seminar", (await pt.locator('[data-card="seminars.my-occurrences"]').innerText()).includes("Seminář z matematiky"));
  await pt.goto("/admin/demo");
  await pt.waitForLoadState("networkidle");
  check("teacher cannot open demo section", !(await pt.url()).endsWith("/admin/demo") || (await pt.locator('[data-testid="demo-status"]').count()) === 0);
  await pt.goto("/admin");
  await pt.waitForLoadState("networkidle");
  check("teacher does not see demo section in menu", !(await pt.locator("body").innerText()).includes("Ukázková data"));

  // admin: zápisy, dopisování, ke schválení
  await pa.goto("/enrollments");
  await pa.waitForLoadState("networkidle");
  check("admin sees both windows", (await pa.locator("main").innerText()).includes("1. kolo") && (await pa.locator("main").innerText()).includes("4. ročník"));
  await pa.goto("/dashboard");
  await pa.waitForSelector('[data-card="core.todos"]');
  check("admin todo: pending accounts 4", (await pa.locator('[data-todo="core.pending-accounts"]').innerText()).includes("4"));
  await pa.goto("/makeup");
  await pa.waitForLoadState("networkidle");
  check("admin sees makeup sessions", (await pa.locator("main").innerText()).includes("Fyzikální laboratoř"));

  // schválení ukázkového hosta: e-mailová vrstva adresu .invalid přeskočí a zapíše do logu
  await pa.goto("/users?tab=approvals");
  await pa.waitForSelector('[data-testid="approvals-table"]');
  const guestEmail = sql(`select email from "User" where role='GUEST' order by id limit 1`);
  await pa.locator(`tr[data-user="${guestEmail}"] [data-testid=approve]`).click();
  await pa.waitForTimeout(2500);
  check("guest approved", sql(`select role from "User" where email='${guestEmail}'`) === "STUDENT");
  const logged = sql(`select status||'|'||recipient||'|'||coalesce(error,'') from "EmailLog" where recipient='${guestEmail}'`);
  check("e-mail to .invalid skipped and logged", logged.startsWith(`SKIPPED_DISABLED|${guestEmail}|`) && logged.includes(".invalid"), logged);
  check("nothing sent to .invalid", sql(`select count(*) from "EmailLog" where recipient like '%.invalid' and status='SENT'`) === "0");

  // skutečné záznamy vytvořené nad ukázkovými daty
  const cls3A = sql(`select id from "ClassGroup" where grade=3 and letter='A'`);
  const occ = sql(`select id from "SubjectOccurrence" where id like 'demo-win-open-blk-1-occ-%' order by id limit 1`);
  sql(`insert into "StudentEnrollment"(id,"studentId","subjectOccurrenceId","createdById","updatedAt") values ('real_enr','usr_stud2','${occ}','usr_stud2',now())`);
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"createdById","updatedAt") values ('real_ms','usr_teacher',now()+interval '3 days',now()+interval '3 days 1 hour','Skutečná učebna',5,'usr_teacher',now()),('real_ms_demo','demo-teacher-06',now()+interval '4 days',now()+interval '4 days 1 hour','Kabinet',5,'demo-teacher-06',now())`);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('real_mr','real_ms','usr_stud1','usr_stud1',now())`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"requestedClassGroupId","updatedAt") values ('real_guest','Skutečný','Host','host@skola.cz','GUEST',(select id from "ClassGroup" where id='demo-class-4C'),now())`);
  sql(`insert into "TeachingAssignment"(id,"teacherId","subjectId","classGroupId","schoolYearId") select 'real_ta','usr_teacher','demo-subj-mat',c.id,y.id from "ClassGroup" c, "SchoolYear" y where c.id='${cls3A}' and y."isCurrent"`);

  // smazání
  await openDemo(pa);
  const tClear = Date.now();
  await confirmDialog(pa, "demo-clear-open", "SMAZAT");
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("nejsou", { timeout: 55_000 });
  console.log(`smazání ukázkových dat trvalo ${Date.now() - tClear} ms`);
  check("evidence empty", sql(`select count(*) from "DemoRecord"`) === "0");
  const after = snapshot();
  // původní data + skutečné záznamy, které na ukázkových nezávisejí (real_ms, real_ms_demo po převzetí adminem, real_mr, real_guest, +1 schválený host je z ukázkových dat, tedy smazán)
  check("only original data left", JSON.stringify(after) === JSON.stringify({ ...baseline, User: baseline.User + 1, MakeupSession: baseline.MakeupSession + 2, MakeupRegistration: baseline.MakeupRegistration + 1 }), JSON.stringify({ baseline, after }));
  check("real session of demo teacher taken over by admin", sql(`select "teacherId" from "MakeupSession" where id='real_ms_demo'`) === "usr_admin");
  check("real enrollment in demo window removed by cascade", sql(`select count(*) from "StudentEnrollment" where id='real_enr'`) === "0");
  check("real teaching assignment on demo subject removed by cascade", sql(`select count(*) from "TeachingAssignment" where id='real_ta'`) === "0");
  check("real guest survived without requested class", sql(`select coalesce("requestedClassGroupId",'-') from "User" where id='real_guest'`) === "-");
  check("original seed users and classes intact", sql(`select count(*) from "User" where email in ('admin@skola.cz','teacher@skola.cz','jan.student@skola.cz','eva.studentova@skola.cz')`) === "4" && sql(`select count(*) from "ClassGroup"`) === "2");
  check("audit entry for clear", sql(`select count(*) from "AuditLog" where action='system.demo.clear'`) === "1");
  check("demo password removed on clear", sql(`select count(*) from "SystemSetting" where key='demo.password'`) === "0");

  // znovu naplnit: stejná data (deterministický generátor)
  await openDemo(pa);
  await confirmDialog(pa, "demo-seed-open", "ukázka");
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("jsou v systému", { timeout: 55_000 });
  check("second seeding gives identical accounts", sql(`select string_agg(email, ',' order by id) from "User" where email like '%@ukazka.invalid'`) === emailsFirst);
  // admin se po uzavření dialogu zbavuje dat tlačítkem, tady stačí uklidit
  await openDemo(pa);
  await confirmDialog(pa, "demo-clear-open", "smazat");
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("nejsou", { timeout: 55_000 });
  check("clean again", sql(`select count(*) from "User" where email like '%@ukazka.invalid'`) === "0");
});

test("ukázková data: třída se skutečným studentem se nesmaže", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await openDemo(pa);
  await confirmDialog(pa, "demo-seed-open", "UKÁZKA");
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("jsou v systému", { timeout: 55_000 });

  // skutečný student přeřazený do ukázkové třídy 4.C
  sql(`update "User" set "classGroupId"='demo-class-4C' where id='usr_stud1'`);
  await openDemo(pa);
  await confirmDialog(pa, "demo-clear-open", "SMAZAT");
  const toast = await toastText(pa);
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("nejsou", { timeout: 55_000 });
  check("result mentions kept class", toast.includes("4.C") && toast.includes("zůstala"), toast);
  check("class with real student kept, other demo classes gone", sql(`select count(*) from "ClassGroup"`) === "3" && sql(`select count(*) from "ClassGroup" where grade=4 and letter='C'`) === "1");
  check("real student kept in class", sql(`select "classGroupId" from "User" where id='usr_stud1'`) === "demo-class-4C");
  check("no demo accounts left, evidence empty", sql(`select count(*) from "User" where email like '%@ukazka.invalid'`) === "0" && sql(`select count(*) from "DemoRecord"`) === "0");
  check("audit mentions kept class", sql(`select summary from "AuditLog" where action='system.demo.clear'`).includes("4.C"));

  // po smazání jde naplnit znovu; existující třída 4.C se použije a neeviduje
  await openDemo(pa);
  await confirmDialog(pa, "demo-seed-open", "UKÁZKA");
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("jsou v systému", { timeout: 55_000 });
  check("existing class reused, not tracked", sql(`select count(*) from "ClassGroup"`) === "12" && sql(`select count(*) from "DemoRecord" where model='ClassGroup' and "recordId"='demo-class-4C'`) === "0");
  await openDemo(pa);
  await confirmDialog(pa, "demo-clear-open", "SMAZAT");
  await expect(pa.locator('[data-testid="demo-state"]')).toContainText("nejsou", { timeout: 55_000 });
  check("real student and its class survive second clear", sql(`select count(*) from "ClassGroup" where id='demo-class-4C'`) === "1" && sql(`select count(*) from "User" where id='usr_stud1'`) === "1");
});

test("e-mailová vrstva přeskočí adresy na .invalid", async ({ browser }) => {
  resetDb();
  // admin s adresou na .invalid: zkušební e-mail chodí na adresu přihlášeného
  sql(`insert into "User"(id,"firstName","lastName",email,"passwordHash",role,"updatedAt") select 'adm_demo','Ukázkový','Admin','sprava@ukazka.invalid',"passwordHash",'ADMIN',now() from "User" where id='usr_admin'`);
  const pa = await login(browser, "sprava@ukazka.invalid");
  await pa.goto("/admin/notifications");
  const card = pa.getByTestId("email-card");
  await expect(card).toBeVisible();
  await card.getByTestId("email-send").click();
  await toastText(pa);
  const row = sql(`select status||'|'||event||'|'||coalesce(error,'') from "EmailLog" where recipient='sprava@ukazka.invalid'`);
  check("test e-mail to .invalid skipped and logged", row.startsWith("SKIPPED_DISABLED|test|") && row.includes(".invalid"), row);
  check("nothing sent", sql(`select count(*) from "EmailLog" where status='SENT'`) === "0");
});
