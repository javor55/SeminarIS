import { test, expect } from "@playwright/test";
import { sql, resetDb, login, navLabels, tmpFile, currentSchoolYear } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const Y = currentSchoolYear();
const classesOf = () => sql(`select string_agg(grade||letter, ',' order by grade, letter) from "ClassGroup"`);

test.beforeAll(() => {
  resetDb();
});

test("třídy, předměty, import se třídou, přesun mezi třídami, cílení zápisu", async ({ browser }) => {
  const b = browser;

  // login page without M365
  const p0 = await (await b.newContext()).newPage(); await p0.goto('/login');
  check('no microsoft button when not configured', (await p0.locator('[data-testid=microsoft-login]').count()) === 0);

  const pa = await login(b, 'admin@skola.cz');
  check('admin nav (no Škola)', JSON.stringify(await navLabels(pa)) === JSON.stringify(['Dashboard', 'Zápisy', 'Předměty', 'Dopisování', 'Uživatelé', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(pa)));
  check('/school is gone', (await pa.goto('/school')).status() === 404);

  // školní rok je v Administraci
  await pa.goto('/admin'); await pa.waitForSelector('[data-testid=school-year-card]');
  check('current school year in admin', sql(`select "startYear" from "SchoolYear" where "isCurrent"`) === `${Y}` && (await pa.locator('[data-testid=current-year]').innerText()).startsWith(`${Y}/`));
  check('admin links to year closure', (await pa.locator('a[href="/admin/close-year"]').count()) === 1);

  // třídy: generátor ročníky × písmena (seed má 3.A a 3.B)
  await pa.goto('/users?tab=classes'); await pa.waitForLoadState('networkidle');
  await pa.fill('#class-letters', 'A, B, C');
  await pa.click('[data-testid=create-classes]'); await pa.waitForTimeout(1500);
  check('classes 1–4 × A,B,C generated', classesOf() === '1A,1B,1C,2A,2B,2C,3A,3B,3C,4A,4B,4C', classesOf());
  check('classes table lists 12 classes', (await pa.locator('[data-testid=classes-table] tbody tr[data-class]').count()) === 12);
  // prázdnou třídu lze smazat, třídu se studenty ne
  await pa.locator('tr[data-class="4.C"] button[title="Smazat třídu"]').click();
  await pa.getByRole('button', { name: 'Smazat', exact: true }).click(); await pa.waitForTimeout(1500);
  check('empty class deleted', !classesOf().includes('4C'), classesOf());
  check('class with students has no delete button', (await pa.locator('tr[data-class="3.A"] button[title="Smazat třídu"]').count()) === 0);
  await pa.fill('#class-letters', 'C');
  await pa.locator('#class-grades [data-grade="1"]').click(); await pa.locator('#class-grades [data-grade="2"]').click(); await pa.locator('#class-grades [data-grade="3"]').click();
  await pa.click('[data-testid=create-classes]'); await pa.waitForTimeout(1500);
  check('only 4.C regenerated', classesOf().includes('4C'), classesOf());

  // předmět z formuláře: ročníky, nepovinná zkratka
  await pa.goto('/subjects/new/edit'); await pa.waitForSelector('#name');
  await pa.fill('#name', 'Matematika'); await pa.fill('#code', 'm');
  await pa.locator('#subject-grades [data-grade="3"]').check();
  await pa.getByRole('button', { name: 'Uložit' }).click(); await pa.waitForURL(/\/subjects\/(?!new)[^/]+$/, { timeout: 15000 });
  check('subject created with grades', sql(`select name||'/'||code||'/'||grades::text from "Subject" where name='Matematika'`) === 'Matematika/M/{3}');
  await pa.goto('/subjects/new/edit'); await pa.waitForSelector('#name');
  await pa.fill('#name', 'Dějepis'); await pa.getByRole('button', { name: 'Uložit' }).click(); await pa.waitForURL(/\/subjects\/(?!new)[^/]+$/, { timeout: 15000 });
  check('subject without code and grades', sql(`select coalesce(code,'-')||'/'||grades::text from "Subject" where name='Dějepis'`) === '-/{}');
  await pa.goto('/subjects/new/edit'); await pa.waitForSelector('#name');
  await pa.fill('#name', 'Matematika 2'); await pa.fill('#code', 'M'); await pa.getByRole('button', { name: 'Uložit' }).click(); await pa.waitForTimeout(1500);
  check('duplicate code rejected', sql(`select count(*) from "Subject" where name='Matematika 2'`) === '0' && (await pa.locator('main').innerText()).includes('už existuje'));

  // import se třídou
  const csv = '﻿firstName;lastName;email;class;role;isActive;password\nJan;Student;jan.student@skola.cz;3.A;STUDENT;TRUE;password123\nEva;Studentová;eva.studentova@skola.cz;1a;STUDENT;TRUE;password123\nNový;Žák;novy.zak@skola.cz;2.B;STUDENT;TRUE;password123\nŠpatný;Řádek;spatny@skola.cz;9.Z;STUDENT;TRUE;x\n';
  const csvFile = tmpFile('import.csv', csv);
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  await pa.getByRole('button', { name: /Import/ }).first().click();
  await pa.setInputFiles('#csv-file', csvFile);
  await pa.getByRole('button', { name: /Importovat|Spustit import|Nahrát/ }).last().click(); await pa.waitForTimeout(3000);
  const dlg = await pa.locator('[role=dialog]').innerText();
  check('import result shows error line', dlg.includes('neplatná třída') && dlg.includes('9.Z'), dlg.replace(/\n/g, ' | ').slice(0, 300));
  check('import assigned classes', sql(`select string_agg(u.email||'='||c.grade||c.letter, ',' order by u.email) from "User" u join "ClassGroup" c on c.id=u."classGroupId"`) === `eva.studentova@skola.cz=1A,jan.student@skola.cz=3A,novy.zak@skola.cz=2B`);
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
  await pe.goto('/enrollments/' + wid); check('1st grader cannot open window', !(await pe.content()).includes('Zápis LS 2025'));

  // předměty: student vidí aktivní předměty svého ročníku a předměty nabízené v jemu viditelném zápisu
  await pj.goto('/subjects'); await pj.waitForLoadState('networkidle');
  const jan = await pj.locator('main').innerText();
  check('3rd grader sees Matematika (grade 3) and window label', jan.includes('Matematika') && jan.includes('v zápisu: Zápis LS 2025'), jan.slice(0, 300));
  await pe.goto('/subjects'); await pe.waitForLoadState('networkidle');
  const eva = await pe.locator('main').innerText();
  check('1st grader does not see Matematika (grade 3 only)', !eva.includes('Matematika') && eva.includes('Dějepis'), eva.slice(0, 300));
  check('1st grader does not see subjects only in a hidden window', !eva.includes('v zápisu'), eva.slice(0, 300));
  const mid = sql(`select id from "Subject" where name='Matematika'`);
  await pe.goto('/subjects/' + mid); check('1st grader cannot open subject of other grade', (await pe.content()).includes('Předmět nenalezen'));

  // filtry v seznamu pro admina: ročník
  await pa.goto('/subjects'); await pa.waitForLoadState('networkidle');
  await pa.getByRole('button', { name: 'Filtry' }).click();
  await pa.locator('[data-radix-popper-content-wrapper]').getByRole('combobox').first().click(); await pa.getByRole('option', { name: '1. ročník' }).click();
  const filtered = await pa.locator('table').innerText();
  check('grade filter hides Matematika', !filtered.includes('Matematika') && filtered.includes('Dějepis'), filtered.slice(0, 200));
  await pa.keyboard.press('Escape');

  // přesun mezi třídami: Jan 3.A → 4.A (okno pro 3. ročník mu zmizí), potom zpět
  await pa.goto('/users?tab=classes'); await pa.waitForLoadState('networkidle');
  await pa.locator('tr[data-class="3.A"] button[aria-expanded]').click();
  await pa.selectOption('select[aria-label="Přesunout do třídy – Student Jan"]', { label: '4.A' }); await pa.waitForTimeout(1500);
  check('student moved to 4.A with reason MOVED', sql(`select c.grade||c.letter||'/'||m.reason from "User" u join "ClassGroup" c on c.id=u."classGroupId" join "ClassMembership" m on m."userId"=u.id where u.email='jan.student@skola.cz'`) === '4A/MOVED');
  await pj.goto('/dashboard'); await pj.waitForLoadState('networkidle');
  check('4th grader does not see window for 3rd grade', !(await pj.content()).includes('Zápis LS 2025'));
  await pa.locator('tr[data-class="4.A"] button[aria-expanded]').click();
  await pa.selectOption('select[aria-label="Přesunout do třídy – Student Jan"]', { label: '3.A' }); await pa.waitForTimeout(1500);
  check('moved back to 3.A', sql(`select c.grade||c.letter from "User" u join "ClassGroup" c on c.id=u."classGroupId" where u.email='jan.student@skola.cz'`) === '3A');

  // hromadná akce „Přesunout do třídy“ v seznamu uživatelů
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  await pa.getByPlaceholder('Hledat podle jména nebo e-mailu…').fill('novy.zak');
  await pa.getByRole('button', { name: 'Hromadné akce' }).click();
  check('bulk panel offers "Přesunout do třídy"', (await pa.getByText('Přesunout do třídy').count()) > 0);
  await pa.getByText('Přesunout do třídy').locator('xpath=following-sibling::div').getByRole('combobox').click();
  await pa.getByRole('option', { name: '3.B', exact: true }).click();
  await pa.getByText('Přesunout do třídy').locator('xpath=following-sibling::div').getByRole('button', { name: 'OK' }).click(); await pa.waitForTimeout(1500);
  check('bulk move to class', sql(`select c.grade||c.letter from "User" u join "ClassGroup" c on c.id=u."classGroupId" where u.email='novy.zak@skola.cz'`) === '3B');

  // admin: přihlášení karta bez konfigurace
  await pa.goto('/admin'); await pa.waitForSelector('#auth-microsoft');
  check('admin auth card shows not configured', (await pa.locator('main').innerText()).includes('není nakonfigurováno'));
});

test("úvazky z detailu předmětu a z uživatelů", async ({ browser }) => {
  resetDb();
  const b = browser;
  sql(`insert into "Subject"(id,name,code,grades,"updatedAt") values ('sfy','Fyzika','F','{3,4}',now())`);
  sql(`insert into "ClassGroup"(id,grade,letter,"updatedAt") values ('c4a',4,'A',now()),('c4b',4,'B',now())`);
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('usr_t2','Marie','Druhá','t2@skola.cz','TEACHER',now())`);
  const tname = 'Učitel Petr';

  const pa = await login(b, 'admin@skola.cz');
  await pa.goto('/subjects/sfy'); await pa.waitForSelector('[data-testid=teaching-grid]');
  const grid = pa.locator('[data-testid=teaching-grid]');
  check('grid has rows only for subject grades 3 and 4', (await grid.locator('tbody tr').count()) === 2 && (await grid.locator('tbody tr[data-grade="1"]').count()) === 0);
  // přidat učitele do 3.A přímo z buňky
  await pa.selectOption('select[aria-label="Přidat učitele – 3.A"]', { label: tname }); await pa.waitForTimeout(1500);
  check('assignment saved immediately', sql(`select count(*) from "TeachingAssignment" t join "ClassGroup" c on c.id=t."classGroupId" where t."subjectId"='sfy' and c.grade=3 and c.letter='A' and t."teacherId"='usr_teacher'`) === '1');
  check('chip with teacher in cell', (await grid.locator('td[data-class="3.A"]').innerText()).includes('Petr'));
  // stejný učitel pro celý 4. ročník
  await pa.selectOption('select[aria-label="Učitel pro celý ročník – 4."]', { label: 'Druhá Marie' });
  await pa.locator('tr[data-grade="4"]').getByRole('button', { name: 'Stejný učitel pro celý ročník' }).click(); await pa.waitForTimeout(1500);
  check('same teacher for whole grade', sql(`select count(*) from "TeachingAssignment" where "subjectId"='sfy' and "teacherId"='usr_t2'`) === '2');
  // odebrání ×
  await pa.locator('td[data-class="3.A"] button[aria-label^="Odebrat"]').click(); await pa.waitForTimeout(1500);
  check('assignment removed', sql(`select count(*) from "TeachingAssignment" where "subjectId"='sfy' and "teacherId"='usr_teacher'`) === '0');

  // student vidí vyučující jen pro čtení
  const ps = await login(b, 'jan.student@skola.cz');
  sql(`update "Subject" set grades='{}' where id='sfy'`);
  await ps.goto('/subjects/sfy'); await ps.waitForSelector('[data-testid=teaching-grid]');
  check('student sees teachers read-only', (await ps.locator('[data-testid=teaching-grid]').innerText()).includes('Druhá') && (await ps.locator('[data-testid=teaching-grid] select').count()) === 0);
  sql(`update "Subject" set grades='{3,4}' where id='sfy'`);

  // Uživatelé → učitel → Úvazky
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  const row = pa.locator('tr', { hasText: 't2@skola.cz' });
  check('teacher row shows assignment count', (await row.locator('[data-testid=assignments-open]').innerText()).trim() === '2');
  await pa.locator('tr', { hasText: 'teacher@skola.cz' }).locator('[data-testid=assignments-open]').click();
  await pa.waitForSelector('#assign-subject');
  await pa.selectOption('#assign-subject', { label: 'Fyzika (F)' });
  check('class grid limited to subject grades', (await pa.locator('#assign-classes button').allInnerTexts()).join(',') === '3.A,3.B,4.A,4.B', (await pa.locator('#assign-classes button').allInnerTexts()).join(','));
  await pa.locator('#assign-classes [data-class="4.A"]').click(); await pa.locator('#assign-classes [data-class="3.B"]').click();
  await pa.getByTestId('assignments-add').click(); await pa.waitForTimeout(1500);
  check('assignments added from teacher dialog', sql(`select string_agg(c.grade||c.letter, ',' order by c.grade, c.letter) from "TeachingAssignment" t join "ClassGroup" c on c.id=t."classGroupId" where t."teacherId"='usr_teacher'`) === '3B,4A');
  check('dialog lists subject with class chips', (await pa.locator('[data-testid=teacher-assignments]').innerText()).includes('Fyzika'));
});
