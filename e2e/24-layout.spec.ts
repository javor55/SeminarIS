import { test, expect, type Page } from "@playwright/test";
import { resetDb, seedSubjects, sql, waitForAppHome } from "./helpers";

// F14: na hlavních stránkách všech rolí (telefon 390×844 a počítač 1280×800) se tlačítka, odkazy a pole
// nepřekrývají, nelepí na sebe a stránka nepřetéká do šířky. Inline odkazy uvnitř odstavce se nekontrolují.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=combobox], [role=checkbox]";
    const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.display !== "inline" && cs.position !== "fixed" && cs.position !== "sticky" && !e.closest("[data-testid=student-bottom-nav]");
    });
    const name = (e: HTMLElement) => (e.getAttribute("data-testid") || e.id || e.textContent?.trim().slice(0, 25) || e.tagName).replace(/\s+/g, " ");
    const out: string[] = [];
    const R = els.map((e) => e.getBoundingClientRect());
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const ox = Math.min(R[i].right, R[j].right) - Math.max(R[i].left, R[j].left);
        const oy = Math.min(R[i].bottom, R[j].bottom) - Math.max(R[i].top, R[j].top);
        if ((ox > 1 && oy > 1) || (ox > 1 && oy > -1 && oy <= 1) || (oy > 1 && ox > -1 && ox <= 1)) out.push(`${name(els[i])} | ${name(els[j])}`);
      }
    }
    const over = document.documentElement.scrollWidth - window.innerWidth;
    if (over > 0) out.push(`přetéká o ${over} px`);
    return out;
  });
}

test("rozložení: nic se nepřekrývá ani nepřetéká (student, učitel, admin; telefon i počítač)", async ({ browser }) => {
  resetDb();
  seedSubjects();
  sql(
    `insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('mA','usr_teacher',now()+interval '3 days',now()+interval '3 days 45 min','101',5,60,'usr_teacher',now())`
  );
  sql(`insert into "MakeupSessionSubject" values ('mA','sm'),('mA','scj')`);
  const pages: Record<string, string[]> = {
    "jan.student@skola.cz": ["/zapisy/enr_ls_2025", "/makeup", "/profile"],
    "teacher@skola.cz": ["/dashboard", "/enrollments", "/enrollments/enr_ls_2025", "/makeup", "/makeup/sessions/mA", "/subjects/mine", "/users", "/profile"],
    "admin@skola.cz": [
      "/dashboard", "/admin", "/enrollments/enr_ls_2025", "/users", "/subjects", "/makeup",
      // F15: zbytek aplikace
      "/subjects/sm", "/users/usr_stud1", "/users?tab=approvals", "/enrollments", "/enrollments/settings", "/makeup/settings", "/profile",
      "/admin/school-year", "/admin/registration", "/admin/modules", "/admin/notifications", "/admin/history", "/admin/diagnostics", "/admin/demo",
    ],
  };
  for (const [vname, viewport] of Object.entries(VIEWPORTS)) {
    for (const [email, urls] of Object.entries(pages)) {
      const ctx = await browser.newContext({ viewport, hasTouch: vname === "phone" });
      const page = await ctx.newPage();
      await page.goto("/login");
      await page.fill("#email", email);
      await page.fill("#password", "password123");
      await page.click("button[type=submit]");
      await waitForAppHome(page);
      for (const url of urls) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        const p = await problems(page);
        check(`${vname} ${email} ${url}`, p.length === 0, p.join("; "));
      }
      if (email.startsWith("jan")) {
        await page.goto("/makeup");
        await page.getByTestId("account-menu").click();
        const p = await problems(page);
        check(`${vname} menu účtu`, p.length === 0, p.join("; "));
      }
      await ctx.close();
    }
  }
});

test("rozložení: přihlášení, registrace a dialogy (telefon i počítač)", async ({ browser }) => {
  for (const [vname, viewport] of Object.entries(VIEWPORTS)) {
    const anon = await browser.newContext({ viewport, hasTouch: vname === "phone" });
    const pa = await anon.newPage();
    for (const url of ["/login", "/register"]) {
      await pa.goto(url);
      await pa.waitForLoadState("networkidle");
      const p = await problems(pa);
      check(`${vname} ${url}`, p.length === 0, p.join("; "));
    }
    await anon.close();

    const ctx = await browser.newContext({ viewport, hasTouch: vname === "phone" });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill("#email", "admin@skola.cz");
    await page.fill("#password", "password123");
    await page.click("button[type=submit]");
    await waitForAppHome(page);
    for (const [url, button] of [
      ["/enrollments", "Vytvořit nový zápis"],
      ["/makeup", "Nový termín"],
    ] as const) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: button }).first().click();
      await page.waitForSelector("[role=dialog]");
      const p = await page.evaluate(() => {
        const d = document.querySelector<HTMLElement>("[role=dialog]")!;
        const els = [...d.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea")].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none";
        });
        const R = els.map((e) => e.getBoundingClientRect());
        const out: string[] = [];
        for (let i = 0; i < els.length; i++)
          for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const ox = Math.min(R[i].right, R[j].right) - Math.max(R[i].left, R[j].left);
            const oy = Math.min(R[i].bottom, R[j].bottom) - Math.max(R[i].top, R[j].top);
            if (ox > 1 && oy > 1) out.push(`${els[i].textContent?.trim().slice(0, 20) || els[i].id} | ${els[j].textContent?.trim().slice(0, 20) || els[j].id}`);
          }
        if (d.scrollWidth > d.clientWidth + 1) out.push("dialog přetéká do šířky");
        return out;
      });
      check(`${vname} dialog ${button}`, p.length === 0, p.join("; "));
      await page.keyboard.press("Escape");
    }
    await ctx.close();
  }
});
