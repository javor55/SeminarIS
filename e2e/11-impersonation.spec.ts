import { test, expect, type Browser, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, navLabels, toastText } from "./helpers";
import { IMPERSONATION_COOKIE, signImpersonation } from "../lib/impersonation-token";

// „Zobrazit jako uživatel“: admin vidí aplikaci očima studenta, jen pro čtení, s pruhem nahoře.
// Cookie se uplatní jen s platným podpisem, pro právě přihlášeného admina a neadminského cíle.

const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);
const STUDENT_NAV = ["Dashboard", "Předměty", "Dopisování", "Můj profil"];
const ADMIN_NAV = ["Dashboard", "Zápisy", "Předměty", "Dopisování", "Uživatelé", "Administrace", "Můj profil"];
const secret = process.env.NEXTAUTH_SECRET!;
const inHour = () => Math.floor(Date.now() / 1000) + 3600;

function prepare() {
  resetDb();
  seedSubjects();
  // Jan je zapsaný na budoucí termín dopisování (matematika), druhý admin pro negativní testy
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('s1','usr_teacher',now()+interval '3 days',now()+interval '3 days 45 min','204',5,60,'usr_teacher',now()); insert into "MakeupSessionSubject" values ('s1','sm'); insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('r1','s1','usr_stud1','usr_stud1',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('r1','sm')`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"passwordHash","updatedAt") select 'adm2','Druhý','Admin','admin2@skola.cz','ADMIN',"passwordHash",now() from "User" where id='usr_admin'`);
}

test("náhled jako student: jeho data, pruh, žádná změna a žádný e-mail, ukončení a historie", async ({ browser }) => {
  prepare();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");

  // jen na neadmina a ne na sebe
  check("no impersonate button for another admin", (await pa.getByRole("button", { name: "Zobrazit jako Druhý Admin" }).count()) === 0);
  check("no impersonate button for self", (await pa.getByRole("button", { name: "Zobrazit jako Admin Systému" }).count()) === 0);
  await pa.getByRole("button", { name: "Zobrazit jako Jan Student" }).click();
  await pa.waitForURL("**/dashboard");
  await pa.waitForLoadState("networkidle");

  // pruh nahoře a nabídka studenta
  const banner = pa.getByTestId("impersonation-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Prohlížíte jako Jan Student (student 3.A)");
  await expect(banner).toContainText("jen pro čtení");
  check("student nav while viewing", JSON.stringify(await navLabels(pa)) === JSON.stringify(STUDENT_NAV), JSON.stringify(await navLabels(pa)));

  // vidí data studenta: zápis do semináře a termín dopisování
  await expect(pa.getByTestId("makeup-widget")).toContainText("učebna 204");
  await expect(pa.getByRole("button", { name: "Odepsat" })).toBeVisible();
  await pa.goto("/makeup");
  await pa.waitForLoadState("networkidle");
  check("student makeup table with registration", (await pa.locator('tr[data-session="s1"]').getAttribute("data-registered")) === "true");

  // admin-ské stránky se v náhledu chovají jako u studenta
  await pa.goto("/admin");
  check("/admin redirected like for student", pa.url().endsWith("/dashboard"), pa.url());
  await pa.goto("/users");
  check("/users redirected like for student", pa.url().endsWith("/dashboard"), pa.url());
  await expect(pa.getByTestId("impersonation-banner")).toBeVisible();

  // 1) odepsání ze semináře se odmítne
  await pa.getByRole("button", { name: "Odepsat" }).click();
  await pa.getByRole("button", { name: "Odhlásit se" }).click();
  expect(await toastText(pa)).toContain("V režimu náhledu nelze nic měnit.");
  check("enrollment untouched", sql(`select count(*) from "StudentEnrollment" where "studentId"='usr_stud1'`) === "1");
  // 2) změna v profilu (safeAction) se odmítne
  await pa.goto("/profile");
  await pa.locator("#optional-emails").click();
  expect(await toastText(pa)).toContain("V režimu náhledu nelze nic měnit.");
  check("profile untouched", sql(`select "receiveOptionalEmails" from "User" where id='usr_stud1'`) === "t");
  // 3) odhlášení z dopisování se odmítne
  await pa.goto("/makeup");
  await pa.waitForLoadState("networkidle");
  await pa.locator('tr[data-session="s1"]').getByRole("button", { name: "Odhlásit" }).click();
  await pa.getByRole("button", { name: /^Odhlásit/ }).last().click();
  expect(await toastText(pa)).toContain("V režimu náhledu nelze nic měnit.");
  check("makeup registration untouched", sql(`select count(*) from "MakeupRegistration"`) === "1");
  // 4) přímý zápis mimo safeAction (API registrace) se odmítne
  const reg = await pa.request.post("/api/auth/register", {
    data: { email: "novy@skola.cz", password: "password123", firstName: "Nový", lastName: "Účet" },
  });
  check("register API refused in preview", reg.status() === 403, String(reg.status()));
  check("no user created", sql(`select count(*) from "User" where email='novy@skola.cz'`) === "0");
  // nic z toho nezapsalo do historie ani neposlalo e-mail
  check("no audit entries from refused changes", sql(`select string_agg(action, ',' order by action) from "AuditLog"`) === "impersonation.start");
  check("no e-mails sent in preview", sql(`select count(*) from "EmailLog"`) === "0");

  // ukončení náhledu
  await pa.getByTestId("stop-impersonation").click();
  await pa.waitForURL("**/users");
  await pa.waitForLoadState("networkidle");
  check("banner gone", (await pa.getByTestId("impersonation-banner").count()) === 0);
  check("admin nav back", JSON.stringify(await navLabels(pa)) === JSON.stringify(ADMIN_NAV), JSON.stringify(await navLabels(pa)));
  await pa.goto("/admin");
  check("admin page open again", pa.url().endsWith("/admin"), pa.url());

  // začátek a konec náhledu jsou v historii
  check("start and stop audited", sql(`select string_agg(action||':'||"actorId", ',' order by "createdAt") from "AuditLog"`) === "impersonation.start:usr_admin,impersonation.stop:usr_admin");
  check("start summary", sql(`select summary from "AuditLog" where action='impersonation.start'`) === "Spuštěn náhled jako Jan Student (student 3.A)");
  // po ukončení admin změny může dělat
  await pa.goto("/admin");
  await pa.waitForSelector("#registration");
  await pa.locator("#registration").click();
  expect(await toastText(pa)).toContain("Registrace zakázána");
});

test("náhled: jako učitel a host; ukončení odhlášením", async ({ browser }) => {
  prepare();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");
  await pa.getByRole("button", { name: "Zobrazit jako Petr Učitel" }).click();
  await pa.waitForURL("**/dashboard");
  await expect(pa.getByTestId("impersonation-banner")).toContainText("(učitel)");
  check("teacher nav while viewing", JSON.stringify(await navLabels(pa)) === JSON.stringify(["Dashboard", "Zápisy", "Předměty", "Dopisování", "Uživatelé", "Můj profil"]), JSON.stringify(await navLabels(pa)));
  // učitel vidí Uživatele, ale ne Administraci
  await pa.goto("/admin");
  check("/admin refused like for teacher", pa.url().endsWith("/dashboard"), pa.url());
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");
  check("/users open like for teacher", pa.url().endsWith("/users"), pa.url());
  // ani učitelova správa uživatelů nic nezmění
  check("no impersonate button while previewing", (await pa.getByTestId("impersonate").count()) === 0);
  // odhlášení ukončí i náhled
  await pa.getByRole("button", { name: "Odhlásit" }).first().click();
  await pa.waitForURL("**/");
  check("stop audited on logout", sql(`select count(*) from "AuditLog" where action='impersonation.stop'`) === "1");
});

async function asUser(browser: Browser, email: string, cookie: string | null): Promise<Page> {
  const p = await login(browser, email);
  if (cookie !== null) {
    await p.context().addCookies([{ name: IMPERSONATION_COOKIE, value: cookie, domain: "localhost", path: "/" }]);
  }
  await p.goto("/dashboard");
  await p.waitForLoadState("networkidle");
  return p;
}

test("náhled: podvržená, prošlá, cizí nebo nepovolená cookie se ignoruje", async ({ browser }) => {
  prepare();
  sql(`insert into "User"(id,"firstName","lastName",email,role,"isActive","updatedAt") values ('off','Vypnutý','Student','off@skola.cz','STUDENT',false,now())`);
  const good = { a: "usr_admin", t: "usr_stud1", r: "STUDENT", exp: inHour() };
  const ignored = async (name: string, cookie: string, email = "admin@skola.cz", nav = ADMIN_NAV) => {
    const p = await asUser(browser, email, cookie);
    check(`${name}: no banner`, (await p.getByTestId("impersonation-banner").count()) === 0);
    check(`${name}: own nav`, JSON.stringify(await navLabels(p)) === JSON.stringify(nav), JSON.stringify(await navLabels(p)));
    await p.context().close();
  };

  // kontrola: platná cookie funguje
  const p0 = await asUser(browser, "admin@skola.cz", await signImpersonation(good, secret));
  check("valid cookie works", (await p0.getByTestId("impersonation-banner").count()) === 1);
  await p0.context().close();

  await ignored("garbage", "abc.def");
  await ignored("unsigned payload", Buffer.from(JSON.stringify(good)).toString("base64url") + ".AAAA");
  await ignored("signed with another secret", await signImpersonation(good, "jiné-tajemství"));
  await ignored("expired", await signImpersonation({ ...good, exp: Math.floor(Date.now() / 1000) - 5 }, secret));
  await ignored("belongs to another admin", await signImpersonation({ ...good, a: "adm2" }, secret));
  await ignored("target is an admin", await signImpersonation({ ...good, t: "adm2", r: "ADMIN" }, secret));
  await ignored("target is deactivated", await signImpersonation({ ...good, t: "off" }, secret));
  await ignored("target does not exist", await signImpersonation({ ...good, t: "neexistuje" }, secret));
  // cizí cookie: platný podpis, ale přihlášený není ten admin / není admin
  await ignored("stolen by another admin", await signImpersonation(good, secret), "admin2@skola.cz");
  await ignored("stolen by a teacher", await signImpersonation(good, secret), "teacher@skola.cz", ["Dashboard", "Zápisy", "Předměty", "Dopisování", "Uživatelé", "Můj profil"]);
  await ignored("stolen by a student", await signImpersonation(good, secret), "eva.studentova@skola.cz", STUDENT_NAV);

  // admin byl během náhledu degradován: náhled končí
  const p1 = await asUser(browser, "admin@skola.cz", await signImpersonation(good, secret));
  check("preview running", (await p1.getByTestId("impersonation-banner").count()) === 1);
  sql(`update "User" set role='TEACHER' where id='usr_admin'`);
  await p1.reload();
  await p1.waitForLoadState("networkidle");
  check("demoted admin loses the preview", (await p1.getByTestId("impersonation-banner").count()) === 0);
  check("…and is just a teacher", JSON.stringify(await navLabels(p1)) === JSON.stringify(["Dashboard", "Zápisy", "Předměty", "Dopisování", "Uživatelé", "Můj profil"]), JSON.stringify(await navLabels(p1)));
  // …a deaktivace admina náhled také ukončí
  sql(`update "User" set role='ADMIN', "isActive"=false where id='usr_admin'`);
  await p1.goto("/dashboard");
  check("deactivated admin is logged out of the app", !p1.url().endsWith("/dashboard") || (await p1.getByTestId("impersonation-banner").count()) === 0, p1.url());
  sql(`update "User" set "isActive"=true where id='usr_admin'`);
});
