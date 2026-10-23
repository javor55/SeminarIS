import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, tryLogin, navLabels, toastText, tmpFile, currentSchoolYear, yearLabel } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const Y = currentSchoolYear();
const pickSelect = async (p, triggerId: string, optionText: string) => { await p.click("#" + triggerId); await p.getByRole("option", { name: optionText, exact: true }).click(); };

test.beforeAll(() => {
  resetDb();
});

test("škola: třídy, předměty, úvazky, import se třídou, cílení zápisu", async ({ browser }) => {
  const b = browser;

  // login page without M365
  const p0 = await (await b.newContext()).newPage(); await p0.goto('/login');
  check('no microsoft button when not configured', (await p0.locator('[data-testid=microsoft-login]').count()) === 0);

  const pa = await login(b, 'admin@skola.cz');
  check('admin nav has Škola', JSON.stringify(await navLabels(pa)) === JSON.stringify(['Dashboard', 'Zápisy', 'Semináře', 'Dopisování', 'Uživatelé', 'Škola', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(pa)));
  await pa.goto('/school'); await pa.waitForLoadState('networkidle');
  const year = sql(`select "startYear" from "SchoolYear" where "isCurrent"`);
  check('current school year created', year === `${Y}`, year);
  // třídy 3. ročníku A,B,C
  await pickSelect(pa, 'class-grade', '3.'); await pa.fill('#class-letters', 'A, B, C');
  await pa.getByRole('button', { name: 'Založit' }).click(); await pa.waitForTimeout(1500);
  await pickSelect(pa, 'class-grade', '1.'); await pa.fill('#class-letters', 'A');
  await pa.getByRole('button', { name: 'Založit' }).click(); await pa.waitForTimeout(1500);
  const chips = await pa.locator('[data-testid=class-chip]').allInnerTexts();
  check('classes created', chips.length === 4 && chips.some((c) => c.startsWith('3.A')) && chips.some((c) => c.startsWith('1.A')), JSON.stringify(chips));
  check('class entry years', sql(`select string_agg("entryYear"||"letter", ',' order by "entryYear","letter") from "ClassGroup"`) === `${Y - 2}A,${Y - 2}B,${Y - 2}C,${Y}A`);
  // předmět
  await pa.fill('#subject-name', 'Matematika'); await pa.fill('#subject-code', 'm');
  await pa.getByRole('button', { name: 'Přidat', exact: true }).click(); await pa.waitForTimeout(1500);
  check('subject created', sql(`select name||'/'||code from "Subject"`) === 'Matematika/M');
  // úvazek
  const tname = sql(`select "lastName"||' '||"firstName" from "User" where email='teacher@skola.cz'`);
  await pickSelect(pa, 'assign-teacher', tname);
  await pickSelect(pa, 'assign-subject', 'Matematika (M)');
  await pa.getByRole('button', { name: '3.A', exact: true }).click();
  await pa.getByRole('button', { name: '3.B', exact: true }).click();
  await pa.getByRole('button', { name: 'Přidat úvazek' }).click(); await pa.waitForTimeout(1500);
  check('assignments created', sql(`select count(*) from "TeachingAssignment"`) === '2');

  // import se třídou
  const csv = '﻿firstName;lastName;email;class;role;isActive;password\nJan;Student;jan.student@skola.cz;3.A;STUDENT;TRUE;password123\nEva;Studentová;eva.studentova@skola.cz;1a;STUDENT;TRUE;password123\nNový;Žák;novy.zak@skola.cz;2.B;STUDENT;TRUE;password123\nŠpatný;Řádek;spatny@skola.cz;9.Z;STUDENT;TRUE;x\n';
  const csvFile = tmpFile('import.csv', csv);
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  await pa.getByRole('button', { name: /Import/ }).first().click();
  await pa.setInputFiles('#csv-file', csvFile);
  await pa.getByRole('button', { name: /Importovat|Spustit import|Nahrát/ }).last().click(); await pa.waitForTimeout(3000);
  const dlg = await pa.locator('[role=dialog]').innerText();
  check('import result shows error line', dlg.includes('neplatná třída') && dlg.includes('9.Z'), dlg.replace(/\n/g, ' | ').slice(0, 300));
  check('import assigned classes', sql(`select string_agg(u.email||'='||c."entryYear"||c.letter, ',' order by u.email) from "User" u join "ClassGroup" c on c.id=u."classGroupId"`) === `eva.studentova@skola.cz=${Y}A,jan.student@skola.cz=${Y - 2}A,novy.zak@skola.cz=${Y - 1}B`);
  await pa.keyboard.press('Escape'); await pa.reload(); await pa.waitForLoadState('networkidle');
  check('users table shows class', (await pa.locator('table').innerText()).includes('3.A'));

  // cílení zápisu na 3. ročník přes dialog okna
  const wid = sql(`select id from "EnrollmentWindow" limit 1`);
  await pa.goto('/enrollments/' + wid); await pa.waitForLoadState('networkidle');
  await pa.getByRole('button', { name: /Upravit/ }).first().click();
  await pa.locator('#targetGrades [data-grade="3"]').click();
  await pa.getByRole('button', { name: /Uložit/ }).last().click(); await pa.waitForTimeout(2000);
  check('targetGrades saved', sql(`select "targetGrades"::text from "EnrollmentWindow" where id='${wid}'`) === '{3}');
  await pa.reload(); await pa.waitForLoadState('networkidle');
  check('header shows target', (await pa.locator('main').innerText()).includes('Pro: 3. ročník'));

  // student 3.A vidí, student 1.A ne
  const pj = await login(b, 'jan.student@skola.cz');
  check('3rd grader sees window', (await pj.content()).includes('Zápis LS 2025'));
  const pe = await login(b, 'eva.studentova@skola.cz');
  check('1st grader does not see window', !(await pe.content()).includes('Zápis LS 2025') && (await pe.content()).includes('Vítejte'));
  await pe.goto('/subjects'); await pe.waitForLoadState('networkidle');
  const subjCount = sql(`select count(*) from "Subject"`);
  check('1st grader sees no seminars', !(await pe.locator('main').innerText()).match(/Matematick|Fyzik|Informatik|Biolog/i), subjCount);
  await pe.goto('/enrollments/' + wid); check('1st grader cannot open window', !(await pe.content()).includes('Zápis LS 2025'));

  // přepnutí školního roku: 3.A → 4.A, Jan ztratí zápis pro 3. ročník
  sql(`update "SchoolYear" set "isCurrent"=false; insert into "SchoolYear"(id,"startYear","isCurrent","updatedAt") values ('sy27',${Y + 1},true,now())`);
  await pj.goto('/dashboard'); await pj.waitForLoadState('networkidle');
  check('after year switch 4th grader does not see window', !(await pj.content()).includes('Zápis LS 2025'));
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  check('class label moved to 4.A', (await pa.locator('table').innerText()).includes('4.A'));
  sql(`delete from "SchoolYear" where id='sy27'; update "SchoolYear" set "isCurrent"=true where "startYear"=${Y}`);

  // admin: přihlášení karta bez konfigurace
  await pa.goto('/admin'); await pa.waitForSelector('#auth-microsoft');
  check('admin auth card shows not configured', (await pa.locator('main').innerText()).includes('není nakonfigurováno'));
});
