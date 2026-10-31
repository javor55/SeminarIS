import { test, expect, type Page } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, tmpFile, currentSchoolYear } from "./helpers";

// F6: importy s náhledem (uživatelé, úvazky, předměty). Náhled řádky třídí na nový / změna / beze změny /
// chyba, potvrzení znovu validuje na serveru a zapíše jen platné řádky jedním záznamem do historie;
// opakovaný import nic nezdvojí.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const BOM = "﻿";
const Y = currentSchoolYear();
const audits = (action: string) => Number(sql(`select count(*) from "AuditLog" where action='${action}'`));

/** Nahraje soubor do otevřeného dialogu a počká na náhled. */
async function upload(p: Page, name: string, content: string) {
  await p.setInputFiles("#csv-file", tmpFile(name, content));
  await p.waitForSelector("[data-testid=import-preview], [data-testid=import-error]");
}
async function counts(p: Page) {
  await p.waitForTimeout(400);
  const out: Record<string, number> = {};
  for (const s of ["new", "change", "unchanged", "error"]) {
    const t = await p.locator(`[data-testid=import-counts] [data-count=${s}]`).innerText();
    out[s] = Number(t.split(":")[1]);
  }
  return out;
}
const rowOf = (p: Page, line: number) => p.locator(`[data-testid=import-preview] tr[data-line="${line}"]`);
const confirm = async (p: Page) => {
  await p.getByTestId("import-confirm").click();
  await p.waitForSelector("[data-testid=import-result]");
};

test("import uživatelů: náhled, potvrzení jen platných řádků, opakování, aktualizace a historie tříd", async ({ browser }) => {
  resetDb();
  const pa = await login(browser, "admin@skola.cz");
  await pa.goto("/users");
  await pa.waitForLoadState("networkidle");
  await pa.getByRole("button", { name: /Import uživatelů/ }).first().click();

  // vzor ke stažení
  const [dl] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("import-sample").click()]);
  const sample = await (await import("fs")).promises.readFile((await dl.path())!, "utf8");
  check("sample csv has header and rows", sample.includes("firstName;lastName;email") && sample.split("\n").length > 3, sample.slice(0, 80));

  // 1) první soubor: 2 nové, 4 chyby
  const file1 =
    BOM +
    "firstName;lastName;email;class;role;isActive;password\n" +
    "Anna;Nová;anna@skola.cz;1.A;STUDENT;TRUE;heslo1234\n" +
    "Boris;Bor;boris@skola.cz;2.B;STUDENT;TRUE;\n" +
    "Špatný;Řádek;spatny@skola.cz;9.Z;STUDENT;TRUE;\n" +
    "Bez;Role;bad@skola.cz;;DIREKTOR;TRUE;\n" +
    "Bez;Emailu;;;STUDENT;TRUE;\n" +
    "Anna;Duplicitní;ANNA@skola.cz;1.A;STUDENT;TRUE;\n";
  await upload(pa, "u1.csv", file1);
  const c1 = await counts(pa);
  check("preview counts 2/0/0/4", c1.new === 2 && c1.change === 0 && c1.unchanged === 0 && c1.error === 4, JSON.stringify(c1));
  check("preview row statuses", (await rowOf(pa, 2).getAttribute("data-status")) === "new" && (await rowOf(pa, 4).getAttribute("data-status")) === "error");
  check("preview error reasons", (await rowOf(pa, 4).innerText()).includes("neplatná třída") && (await rowOf(pa, 5).innerText()).includes("neplatná role") && (await rowOf(pa, 6).innerText()).includes("chybí e-mail") && (await rowOf(pa, 7).innerText()).includes("už na řádku 2"));
  check("preview wrote nothing", sql(`select count(*) from "User" where email in ('anna@skola.cz','boris@skola.cz')`) === "0" && audits("users.import") === 0);
  await confirm(pa);
  check("only valid rows imported", sql(`select string_agg(email||'='||coalesce(c.grade||c.letter,'-'), ',' order by email) from "User" u left join "ClassGroup" c on c.id=u."classGroupId" where email in ('anna@skola.cz','boris@skola.cz','spatny@skola.cz','bad@skola.cz')`) === "anna@skola.cz=1A,boris@skola.cz=2B");
  check("one audit entry with counts", audits("users.import") === 1 && sql(`select summary from "AuditLog" where action='users.import'`).includes("2 nových") && sql(`select data->>'error' from "AuditLog" where action='users.import'`) === "4");
  check("password set for both (given and random)", sql(`select count(*) from "User" where email in ('anna@skola.cz','boris@skola.cz') and "passwordHash" is not null`) === "2");
  await pa.keyboard.press("Escape");

  // 2) opakování stejného souboru: nic se nemění
  await pa.getByRole("button", { name: /Import uživatelů/ }).first().click();
  await upload(pa, "u1.csv", file1);
  const c2 = await counts(pa);
  check("re-import: all unchanged", c2.new === 0 && c2.change === 0 && c2.unchanged === 2 && c2.error === 4, JSON.stringify(c2));
  check("re-import: confirm disabled", await pa.getByTestId("import-confirm").isDisabled());
  check("still two users, one audit", sql(`select count(*) from "User" where email in ('anna@skola.cz','boris@skola.cz')`) === "2" && audits("users.import") === 1);
  await pa.keyboard.press("Escape");

  // 3) čárka, české hlavičky, e-mail velkými písmeny; změna třídy a jména; hesla se nemění
  const hashBefore = sql(`select "passwordHash" from "User" where email='anna@skola.cz'`);
  await pa.getByRole("button", { name: /Import uživatelů/ }).first().click();
  await upload(pa, "u2.csv", BOM + "jméno,příjmení,e-mail,třída,heslo\nAnička,Nová,ANNA@skola.cz,2.A,jineheslo\nBoris,Bor,BORIS@skola.cz,2.B,\n");
  const c3 = await counts(pa);
  check("czech headers: 0/1/1/0", c3.new === 0 && c3.change === 1 && c3.unchanged === 1 && c3.error === 0, JSON.stringify(c3));
  const t = await rowOf(pa, 2).innerText();
  check("change lists exact diffs", t.includes("jméno: Anna → Anička") && t.includes("třída: 1.A → 2.A") && !t.includes("heslo"), t);
  // volba „aktualizovat existující“ vypnutá → vše beze změny
  await pa.getByTestId("import-option-update").uncheck();
  await pa.waitForTimeout(800);
  const c3b = await counts(pa);
  check("update off: unchanged", c3b.change === 0 && c3b.unchanged === 2, JSON.stringify(c3b));
  await pa.getByTestId("import-option-update").check();
  await pa.waitForTimeout(800);
  await confirm(pa);
  check("update applied", sql(`select u."firstName"||'/'||c.grade||c.letter from "User" u join "ClassGroup" c on c.id=u."classGroupId" where email='anna@skola.cz'`) === "Anička/2A");
  check("password of existing user untouched", sql(`select "passwordHash" from "User" where email='anna@skola.cz'`) === hashBefore);
  check("class change recorded in history", sql(`select m."schoolYearId" is not null and m.reason::text='MOVED' and m.grade=2 from "ClassMembership" m join "User" u on u.id=m."userId" where u.email='anna@skola.cz'`) === "t" && sql(`select count(*) from "ClassMembership" m join "User" u on u.id=m."userId" where u.email='anna@skola.cz'`) === "1");
  check("second audit entry", audits("users.import") === 2);
  await pa.keyboard.press("Escape");

  // detail uživatele ukazuje změnu v jeho historii
  const annaId = sql(`select id from "User" where email='anna@skola.cz'`);
  await pa.goto(`/users/${annaId}?tab=classes`);
  await pa.waitForLoadState("networkidle");
  check("history tab shows classes", (await pa.locator("main").innerText()).includes("2.A"));

  // učitel import nevidí
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/users");
  await pt.waitForLoadState("networkidle");
  check("teacher has no users import", (await pt.getByRole("button", { name: /Import uživatelů/ }).count()) === 0);
  void Y;
});

test("import úvazků a předmětů: chyby v náhledu, idempotence, vzory a historie", async ({ browser }) => {
  resetDb();
  seedSubjects();
  sql(`insert into "ClassGroup"(id,grade,letter,"updatedAt") values ('c2a',2,'A',now()),('c2b',2,'B',now())`);
  sql(`insert into "Subject"(id,name,code,grades,"isActive","updatedAt") values ('sze','Zeměpis','ZE','{4}',true,now()),('sarch','Starý předmět','ARCH','{}',false,now())`);
  const pa = await login(browser, "admin@skola.cz");

  // === úvazky (Administrace → Školní rok a třídy) ===
  await pa.goto("/admin/school-year");
  await pa.waitForLoadState("networkidle");
  await pa.getByTestId("import-open-assignments").click();
  const [dl] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("import-sample").click()]);
  const sample = await (await import("fs")).promises.readFile((await dl.path())!, "utf8");
  check("assignments sample header", sample.includes("email_ucitele;kod_predmetu;trida"), sample.slice(0, 80));

  const file =
    "email_ucitele;kod_predmetu;trida\n" +
    "teacher@skola.cz;M;2.A\n" + // nový
    "teacher@skola.cz;m;3.A\n" + // už existuje (seedSubjects)
    "neznamy@skola.cz;M;2.A\n" +
    "jan.student@skola.cz;M;2.A\n" +
    "teacher@skola.cz;XX;2.A\n" +
    "teacher@skola.cz;M;7.Q\n" +
    "teacher@skola.cz;ZE;3.A\n" +
    "teacher@skola.cz;ARCH;2.A\n" +
    "teacher@skola.cz;CJ;2.B\n"; // nový
  await upload(pa, "a1.csv", file);
  const c = await counts(pa);
  check("assignments preview 2/0/1/6", c.new === 2 && c.change === 0 && c.unchanged === 1 && c.error === 6, JSON.stringify(c));
  const reasons = [
    [4, "neexistuje"], [5, "není učitel"], [6, "předmět se zkratkou XX neexistuje"], [7, "třída"], [8, "nevyučuje"], [9, "archivovaný"],
  ] as const;
  for (const [line, text] of reasons) check(`assignment error line ${line}`, (await rowOf(pa, line).innerText()).includes(text), await rowOf(pa, line).innerText());
  check("preview wrote nothing", sql(`select count(*) from "TeachingAssignment"`) === "1");
  await confirm(pa);
  check("only valid assignments created", sql(`select string_agg(s.code||c.grade||c.letter, ',' order by s.code, c.grade, c.letter) from "TeachingAssignment" t join "Subject" s on s.id=t."subjectId" join "ClassGroup" c on c.id=t."classGroupId"`) === "CJ2B,M2A,M3A");
  check("assignments audit", audits("subjects.assignment.import") === 1 && sql(`select summary from "AuditLog" where action='subjects.assignment.import'`).includes("2 nových"));
  await pa.keyboard.press("Escape");

  await pa.getByTestId("import-open-assignments").click();
  await upload(pa, "a1.csv", file);
  const c2 = await counts(pa);
  check("assignments re-import all unchanged", c2.new === 0 && c2.unchanged === 3 && c2.error === 6, JSON.stringify(c2));
  check("assignments confirm disabled", await pa.getByTestId("import-confirm").isDisabled());
  await pa.keyboard.press("Escape");

  // chybějící sloupec = chyba celého souboru
  await pa.getByTestId("import-open-assignments").click();
  await upload(pa, "a2.csv", "email;predmet\nteacher@skola.cz;M\n");
  check("missing column reported", (await pa.getByTestId("import-error").innerText()).includes("chybí sloupec"));
  await pa.keyboard.press("Escape");

  // === předměty (menu Předměty) ===
  await pa.goto("/subjects");
  await pa.waitForLoadState("networkidle");
  await pa.getByTestId("import-open-subjects").click();
  const [dl2] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("import-sample").click()]);
  check("subjects sample", (await (await import("fs")).promises.readFile((await dl2.path())!, "utf8")).includes("nazev;kod;rocniky"));
  await upload(
    pa,
    "s1.csv",
    BOM + 'název,kód,ročníky\nChemie,CH,"1,2"\nFyzika,F,3-4\nMatematika,M,\n,X,1\nBiologie,BI,9\n'
  );
  const s = await counts(pa);
  check("subjects preview 1/1/1/2", s.new === 1 && s.change === 1 && s.unchanged === 1 && s.error === 2, JSON.stringify(s));
  check("subject diff text", (await rowOf(pa, 3).innerText()).includes("všechny ročníky → 3., 4."), await rowOf(pa, 3).innerText());
  await confirm(pa);
  check("subjects applied", sql(`select string_agg(code||'='||grades::text, ',' order by code) from "Subject" where code in ('CH','F','M','BI')`) === "CH={1,2},F={3,4},M={}");
  check("subjects audit", audits("subjects.subject.import") === 1);
  await pa.keyboard.press("Escape");

  await pa.getByTestId("import-open-subjects").click();
  await upload(pa, "s1.csv", BOM + 'název,kód,ročníky\nChemie,CH,"1,2"\nFyzika,F,3-4\nMatematika,M,\n');
  const s2 = await counts(pa);
  check("subjects re-import unchanged", s2.new === 0 && s2.change === 0 && s2.unchanged === 3, JSON.stringify(s2));
  await pa.keyboard.press("Escape");

  // učitel: import předmětů ano, úvazků ne (jen admin)
  const pt = await login(browser, "teacher@skola.cz");
  await pt.goto("/subjects");
  await pt.waitForLoadState("networkidle");
  check("teacher sees subjects import only", (await pt.getByTestId("import-open-subjects").count()) === 1 && (await pt.getByTestId("import-open-assignments").count()) === 0);
});
