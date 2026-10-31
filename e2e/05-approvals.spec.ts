import { test, expect } from "@playwright/test";
import { sql, resetDb, login, tryLogin } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const userInfo = (email: string) => sql(`select u.role||'|'||u."isActive"||'|'||coalesce(c.grade||c.letter,'-')||'|'||coalesce(r.grade||r.letter,'-') from "User" u left join "ClassGroup" c on c.id=u."classGroupId" left join "ClassGroup" r on r.id=u."requestedClassGroupId" where email='${email}'`);

test.beforeAll(() => {
  resetDb();
});

test("registrace se třídou a schválení hosta jedním klikem", async ({ browser }) => {
  const b = browser;
  const pa = await login(b, 'admin@skola.cz');

  // výběr třídy při registraci je ve výchozím stavu vypnutý
  const p0 = await (await b.newContext()).newPage();
  await p0.goto('/register'); await p0.waitForSelector('#firstName');
  await p0.waitForTimeout(800);
  check('class select hidden by default', (await p0.locator('#classGroupId').count()) === 0);

  // admin zapne volitelný výběr třídy
  await pa.goto('/admin/registration'); await pa.waitForSelector('#setting-registration_class_mode');
  await pa.selectOption('#setting-registration_class_mode', 'optional'); await pa.waitForTimeout(1200);
  check('class mode stored', sql(`select value from "SystemSetting" where key='registration_class_mode'`) === 'optional');

  // registrace se žádostí o třídu
  await p0.goto('/register'); await p0.waitForSelector('#classGroupId');
  await p0.fill('#firstName', 'Nová'); await p0.fill('#lastName', 'Žákyně'); await p0.fill('#email', 'nova@skola.cz'); await p0.fill('#password', 'password123');
  await p0.selectOption('#classGroupId', { label: '3.B' });
  await p0.getByRole('button', { name: 'Vytvořit účet' }).click(); await p0.waitForURL('**/dashboard', { timeout: 20000 });
  check('registered as guest with requested class', userInfo('nova@skola.cz') === 'GUEST|true|-|3B', userInfo('nova@skola.cz'));

  // host na dashboardu vidí výzvu a může žádost změnit
  await p0.waitForSelector('[data-testid=class-request]');
  check('guest sees class prompt with requested class', (await p0.locator('#requested-class').inputValue()) === sql(`select id from "ClassGroup" where grade=3 and letter='B'`));
  await p0.selectOption('#requested-class', { label: '3.A' });
  await p0.getByRole('button', { name: 'Uložit' }).click(); await p0.waitForTimeout(1500);
  check('guest changed requested class', userInfo('nova@skola.cz') === 'GUEST|true|-|3A', userInfo('nova@skola.cz'));

  // další hosté: bez žádosti, se žádostí, ke zamítnutí a k učitelskému schválení
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('g2','Bez','Žádosti','g2@skola.cz','GUEST',now()),('g3','Se','Žádostí','g3@skola.cz','GUEST',now()),('g4','Ke','Zamítnutí','g4@skola.cz','GUEST',now()),('g5','Nový','Učitel','g5@skola.cz','GUEST',now())`);
  sql(`update "User" set "requestedClassGroupId"=(select id from "ClassGroup" where grade=3 and letter='A') where id='g3'`);

  // dashboard admina: widget s počtem čekajících
  await pa.goto('/dashboard'); await pa.waitForSelector('[data-card="core.todos"]');
  const pendingTodo = pa.locator('[data-card="core.todos"] [data-todo="core.pending-accounts"]');
  check('admin card "Co udělat" shows pending count', (await pendingTodo.innerText()).includes('Účty čekající na schválení') && (await pendingTodo.innerText()).includes('5'), await pendingTodo.innerText());
  await pendingTodo.getByRole('link').click(); await pa.waitForURL('**/users?tab=approvals');
  await pa.waitForSelector('[data-testid=approvals-table]');
  check('tab shows count', (await pa.locator('a[data-tab=approvals]').innerText()).includes('(5)'));
  check('class preselected from request', (await pa.locator('select[aria-label="Třída – Nová Žákyně"] option:checked').innerText()) === '3.A');

  // schválení jedním klikem
  const row = pa.locator('tr[data-user="nova@skola.cz"]');
  await row.locator('[data-testid=approve]').click(); await pa.waitForTimeout(1500);
  check('approved as student in requested class', userInfo('nova@skola.cz') === 'STUDENT|true|3A|-', userInfo('nova@skola.cz'));
  check('history reason ASSIGNED', sql(`select m.reason from "ClassMembership" m join "User" u on u.id=m."userId" where u.email='nova@skola.cz'`) === 'ASSIGNED');
  check('row disappeared', (await pa.locator('tr[data-user="nova@skola.cz"]').count()) === 0);

  // hromadně: každý do své vybrané třídy (g2 doplněná ručně, g3 z žádosti)
  await pa.selectOption('select[aria-label="Třída – Bez Žádosti"]', { label: '3.B' });
  await pa.check('input[aria-label="Vybrat Bez Žádosti"]'); await pa.check('input[aria-label="Vybrat Se Žádostí"]');
  await pa.getByTestId('approve-selected').click(); await pa.waitForTimeout(1500);
  check('bulk approval into chosen classes', userInfo('g2@skola.cz') === 'STUDENT|true|3B|-' && userInfo('g3@skola.cz') === 'STUDENT|true|3A|-', userInfo('g2@skola.cz') + ' ' + userInfo('g3@skola.cz'));

  // zamítnutí (menu + potvrzení) a schválení jako učitel
  await pa.locator('tr[data-user="g4@skola.cz"]').getByRole('button', { name: /Další možnosti/ }).click();
  await pa.getByRole('menuitem', { name: 'Zamítnout' }).click();
  await pa.getByRole('button', { name: 'Zamítnout', exact: true }).click(); await pa.waitForTimeout(1500);
  check('rejected: deactivated, still guest', userInfo('g4@skola.cz') === 'GUEST|false|-|-', userInfo('g4@skola.cz'));
  await pa.locator('tr[data-user="g5@skola.cz"]').getByRole('button', { name: /Další možnosti/ }).click();
  await pa.getByRole('menuitem', { name: 'Schválit jako učitele' }).click(); await pa.waitForTimeout(1500);
  check('approved as teacher', userInfo('g5@skola.cz') === 'TEACHER|true|-|-', userInfo('g5@skola.cz'));
  check('nobody waits any more', (await pa.getByTestId('no-approvals').count()) === 1);

  // schválený student se přihlásí a vidí menu studenta
  const ps = await login(b, 'nova@skola.cz', 'password123');
  check('approved student sees student menu', (await ps.locator('header nav a').allInnerTexts()).map((s) => s.trim()).includes('Dopisování'));
  const rejected = await tryLogin(b, 'g4@skola.cz');
  check('rejected account cannot log in', !rejected.url().endsWith('/dashboard'));
});

test("povinný výběr třídy při registraci", async ({ browser }) => {
  const b = browser;
  sql(`insert into "SystemSetting"(key,value) values ('registration_class_mode','required') on conflict (key) do update set value='required'`);
  const p = await (await b.newContext()).newPage();
  await p.goto('/register'); await p.waitForSelector('#classGroupId');
  await p.fill('#firstName', 'Bez'); await p.fill('#lastName', 'Třídy'); await p.fill('#email', 'bez@skola.cz'); await p.fill('#password', 'password123');
  const res = await p.request.post('/api/auth/register', { data: { email: 'bez2@skola.cz', password: 'password123', firstName: 'A', lastName: 'B' } });
  check('API rejects registration without class when required', res.status() === 400 && sql(`select count(*) from "User" where email='bez2@skola.cz'`) === '0', String(res.status()));
  await p.selectOption('#classGroupId', { label: '3.A' });
  await p.getByRole('button', { name: 'Vytvořit účet' }).click(); await p.waitForURL('**/dashboard', { timeout: 20000 });
  check('registered with required class', userInfo('bez@skola.cz') === 'GUEST|true|-|3A', userInfo('bez@skola.cz'));
  // host vidí výzvu k výběru třídy (už vybraná)
  await p.waitForSelector('[data-testid=class-request]');
  check('guest prompt present', (await p.locator('[data-testid=class-request]').innerText()).includes('Vyberte svou třídu'));
});
