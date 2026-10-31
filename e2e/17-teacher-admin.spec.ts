import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, navLabels } from "./helpers";

// F7: učitel v administraci jen čte. Vidí Přehled (jen své položky) a Školní rok a třídy bez ovládacích
// prvků; ostatní sekce a adresy mu server odmítne (přesměrování na dashboard).
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

test.beforeAll(() => {
  resetDb();
  seedSubjects();
});

test("učitel v administraci: jen povolené sekce, jen čtení, přímé adresy ostatních sekcí odmítnuty", async ({ browser }) => {
  // čekající registrace (jen admin), termín dopisování bez předmětů cizího učitele a vlastní
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('g1','Host','Jedna','g1@skola.cz','GUEST',now())`);
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('mine','usr_teacher',now()+interval '3 days',now()+interval '3 days 45 min','204',5,60,'usr_teacher',now()),('foreign','usr_admin',now()+interval '4 days',now()+interval '4 days 45 min','205',5,60,'usr_admin',now())`);

  const pt = await login(browser, "teacher@skola.cz");
  check("teacher has Administrace in menu", (await navLabels(pt)).includes("Administrace"), JSON.stringify(await navLabels(pt)));

  await pt.goto("/admin");
  const nav = pt.getByTestId("admin-nav");
  await expect(nav).toBeVisible();
  const links = await nav.getByRole("link").allInnerTexts();
  check("teacher sees only overview and school year", JSON.stringify(links) === JSON.stringify(["Přehled", "Školní rok a třídy"]), JSON.stringify(links));

  // přehled: jen položky, které se učitele týkají
  await expect(pt.getByTestId("admin-todos")).toBeVisible();
  const todoIds = await pt.locator("[data-testid=admin-todo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-todo")));
  check("teacher sees unenrolled students in open window", todoIds.some((id) => id?.startsWith("seminars.unenrolled.")), JSON.stringify(todoIds));
  check("teacher sees own makeup term without subjects", todoIds.includes("makeup.without-subjects"), JSON.stringify(todoIds));
  const makeupCount = await pt.locator('[data-todo="makeup.without-subjects"]').getByTestId("todo-count").innerText();
  check("only teacher's own terms are counted", makeupCount === "1", makeupCount);
  check("admin-only todos are hidden", todoIds.every((id) => id?.startsWith("seminars.") || id === "makeup.without-subjects"), JSON.stringify(todoIds));
  check("pending accounts hidden", !todoIds.includes("core.pending-accounts"));

  // Školní rok a třídy: jen čtení
  await nav.getByRole("link", { name: "Školní rok a třídy" }).click();
  await pt.waitForURL("**/admin/school-year");
  await expect(pt.getByTestId("school-year-card")).toBeVisible();
  await expect(pt.getByTestId("classes-table")).toBeVisible();
  check("current year shown", (await pt.getByTestId("current-year").innerText()).length > 0);
  check("no close-year link", (await pt.locator('a[href="/admin/close-year"]').count()) === 0);
  check("no manual year setter", (await pt.locator("#school-year").count()) === 0);
  check("no imports", (await pt.getByTestId("imports-card").count()) === 0);
  check("no class generator", (await pt.getByTestId("create-classes").count()) === 0);
  await pt.locator('tr[data-class="3.A"] button[aria-expanded]').click();
  await expect(pt.getByTestId("class-students")).toBeVisible();
  check("students of class listed", (await pt.getByTestId("class-students").locator("li").count()) > 0);
  check("no move-to-class select, no delete button", (await pt.locator("[data-testid=class-students] select").count()) === 0 && (await pt.locator('button[title="Smazat třídu"]').count()) === 0);

  // přímé adresy ostatních sekcí
  for (const url of ["/admin/registration", "/admin/modules", "/admin/notifications", "/admin/history", "/admin/diagnostics", "/admin/close-year", "/enrollments/settings", "/makeup/settings"]) {
    await pt.goto(url);
    check(`teacher cannot open ${url}`, pt.url().endsWith("/dashboard"), pt.url());
  }

  // student administraci nevidí vůbec
  const ps = await login(browser, "jan.student@skola.cz");
  check("student has no Administrace", !(await navLabels(ps)).includes("Administrace"));
  await ps.goto("/admin");
  check("student /admin redirected", ps.url().endsWith("/dashboard"), ps.url());
  await ps.goto("/admin/school-year");
  check("student /admin/school-year redirected", ps.url().endsWith("/dashboard"), ps.url());
});
