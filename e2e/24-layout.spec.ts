import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
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
  // U3: události (koncept i zveřejněná, s podtitulkem a obdobím registrace) pro seznam a nastavení
  sql(
    `insert into "Event"(id,slug,title,subtitle,status,visibility,"registrationOpensAt","registrationClosesAt","createdById","updatedAt") values ('evA','den-otevrenych-dveri','Den otevřených dveří','Prohlídka školy a laboratoří','PUBLISHED','USERS',now(),now()+interval '10 days','usr_teacher',now()),('evB','konzultace','Konzultace pro uchazeče',null,'DRAFT','PUBLIC',null,null,'usr_teacher',now())`
  );
  // U4: titulní obrázek a popis u první události
  const png = fs.readFileSync(path.join(__dirname, "fixtures", "maly.png"));
  sql(`insert into "EventImage"(id,data,mime,width,height,size,"createdById") values ('imA',decode('${png.toString("hex")}','hex'),'image/png',400,225,${png.length},'usr_teacher')`);
  sql(`update "Event" set "imageId"='imA',"imageAlt"='Budova školy',"descriptionHtml"='<h2>Program</h2><p>Prohlídka <a href="https://example.com">školy</a> a laboratoří.</p>' where id='evA'`);
  // U5/U6: termíny (s časem i bez) a vlastní pole formuláře u první události
  sql(
    `insert into "EventItem"(id,"eventId","startsAt","endsAt",capacity,"order") values ('itA1','evA',now()+interval '5 days',now()+interval '5 days 30 min',20,0),('itA2','evA',now()+interval '5 days 30 min',now()+interval '5 days 1 hour',20,1)`
  );
  sql(`insert into "EventItem"(id,"eventId",label,note,"order") values ('itA3','evA','Individuální termín','Po domluvě s organizátorem',2)`);
  sql(`insert into "EventField"(id,"eventId",key,type,label,mode,options,"order",builtin) values ('efA1','evA','custom_1','SELECT','Oblíbený předmět','REQUIRED',ARRAY['Matematika','Fyzika'],10,false)`);
  sql(`insert into "EventAudience"(id,"eventId",type,grade,key,"createdAt") values ('eaA','evA','GRADE',3,'GRADE:3',now())`);
  const pages: Record<string, string[]> = {
    "jan.student@skola.cz": ["/zapisy/enr_ls_2025", "/makeup", "/profile"],
    "teacher@skola.cz": ["/dashboard", "/enrollments", "/enrollments/enr_ls_2025", "/makeup", "/makeup/sessions/mA", "/events", "/events/new", "/events/evA", "/events/evA?tab=items", "/events/evA?tab=form", "/subjects/mine", "/users", "/profile"],
    "admin@skola.cz": [
      "/dashboard", "/admin", "/enrollments/enr_ls_2025", "/users", "/subjects", "/makeup",
      // F15: zbytek aplikace
      "/subjects/sm", "/users/usr_stud1", "/users?tab=approvals", "/enrollments", "/enrollments/settings", "/makeup/settings", "/profile",
      "/admin/school-year", "/admin/registration", "/admin/modules", "/admin/notifications", "/admin/history", "/admin/diagnostics", "/admin/demo", "/ochrana-udaju", "/events", "/events/new", "/events/evA", "/events/evA?tab=items", "/events/evA?tab=form", "/events/settings",
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
    for (const url of ["/login", "/register", "/ochrana-udaju"]) {
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
      // U5/U6: dialogy záložek Termíny a Formulář události
      ["/events/evA?tab=items", "Přidat termín"],
      ["/events/evA?tab=items", "Vygenerovat řadu"],
      ["/events/evA?tab=form", "Přidat vlastní pole"],
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
