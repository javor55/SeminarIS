import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText } from "./helpers";

// Historie změn: záznamy vznikají spolu se změnou a jsou čitelné v Administraci → Historie.

const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);
const auditCount = (where: string) => Number(sql(`select count(*) from "AuditLog" where ${where}`));

test("historie: odepsání v seminářích a z dopisování, nastavení, filtr a historie uživatele", async ({ browser }) => {
  resetDb();
  seedSubjects();
  const pa = await login(browser, "admin@skola.cz");
  check("fresh DB has no audit entries", auditCount("true") === 0);

  // 1) student se sám odepíše ze semináře (Programování mikrokontrolérů)
  const ps = await login(browser, "jan.student@skola.cz");
  await ps.goto("/dashboard");
  await ps.getByRole("button", { name: "Odepsat" }).click();
  await ps.getByRole("button", { name: "Odhlásit se" }).click();
  await ps.waitForTimeout(1500);
  check("student unenrolled", sql(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1'`) === "0");
  check("unenroll audited", auditCount(`action='seminars.enrollment.remove' and "actorId"='usr_stud1' and summary like 'Jan Student se odepsal(a) z předmětu „Programování mikrokontrolérů“%'`) === 1);

  // 2) učitel odepíše studenta z termínu dopisování
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('s1','usr_teacher',now()+interval '3 days',now()+interval '3 days 45 min','204',5,60,'usr_teacher',now()); insert into "MakeupSessionSubject" values ('s1','sm'); insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('r1','s1','usr_stud1','usr_stud1',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('r1','sm')`);
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/makeup/sessions/s1");
  await pt.getByRole("button", { name: "Odepsat" }).click();
  await pt.getByRole("button", { name: "Odepsat", exact: true }).last().click();
  await pt.waitForTimeout(1500);
  check("registration removed", sql(`select count(*) from "MakeupRegistration"`) === "0");
  check("removal audited with readable summary", auditCount(`action='makeup.registration.remove' and "actorId"='usr_teacher' and summary like 'Učitel Petr odepsal(a) studenta Student Jan z termínu%Matematika%'`) === 1);

  // 3) admin změní nastavení: vypne registraci
  await pa.goto("/admin/registration");
  await pa.waitForSelector("#setting-registration_enabled");
  await pa.locator("#setting-registration_enabled").click();
  await toastText(pa);
  check("settings change audited", auditCount(`action='settings.registration' and summary='Registrace nových uživatelů: zapnuto → vypnuto'`) === 1);

  // 4) Administrace → Historie
  await pa.goto("/admin/history");
  await expect(pa.getByTestId("audit-row").first()).toBeVisible();
  const text = await pa.getByTestId("history-card").innerText();
  check("history lists all three", text.includes("se odepsal(a) z předmětu") && text.includes("odepsal(a) studenta Student Jan") && text.includes("Registrace nových uživatelů"));
  // filtr oblasti
  await pa.selectOption("#h-area", "seminars");
  await expect(pa.getByTestId("audit-row")).toHaveCount(1);
  await pa.selectOption("#h-area", "");
  // hledání v popisu
  await pa.fill("#h-search", "Registrace");
  await expect(pa.getByTestId("audit-row")).toHaveCount(1);
  await pa.fill("#h-search", "");
  // kdo
  await pa.fill("#h-actor", "Učitel");
  await expect(pa.getByTestId("audit-row")).toHaveCount(1);
  await pa.fill("#h-actor", "");
  // období: dnešek ano, včerejšek ne
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(Date.now() + offset * 86400e3));
  await pa.fill("#h-from", day(0));
  await pa.fill("#h-to", day(0));
  await expect(pa.getByTestId("audit-row")).toHaveCount(3);
  await pa.fill("#h-to", day(-1));
  await expect(pa.getByTestId("audit-row")).toHaveCount(0);

  // 5) historie jednoho uživatele: co dělal on (odepsání ze semináře) i co se dělo s ním (odepsán dozorem)
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");
  await pa.locator('a[aria-label="Historie – Jan Student"]').click();
  await pa.waitForURL("**/admin/history?user=usr_stud1");
  await expect(pa.getByRole("heading", { name: "Historie: Jan Student" })).toBeVisible();
  await expect(pa.getByTestId("audit-row")).toHaveCount(2);

  // 6) uchovávání historie se nastavuje v administraci
  await pa.goto("/admin/history");
  await pa.fill("#h-retention", "1");
  await pa.getByTestId("retention-card").getByRole("button", { name: "Uložit" }).click();
  await toastText(pa);
  check("retention stored", sql(`select value from "SystemSetting" where key='audit.retentionYears'`) === "1");
  check("retention change audited", auditCount(`action='settings.history'`) === 1);

  // 7) historie je jen pro admina
  await pt.goto("/admin/history");
  check("teacher redirected from history", pt.url().endsWith("/dashboard"), pt.url());
});

test("historie: úprava uživatele, role a zápisového okna se zapíše česky a s před/po", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  // změna role studenta v seznamu uživatelů
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");
  const row = pa.locator("tr", { hasText: "eva.studentova@skola.cz" });
  await row.getByRole("combobox").click();
  await pa.getByRole("option", { name: "TEACHER" }).click();
  await pa.getByRole("button", { name: "Potvrdit" }).click();
  await pa.waitForTimeout(1500);
  check("role changed", sql(`select role from "User" where email='eva.studentova@skola.cz'`) === "TEACHER");
  check("role change audited", auditCount(`action='users.role' and summary='Změněna role uživatele Eva Studentová: student → učitel'`) === 1);
  check("role change has before/after", sql(`select data->>'before'||'>'||(data->>'after') from "AuditLog" where action='users.role'`) === "STUDENT>TEACHER");
  // úprava zápisového okna: název a ročníky
  await pa.goto("/enrollments/enr_ls_2025");
  await pa.getByRole("button", { name: "Upravit zápis" }).click();
  await pa.fill("#name", "Zápis LS 2026");
  await pa.locator('#targetGrades [data-grade="3"]').click();
  await pa.getByRole("button", { name: "Uložit", exact: true }).click();
  await pa.waitForTimeout(1500);
  const summary = sql(`select summary from "AuditLog" where action='seminars.window.update'`);
  check("window update summary", summary.startsWith("Upraveno zápisové okno „Zápis LS 2025“:") && summary.includes("název: Zápis LS 2025 → Zápis LS 2026") && summary.includes("ročníky: všechny ročníky → 3. ročník"), summary);
  check("window update has before/after data", sql(`select data->'before'->>'name'||'>'||(data->'after'->>'name') from "AuditLog" where action='seminars.window.update'`) === "Zápis LS 2025>Zápis LS 2026");
});
