import { test, expect } from "@playwright/test";
import { sql, resetDb, login, tryLogin, tmpFile, currentSchoolYear, yearLabel } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const Y = currentSchoolYear();
const userRow = (email: string) => sql(`select coalesce(c.grade||c.letter,'-')||'|'||u."studyStatus"||'|'||u."isActive"||'|'||coalesce(u."studyEndReason"::text,'')||'|'||coalesce(u."studyEndNote",'') from "User" u left join "ClassGroup" c on c.id=u."classGroupId" where email='${email}'`);
const hist = (email: string) => sql(`select string_agg(y."startYear"||':'||m.grade||c.letter||':'||m.reason, ',' order by y."startYear") from "ClassMembership" m join "User" u on u.id=m."userId" join "SchoolYear" y on y.id=m."schoolYearId" join "ClassGroup" c on c.id=m."classGroupId" where u.email='${email}'`);
const target = (name: string) => `select[aria-label="Cíl – ${name}"]`;

test.beforeAll(() => {
  resetDb();
});

test("uzavření školního roku: změna třídy, opakování, absolvování, odchod, úvazky; ukončení studia", async ({ browser }) => {
  const b = browser;

  const pa = await tryLogin(b, 'admin@skola.cz');
  check('admin logged in', pa.url().endsWith('/dashboard'));
  check('seed: Jan in 3.A with history', hist('jan.student@skola.cz') === `${Y}:3A:ASSIGNED`, hist('jan.student@skola.cz'));

  // třída 2.B pro změnu písmene při postupu; ostatní třídy založí import
  sql(`insert into "ClassGroup"(id,grade,letter,"updatedAt") values ('c2b',2,'B',now())`);
  const csv = '﻿firstName;lastName;email;class;role;isActive;password\n' + [
    ['Karel', 'Prvák', 'k1@skola.cz', '1.A'], ['Petr', 'Druhák', 'k2@skola.cz', '2.A'],
    ['Alena', 'Maturantka', 'k4a@skola.cz', '4.A'], ['Bohdan', 'Opakující', 'k4b@skola.cz', '4.A'],
    ['Cyril', 'Odchází', 'k3x@skola.cz', '3.B'],
  ].map(r => [...r, 'STUDENT', 'TRUE', 'password123'].join(';')).join('\n') + '\n';
  const csvFile = tmpFile('import2.csv', csv);
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  await pa.getByRole('button', { name: /Import/ }).first().click();
  await pa.setInputFiles('#csv-file', csvFile);
  await pa.waitForSelector('[data-testid=import-preview]');
  await pa.getByTestId('import-confirm').click(); await pa.waitForSelector('[data-testid=import-result]');
  check('imported with history', hist('k2@skola.cz') === `${Y}:2A:ASSIGNED`, hist('k2@skola.cz'));
  await pa.keyboard.press('Escape');

  // detail uživatele – historie
  await pa.goto('/users/usr_stud1?tab=classes'); await pa.waitForSelector('[data-testid=user-classes]');
  check('detail shows class history', (await pa.getByTestId('user-classes').innerText()).includes(yearLabel(Y)) && (await pa.getByTestId('user-classes').innerText()).includes('3.A'));

  // úvazky pro test převzetí: Učitel – Matematika ve 3.A a 4.A; Fyzika jen pro 4. ročník (do nižšího se nepřevezme)
  sql(`insert into "Subject"(id,name,code,"updatedAt") values ('sm','Matematika','M',now())`);
  sql(`insert into "Subject"(id,name,code,grades,"updatedAt") values ('sf4','Fyzika','F','{4}',now())`);
  sql(`insert into "TeachingAssignment"(id,"teacherId","subjectId","classGroupId","schoolYearId") select 'ta_'||s.id||c.grade||c.letter, 'usr_teacher', s.id, c.id, (select id from "SchoolYear" where "isCurrent") from "ClassGroup" c, "Subject" s where (s.id='sm' and c.letter='A' and c.grade in (3,4)) or (s.id='sf4' and c.letter='A' and c.grade=4)`);

  // ruční změna roku je skrytá, protože už jsou zařazení studenti
  await pa.goto('/admin/school-year'); await pa.waitForSelector('[data-testid=school-year-card]');
  check('manual year switch hidden', (await pa.locator('#school-year').count()) === 0);

  // průvodce: Jan 3.A (výchozí postup do 4.A), 3.B hromadně do 4.A + výjimka Cyril odchází
  await pa.goto('/admin/close-year'); await pa.waitForLoadState('networkidle');
  await pa.selectOption('select[aria-label="Všem ve třídě 3.B"]', 'PROMOTE:A');
  check('bulk promotes class to 4.A', await pa.locator(target('Studentová Eva')).inputValue() === 'PROMOTE:A');
  await pa.selectOption(target('Odchází Cyril'), 'LEAVE');
  await pa.selectOption('select[aria-label="Důvod ukončení – Odchází Cyril"]', 'TRANSFER');
  await pa.fill('input[aria-label="Poznámka – Odchází Cyril"]', 'přestup na gymnázium');
  // změna písmene při postupu a opakování ročníku
  await pa.selectOption(target('Prvák Karel'), 'PROMOTE:B');
  await pa.selectOption(target('Druhák Petr'), 'REPEAT:A');
  await pa.selectOption(target('Opakující Bohdan'), 'REPEAT:A');
  await pa.click('[data-testid=to-summary]');
  const summary = (await pa.locator('[data-testid=closure-summary]').innerText()).replace(/\s+/g, ' ');
  check('summary counts', summary.includes('3 Postoupí') && summary.includes('2 Opakuje ročník') && summary.includes('1 Absolvuje') && summary.includes('1 Ukončí studium'), summary);
  const targets = (await pa.locator('[data-testid=closure-targets]').innerText()).replace(/\s+/g, ' ');
  check('summary lists target classes', /2\.A 1/.test(targets) && /2\.B 1/.test(targets) && /4\.A 3/.test(targets), targets);
  check('summary lists graduates and leavers', (await pa.locator('main').innerText()).includes('Maturantka') && (await pa.locator('main').innerText()).includes('Odchází Cyril (přestup)'));
  await pa.selectOption('#assignment-mode', 'WITH_CLASS');
  await pa.click('[data-testid=close-year]');
  await pa.getByRole('button', { name: 'Uzavřít rok', exact: true }).click();
  await pa.waitForURL('**/admin/school-year', { timeout: 30000 }); await pa.waitForLoadState('networkidle');

  check(`current year is ${Y + 1}`, sql(`select "startYear" from "SchoolYear" where "isCurrent"`) === `${Y + 1}`);
  check('Jan promoted to 4.A', userRow('jan.student@skola.cz') === `4A|ACTIVE|true||` && hist('jan.student@skola.cz') === `${Y}:3A:ASSIGNED,${Y + 1}:4A:PROMOTED`, hist('jan.student@skola.cz'));
  check('1st grader promoted into other letter', userRow('k1@skola.cz') === `2B|ACTIVE|true||` && hist('k1@skola.cz') === `${Y}:1A:ASSIGNED,${Y + 1}:2B:PROMOTED`, hist('k1@skola.cz'));
  check('3.B promoted in bulk', userRow('eva.studentova@skola.cz') === `4A|ACTIVE|true||` && hist('eva.studentova@skola.cz').endsWith(`${Y + 1}:4A:PROMOTED`), hist('eva.studentova@skola.cz'));
  check('2nd grader repeats', userRow('k2@skola.cz') === `2A|ACTIVE|true||` && hist('k2@skola.cz') === `${Y}:2A:ASSIGNED,${Y + 1}:2A:REPEATED`, userRow('k2@skola.cz') + ' ' + hist('k2@skola.cz'));
  check('4th grader repeats', userRow('k4b@skola.cz') === `4A|ACTIVE|true||` && hist('k4b@skola.cz') === `${Y}:4A:ASSIGNED,${Y + 1}:4A:REPEATED`, userRow('k4b@skola.cz') + ' ' + hist('k4b@skola.cz'));
  check('graduate deactivated, keeps class', userRow('k4a@skola.cz') === `4A|GRADUATED|false|GRADUATED|`, userRow('k4a@skola.cz'));
  check('leaver deactivated with note', userRow('k3x@skola.cz') === `3B|LEFT|false|TRANSFER|přestup na gymnázium`, userRow('k3x@skola.cz'));
  check('teacher and guests untouched', sql(`select count(*) from "ClassMembership" m join "User" u on u.id=m."userId" where u.role <> 'STUDENT'`) === '0');
  check('assignments go with the class (3.A → 4.A; 4th grade skipped)', sql(`select string_agg(s.code||'='||c.grade||c.letter, ',' order by s.code) from "TeachingAssignment" t join "ClassGroup" c on c.id=t."classGroupId" join "SchoolYear" y on y.id=t."schoolYearId" join "Subject" s on s.id=t."subjectId" where y."startYear"=${Y + 1}`) === 'M=4A', sql(`select count(*) from "TeachingAssignment"`));
  check('old year assignments kept', sql(`select count(*) from "TeachingAssignment" t join "SchoolYear" y on y.id=t."schoolYearId" where y."startYear"=${Y}`) === '3');

  // UI po uzavření
  await pa.waitForSelector('[data-testid=current-year]');
  check('admin sees new school year', (await pa.locator('[data-testid=current-year]').innerText()).startsWith(`${Y + 1}/`));
  await pa.goto('/users'); await pa.waitForLoadState('networkidle');
  const table = await pa.locator('table').innerText();
  check('users table: graduate label', /4\.A\s*·\s*absolvent/.test(table));
  check('users table: repeater 2.A', table.includes('Druhák') && /Petr[\s\S]*?2\.A/.test(table));
  const pg = await tryLogin(b, 'k4a@skola.cz');
  check('graduate cannot log in', !pg.url().endsWith('/dashboard'), pg.url());

  // ukončení studia během roku přes dialog + obnovení
  // (dialogy jsou v detailu uživatele, ne v seznamu)
  await pa.goto('/users/usr_stud2'); await pa.waitForSelector('[data-testid=study-open]');
  await pa.click('[data-testid=study-open]');
  await pa.click('#study-reason'); await pa.getByRole('option', { name: 'zanechání studia' }).click();
  await pa.fill('#study-note', 'na vlastní žádost');
  await pa.click('[data-testid=study-submit]'); await pa.waitForTimeout(2000);
  check('mid-year end study', userRow('eva.studentova@skola.cz').startsWith('4A|LEFT|false|WITHDRAWAL'), userRow('eva.studentova@skola.cz'));
  await pa.reload(); await pa.waitForSelector('[data-testid=study-open]');
  check('detail shows the ended study', (await pa.getByTestId('user-study').innerText()).includes('ukončil'), await pa.getByTestId('user-study').innerText());
  await pa.click('[data-testid=study-open]');
  await pa.click('[data-testid=study-submit]'); await pa.waitForTimeout(2000);
  check('restore study', userRow('eva.studentova@skola.cz').startsWith('4A|ACTIVE|true|'), userRow('eva.studentova@skola.cz'));
});

test("uzavření roku: úvazky ponechat u stejných tříd / nepřebírat, upozornění", async ({ browser }) => {
  resetDb();
  const b = browser;
  sql(`insert into "Subject"(id,name,code,"updatedAt") values ('sm','Matematika','M',now())`);
  sql(`insert into "TeachingAssignment"(id,"teacherId","subjectId","classGroupId","schoolYearId") select 'ta1','usr_teacher','sm',c.id,y.id from "ClassGroup" c, "SchoolYear" y where c.grade=3 and c.letter='A' and y."isCurrent"`);
  const pa = await login(b, 'admin@skola.cz');
  await pa.goto('/admin/close-year'); await pa.waitForLoadState('networkidle');
  // výchozí cíl 4.A ještě neexistuje → v souhrnu upozornění, že se založí (a že 3.A a 3.B zůstanou prázdné)
  check('default target offered as new class', (await pa.locator(target('Student Jan')).innerText()).includes('postup do 4.A (nová)'));
  await pa.click('[data-testid=to-summary]');
  const warn = await pa.locator('[data-testid=closure-warnings]').innerText();
  check('warns about new class and empty classes', warn.includes('Nově se založí třídy: 4.A') && warn.includes('Po uzavření roku nebudou mít žádné studenty'), warn);
  await pa.selectOption('#assignment-mode', 'SAME');
  await pa.click('[data-testid=close-year]');
  await pa.getByRole('button', { name: 'Uzavřít rok', exact: true }).click();
  await pa.waitForURL('**/admin/school-year', { timeout: 30000 });
  check('new class created on closure', sql(`select count(*) from "ClassGroup" where grade=4 and letter='A'`) === '1');
  check('assignment kept at same class', sql(`select string_agg(c.grade||c.letter, ',') from "TeachingAssignment" t join "ClassGroup" c on c.id=t."classGroupId" join "SchoolYear" y on y.id=t."schoolYearId" where y."startYear"=${Y + 1}`) === '3A');
});
