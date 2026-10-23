import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, tryLogin, navLabels, toastText, tmpFile, currentSchoolYear, yearLabel } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const Y = currentSchoolYear();
const userRow = (email: string) => sql(`select coalesce(c."entryYear"||c.letter,'-')||'|'||u."studyStatus"||'|'||u."isActive"||'|'||coalesce(u."studyEndReason"::text,'') from "User" u left join "ClassGroup" c on c.id=u."classGroupId" where email='${email}'`);
const hist = (email: string) => sql(`select string_agg(y."startYear"||':'||m.grade||c.letter||':'||m.reason, ',' order by y."startYear") from "ClassMembership" m join "User" u on u.id=m."userId" join "SchoolYear" y on y.id=m."schoolYearId" join "ClassGroup" c on c.id=m."classGroupId" where u.email='${email}'`);

test.beforeAll(() => {
  resetDb();
});

test("uzavření školního roku: postup, absolvování, opakování, odchod; ukončení studia", async ({ browser }) => {
  const b = browser;

  const pa = await tryLogin(b, 'admin@skola.cz');
  check('admin logged in', pa.url().endsWith('/dashboard'));
  check('seed: Jan in 3.A with history', hist('jan.student@skola.cz') === `${Y}:3A:ASSIGNED`, hist('jan.student@skola.cz'));

  // import dalších studentů
  const csv = '﻿firstName;lastName;email;class;role;isActive;password\n' + [
    ['Karel', 'Prvák', 'k1@skola.cz', '1.A'], ['Petr', 'Druhák', 'k2@skola.cz', '2.A'],
    ['Alena', 'Maturantka', 'k4a@skola.cz', '4.A'], ['Bohdan', 'Opakující', 'k4b@skola.cz', '4.A'],
    ['Cyril', 'Odchází', 'k3x@skola.cz', '3.B'],
  ].map(r => [...r, 'STUDENT', 'TRUE', 'password123'].join(';')).join('\n') + '\n';
  const csvFile = tmpFile('import2.csv', csv);
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  await pa.getByRole('button', { name: /Import/ }).first().click();
  await pa.setInputFiles('#csv-file', csvFile);
  await pa.getByRole('button', { name: /Importovat|Spustit import|Nahrát/ }).last().click(); await pa.waitForTimeout(3000);
  check('imported with history', hist('k2@skola.cz') === `${Y}:2A:ASSIGNED`, hist('k2@skola.cz'));
  await pa.keyboard.press('Escape');

  // detail uživatele – historie
  await pa.reload(); await pa.waitForLoadState('networkidle');
  const row = pa.locator('tr', { hasText: 'jan.student@skola.cz' });
  await row.locator('button:has(svg.lucide-eye)').click(); await pa.waitForTimeout(800);
  check('details show class history', (await pa.locator('[data-testid=class-history]').innerText()).includes(`${yearLabel(Y)}: 3.A`));
  await pa.keyboard.press('Escape');

  // úvazky pro test převzetí: Učitel – M ve 3.A a 4.A
  sql(`insert into "Subject"(id,name,code,"updatedAt") values ('sm','Matematika','M',now())`);
  sql(`insert into "TeachingAssignment"(id,"teacherId","subjectId","classGroupId","schoolYearId") select 'ta'||c.letter||c."entryYear", 'usr_teacher','sm',c.id,(select id from "SchoolYear" where "isCurrent") from "ClassGroup" c where (c."entryYear"=${Y - 2} and c.letter='A') or (c."entryYear"=${Y - 3} and c.letter='A')`);

  // ruční změna roku je skrytá, protože už jsou zařazení studenti
  await pa.goto('/school'); await pa.waitForLoadState('networkidle');
  check('manual year switch hidden', (await pa.locator('#school-year').count()) === 0);

  // průvodce
  await pa.goto('/school/close-year'); await pa.waitForLoadState('networkidle');
  await pa.selectOption('select[aria-label="Výsledek – Druhák Petr"]', 'REPEAT');
  await pa.selectOption('select[aria-label="Výsledek – Opakující Bohdan"]', 'REPEAT');
  await pa.selectOption('select[aria-label="Výsledek – Odchází Cyril"]', 'LEAVE');
  await pa.selectOption('select[aria-label="Důvod ukončení – Odchází Cyril"]', 'TRANSFER');
  const summary = await pa.locator('[data-testid=closure-summary]').innerText();
  check('summary counts', summary.replace(/\s+/g, ' ').includes('3 Postoupí 1 Absolvuje 2 Opakuje ročník 1 Ukončí studium'), summary.replace(/\s+/g, ' '));
  await pa.click('[data-testid=close-year]');
  await pa.getByRole('button', { name: 'Uzavřít rok', exact: true }).click();
  await pa.waitForURL('**/school', { timeout: 30000 }); await pa.waitForLoadState('networkidle');

  check(`current year is ${Y + 1}`, sql(`select "startYear" from "SchoolYear" where "isCurrent"`) === `${Y + 1}`);
  check('Jan promoted', userRow('jan.student@skola.cz') === `${Y - 2}A|ACTIVE|true|` && hist('jan.student@skola.cz') === `${Y}:3A:ASSIGNED,${Y + 1}:4A:PROMOTED`, hist('jan.student@skola.cz'));
  check('1st grader promoted', hist('k1@skola.cz') === `${Y}:1A:ASSIGNED,${Y + 1}:2A:PROMOTED`, hist('k1@skola.cz'));
  check('2nd grader repeats into younger class', userRow('k2@skola.cz') === `${Y}A|ACTIVE|true|` && hist('k2@skola.cz') === `${Y}:2A:ASSIGNED,${Y + 1}:2A:REPEATED`, userRow('k2@skola.cz') + ' ' + hist('k2@skola.cz'));
  check('4th grader repeats', userRow('k4b@skola.cz') === `${Y - 2}A|ACTIVE|true|` && hist('k4b@skola.cz') === `${Y}:4A:ASSIGNED,${Y + 1}:4A:REPEATED`, userRow('k4b@skola.cz') + ' ' + hist('k4b@skola.cz'));
  check('graduate deactivated', userRow('k4a@skola.cz') === `${Y - 3}A|GRADUATED|false|GRADUATED`, userRow('k4a@skola.cz'));
  check('leaver deactivated', userRow('k3x@skola.cz') === `${Y - 2}B|LEFT|false|TRANSFER`, userRow('k3x@skola.cz'));
  check('new 1st grades', sql(`select string_agg(letter, ',' order by letter) from "ClassGroup" where "entryYear"=${Y + 1}`) === 'A,B,C');
  check('assignments copied (not graduating class)', sql(`select string_agg(c."entryYear"||c.letter, ',') from "TeachingAssignment" t join "ClassGroup" c on c.id=t."classGroupId" join "SchoolYear" y on y.id=t."schoolYearId" where y."startYear"=${Y + 1}`) === `${Y - 2}A`);

  // UI po uzavření
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  const table = await pa.locator('table').innerText();
  check('users table: graduate label', /4\.A\s*·\s*absolvent/.test(table));
  check('users table: repeater 2.A', table.includes('Druhák') && /Petr[\s\S]*?2\.A/.test(table));
  const pg = await tryLogin(b, 'k4a@skola.cz');
  check('graduate cannot log in', !pg.url().endsWith('/dashboard'), pg.url());

  // ukončení studia během roku přes dialog + obnovení
  await pa.reload(); await pa.waitForLoadState('networkidle');
  await pa.locator('tr', { hasText: 'eva.studentova@skola.cz' }).locator('button[title="Ukončit studium"]').click();
  await pa.click('#study-reason'); await pa.getByRole('option', { name: 'zanechání studia' }).click();
  await pa.fill('#study-note', 'na vlastní žádost');
  await pa.click('[data-testid=study-submit]'); await pa.waitForTimeout(2000);
  check('mid-year end study', userRow('eva.studentova@skola.cz').endsWith('|LEFT|false|WITHDRAWAL'), userRow('eva.studentova@skola.cz'));
  await pa.reload(); await pa.waitForLoadState('networkidle');
  await pa.locator('tr', { hasText: 'eva.studentova@skola.cz' }).locator('button[title="Obnovit studium"]').click();
  await pa.click('[data-testid=study-submit]'); await pa.waitForTimeout(2000);
  check('restore study', userRow('eva.studentova@skola.cz').endsWith('|ACTIVE|true|'), userRow('eva.studentova@skola.cz'));

  // druhé uzavření stejného roku z neaktuální stránky musí selhat
});
