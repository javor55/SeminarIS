import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, tryLogin, navLabels, toastText, tmpFile, currentSchoolYear, yearLabel } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

test.beforeAll(() => {
  resetDb();
});

test("role, oprávnění, moduly, okamžitá změna role", async ({ browser }) => {


  // --- Student ---
  let p = await login(browser, 'jan.student@skola.cz');
  check('student nav', JSON.stringify(await navLabels(p)) === JSON.stringify(['Dashboard', 'Semináře', 'Dopisování', 'Můj profil']), JSON.stringify(await navLabels(p)));
  check('student dashboard shows window', (await p.content()).includes('Zápis LS 2025'));
  await p.goto('/users'); check('student /users redirected', p.url().endsWith('/dashboard'), p.url());
  await p.goto('/enrollments'); check('student /enrollments redirected', p.url().endsWith('/dashboard'), p.url());
  const subjId = sql(`select "seminarId" from "SubjectOccurrence" limit 1`);
  await p.goto('/subjects/' + subjId);
  const html = await p.content();
  check('no password hash in student page', !html.includes('passwordHash') && !html.includes('$2a$') && !html.includes('$2b$'));
  // zápis přes UI
  await p.goto('/dashboard'); await p.waitForLoadState('networkidle');
  const btn = p.getByRole('button', { name: /Zapsat/ }).first();
  if (await btn.count()) {
    await btn.click(); await p.waitForTimeout(2500);
    check('student enrolled via UI', sql(`select count(*) from "StudentEnrollment" e join "User" u on u.id=e."studentId" where u.email='jan.student@skola.cz' and e."deletedAt" is null`) !== '0');
  } else check('enroll button found', false);

  // role změna platí hned (bez nového přihlášení)
  sql(`update "User" set role='GUEST' where email='jan.student@skola.cz'`);
  await p.goto('/dashboard'); await p.waitForLoadState('networkidle'); await p.reload(); await p.waitForLoadState('networkidle');
  check('role change applied without relogin', JSON.stringify(await navLabels(p)) === '[]', JSON.stringify(await navLabels(p)));
  sql(`update "User" set role='STUDENT' where email='jan.student@skola.cz'`);
  // deaktivace odhlásí
  sql(`update "User" set "isActive"=false where email='eva.studentova@skola.cz'`);
  const pe = await tryLogin(browser, 'eva.studentova@skola.cz');
  check('inactive user cannot log in', !pe.url().endsWith('/dashboard'), pe.url());
  sql(`update "User" set "isActive"=true where email='eva.studentova@skola.cz'`);

  // --- Teacher ---
  p = await login(browser, 'teacher@skola.cz');
  check('teacher nav', JSON.stringify(await navLabels(p)) === JSON.stringify(['Dashboard', 'Zápisy', 'Semináře', 'Dopisování', 'Uživatelé', 'Můj profil']), JSON.stringify(await navLabels(p)));
  await p.goto('/admin'); check('teacher /admin redirected', p.url().endsWith('/dashboard'), p.url());
  await p.goto('/users'); await p.waitForLoadState('networkidle');
  check('teacher /users ok', p.url().endsWith('/users') && !(await p.content()).includes('$2'));

  // --- Admin ---
  const pa = await login(browser, 'admin@skola.cz');
  check('admin nav', JSON.stringify(await navLabels(pa)) === JSON.stringify(['Dashboard', 'Zápisy', 'Semináře', 'Dopisování', 'Uživatelé', 'Škola', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(pa)));
  await pa.goto('/admin'); await pa.waitForSelector('#module-seminars');
  await pa.waitForTimeout(1000);
  const text = await pa.locator('main').innerText();
  check('admin stats', text.includes('Uživatelé celkem') && text.includes('Aktivní semináře') && text.includes('Otevřené zápisy'));
  // vypnout semináře
  await pa.click('#module-seminars'); await pa.waitForTimeout(2500);
  check('setting stored', sql(`select value from "SystemSetting" where key='module.seminars.enabled'`) === 'false');
  check('admin nav without seminars', JSON.stringify(await navLabels(pa)) === JSON.stringify(['Dashboard', 'Dopisování', 'Uživatelé', 'Škola', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(pa)));
  const text2 = await pa.locator('main').innerText();
  check('stats without seminars', !text2.includes('Aktivní semináře'));
  const r = await pa.goto('/subjects'); check('/subjects 404 when disabled', r.status() === 404, String(r.status()));
  await pa.goto('/dashboard'); check('dashboard empty when disabled', (await pa.content()).includes('Vítejte'));
  // student: zápis přes action musí selhat → ověř přes dashboard a nav
  const ps = await login(browser, 'eva.studentova@skola.cz');
  check('student nav without seminars', JSON.stringify(await navLabels(ps)) === JSON.stringify(['Dashboard', 'Dopisování', 'Můj profil']), JSON.stringify(await navLabels(ps)));
  // zapnout zpět
  await pa.goto('/admin'); await pa.waitForSelector('#module-seminars'); await pa.waitForTimeout(800);
  await pa.click('#module-seminars'); await pa.waitForTimeout(2500);
  check('seminars re-enabled', JSON.stringify(await navLabels(pa)).includes('Zápisy'));
  await pa.goto('/dashboard'); check('dashboard back', (await pa.content()).includes('Zápis LS 2025'));


});
