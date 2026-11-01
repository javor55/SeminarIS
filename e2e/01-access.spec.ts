import { test, expect } from "@playwright/test";
import { sql, resetDb, login, tryLogin, navLabels } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

test.beforeAll(() => {
  resetDb();
});

test("role, oprávnění, moduly, okamžitá změna role", async ({ browser }) => {


  // --- Student ---
  let p = await login(browser, 'jan.student@skola.cz');
  // F12: student s jediným otevřeným oknem a bez termínů dopisování skončí rovnou v zápisu, bez lišty záložek;
  // Dashboard, Předměty, Moje předměty a profil nejsou v menu (jsou v menu účtu)
  check('student lands on the only open window', p.url().endsWith('/zapisy/enr_ls_2025'), p.url());
  check('student nav: one tab means no bar', (await navLabels(p)).length === 0 && (await p.getByTestId('student-bottom-nav').count()) === 0, JSON.stringify(await navLabels(p)));
  check('student has the account menu', (await p.getByTestId('account-menu').count()) === 1);
  await p.goto('/dashboard'); await p.waitForLoadState('networkidle');
  check('student dashboard card shows window', (await p.locator('[data-card="seminars.windows"]').innerText()).includes('Zápis LS 2025'));
  check('student dashboard does not enroll (no enroll buttons)', (await p.getByTestId('enroll-button').count()) === 0);
  await p.goto('/users'); check('student /users redirected', p.url().endsWith('/dashboard'), p.url());
  await p.goto('/enrollments'); check('student /enrollments redirected', p.url().endsWith('/dashboard'), p.url());
  const subjId = sql(`select "subjectId" from "SubjectOccurrence" limit 1`);
  await p.goto('/subjects/' + subjId);
  const html = await p.content();
  check('no password hash in student page', !html.includes('passwordHash') && !html.includes('$2a$') && !html.includes('$2b$'));
  // zápis přes UI na stránce Zápisy: karta na dashboardu vede na seznam a detail okna
  await p.goto('/dashboard'); await p.waitForLoadState('networkidle');
  await p.locator('[data-card="seminars.windows"]').getByRole('link', { name: 'Upravit zápis' }).click();
  await p.waitForURL('**/zapisy/*');
  await p.goto('/zapisy'); await p.waitForURL('**/zapisy/enr_ls_2025');
  check('/zapisy leads straight to the only window', p.url().endsWith('/zapisy/enr_ls_2025'), p.url());
  await p.goto('/zapisy?vse=1'); await p.waitForLoadState('networkidle');
  check('zapisy list (?vse=1) shows the window', (await p.getByTestId('student-window').count()) === 1 && (await p.getByTestId('student-window').innerText()).includes('Zápis LS 2025'));
  await p.getByTestId('student-window').getByRole('link', { name: 'Upravit zápis' }).click(); await p.waitForURL('**/zapisy/*'); await p.waitForLoadState('networkidle');
  const btn = p.getByTestId('enroll-button').first();
  if (await btn.count()) {
    await btn.click(); await p.waitForTimeout(2500);
    check('student enrolled via UI', sql(`select count(*) from "StudentEnrollment" e join "User" u on u.id=e."studentId" where u.email='jan.student@skola.cz' and e."deletedAt" is null`) !== '0');
  } else check('enroll button found', false);

  // role změna platí hned (bez nového přihlášení)
  sql(`update "User" set role='GUEST' where email='jan.student@skola.cz'`);
  await p.goto('/dashboard'); await p.waitForLoadState('networkidle'); await p.reload(); await p.waitForLoadState('networkidle');
  check('role change applied without relogin', JSON.stringify(await navLabels(p)) === JSON.stringify(['Zápisy']), JSON.stringify(await navLabels(p)));
  sql(`update "User" set role='STUDENT' where email='jan.student@skola.cz'`);
  // deaktivace odhlásí
  sql(`update "User" set "isActive"=false where email='eva.studentova@skola.cz'`);
  const pe = await tryLogin(browser, 'eva.studentova@skola.cz');
  check('inactive user cannot log in', !pe.url().endsWith('/dashboard'), pe.url());
  sql(`update "User" set "isActive"=true where email='eva.studentova@skola.cz'`);

  // --- Teacher ---
  p = await login(browser, 'teacher@skola.cz');
  check('teacher nav', JSON.stringify(await navLabels(p)) === JSON.stringify(['Dashboard', 'Zápisy', 'Předměty', 'Moje předměty', 'Dopisování', 'Uživatelé', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(p)));
  await p.goto('/admin/registration'); check('teacher /admin/registration redirected', p.url().endsWith('/dashboard'), p.url());
  await p.goto('/zapisy'); check('teacher /zapisy redirected', p.url().endsWith('/dashboard'), p.url());
  await p.goto('/zapisy/' + sql(`select id from "EnrollmentWindow" limit 1`)); check('teacher /zapisy/id redirected', p.url().endsWith('/dashboard'), p.url());
  await p.goto('/users'); await p.waitForLoadState('networkidle');
  check('teacher /users ok', p.url().endsWith('/users') && !(await p.content()).includes('$2'));

  // --- Admin ---
  const pa = await login(browser, 'admin@skola.cz');
  check('admin nav', JSON.stringify(await navLabels(pa)) === JSON.stringify(['Dashboard', 'Zápisy', 'Předměty', 'Dopisování', 'Uživatelé', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(pa)));
  await pa.goto('/admin'); await pa.waitForSelector('[data-testid=admin-stats]');
  const text = await pa.locator('main').innerText();
  check('admin stats', text.includes('Uživatelé celkem') && text.includes('Aktivní předměty') && text.includes('Otevřené zápisy'));
  // detail předmětu: panel zápisů a štítek „v zápisu“ dodává modul Semináře (body rozšíření)
  const panel = pa.locator('[data-subject-tab="seminars.occurrences"]');
  await pa.goto('/subjects/' + subjId); await pa.waitForLoadState('networkidle');
  check('subject detail has seminars tab link', (await pa.locator('[data-testid=subject-tabs] [data-tab="seminars.occurrences"]').count()) === 1);
  await pa.goto('/subjects/' + subjId + '?tab=seminars.occurrences'); await pa.waitForLoadState('networkidle');
  check('subject detail has seminars panel', (await panel.count()) === 1 && (await pa.getByTestId('subject-occurrences').count()) === 1);
  await pa.goto('/subjects/' + subjId); await pa.waitForLoadState('networkidle');
  check('subject detail has "v zápisu" badge', (await pa.getByTestId('subject-badges').innerText()).includes('v zápisu: Zápis LS 2025'));
  await pa.goto('/subjects'); await pa.waitForLoadState('networkidle');
  check('subject list has "v zápisu" badge', (await pa.getByTestId('subject-badges').first().innerText()).includes('v zápisu'));
  await pa.goto('/admin/modules'); await pa.waitForSelector('#module-seminars');
  // vypnout semináře
  await pa.click('#module-seminars'); await pa.waitForTimeout(2500);
  check('setting stored', sql(`select value from "SystemSetting" where key='module.seminars.enabled'`) === 'false');
  check('admin nav without seminars', JSON.stringify(await navLabels(pa)) === JSON.stringify(['Dashboard', 'Předměty', 'Dopisování', 'Uživatelé', 'Administrace', 'Můj profil']), JSON.stringify(await navLabels(pa)));
  await pa.goto('/admin'); await pa.waitForSelector('[data-testid=admin-stats]');
  const text2 = await pa.locator('main').innerText();
  check('stats without seminars', !text2.includes('Aktivní předměty'));
  // předměty jsou v jádru, jdou vypnout jen zápisy
  await pa.goto('/subjects/' + subjId); await pa.waitForLoadState('networkidle');
  check('subject detail without seminars tab', (await pa.locator('[data-testid=subject-tabs] [data-tab^="seminars."]').count()) === 0 && (await pa.getByTestId('subject-occurrences').count()) === 0);
  await pa.goto('/subjects/' + subjId + '?tab=seminars.occurrences'); await pa.waitForLoadState('networkidle');
  check('forced seminars tab falls back to overview', (await pa.locator('[data-subject-tab="overview"]').count()) === 1 && (await pa.getByTestId('subject-occurrences').count()) === 0);
  await pa.goto('/subjects/' + subjId); await pa.waitForLoadState('networkidle');
  check('subject detail without "v zápisu" badge', (await pa.getByTestId('subject-badges').count()) === 0 && !(await pa.content()).includes('v zápisu:'));
  await pa.goto('/subjects'); await pa.waitForLoadState('networkidle');
  check('subject list without "v zápisu" badge', !(await pa.locator('main').innerText()).includes('v zápisu'));
  const r = await pa.goto('/subjects'); check('/subjects stays when seminars disabled', r.status() === 200, String(r.status()));
  const r2 = await pa.goto('/enrollments'); check('/enrollments 404 when disabled', r2.status() === 404, String(r2.status()));
  await pa.goto('/zapisy'); check('/zapisy leaves admin on dashboard', pa.url().endsWith('/dashboard'), pa.url());
  await pa.goto('/dashboard'); check('dashboard empty when disabled', (await pa.content()).includes('Přehled'));
  // student: zápis přes action musí selhat → ověř přes dashboard a nav
  const ps = await login(browser, 'eva.studentova@skola.cz');
  // bez seminářů a bez termínů dopisování nemá student žádnou záložku: prázdný stav s menu účtu
  check('student nav without seminars', (await navLabels(ps)).length === 0 && (await ps.getByTestId('student-empty').count()) === 1, JSON.stringify(await navLabels(ps)));
  const rz = await ps.goto('/zapisy'); check('/zapisy 404 when disabled', rz.status() === 404, String(rz.status()));
  await ps.goto('/dashboard'); check('student dashboard card gone when disabled', (await ps.locator('[data-card^="seminars."]').count()) === 0);
  // zapnout zpět
  await pa.goto('/admin/modules'); await pa.waitForSelector('#module-seminars'); await pa.waitForTimeout(800);
  await pa.click('#module-seminars'); await pa.waitForTimeout(2500);
  check('seminars re-enabled', JSON.stringify(await navLabels(pa)).includes('Zápisy'));
  await pa.goto('/subjects/' + subjId); await pa.waitForLoadState('networkidle');
  check('subject detail seminars tab back', (await pa.locator('[data-testid=subject-tabs] [data-tab="seminars.occurrences"]').count()) === 1);
  await pa.goto('/dashboard'); check('admin progress card back', (await pa.locator('[data-card="seminars.progress"]').count()) === 1 && (await pa.content()).includes('Zápis LS 2025'));
  await ps.goto('/dashboard'); check('student card back', (await ps.locator('[data-card="seminars.windows"]').count()) === 1);


});
