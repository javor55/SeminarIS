import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const session = (id: string, days: number, room: string, capacity: number, subjects: string[], extra = "") =>
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt" ${extra ? ',"cancelledAt"' : ''}) values ('${id}','usr_teacher',now()+interval '${days} days',now()+interval '${days} days 45 min',${`'${room}'`},${capacity},60,'usr_teacher',now() ${extra ? ',now()' : ''}); ` +
    subjects.map((s) => `insert into "MakeupSessionSubject" values ('${id}','${s}');`).join(" "));
const register = (id: string, sessionId: string, student: string, subject: string, attendance = "REGISTERED") =>
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById",attendance,"updatedAt") values ('${id}','${sessionId}','${student}','${student}','${attendance}',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('${id}','${subject}')`);

test.beforeAll(() => {
  resetDb();
  seedSubjects();
});

test("dopisování: jedna tabulka termínů pro studenta", async ({ browser }) => {
  const b = browser;
  session('tA', 3, '101', 5, ['sm']);
  session('tB', 4, '102', 5, ['sm', 'scj']);
  session('tC', 5, '103', 5, ['sm'], 'cancelled');
  session('tD', 6, '104', 1, ['scj']);
  session('tP', -2, '105', 5, ['sm']);
  register('rC', 'tC', 'usr_stud1', 'sm');
  register('rD', 'tD', 'usr_stud2', 'scj');
  register('rP', 'tP', 'usr_stud1', 'sm', 'ATTENDED');

  const pj = await login(b, 'jan.student@skola.cz');
  await pj.goto('/makeup'); await pj.waitForSelector('[data-testid=makeup-table]');
  const rows = pj.locator('[data-testid=makeup-table] tbody tr');
  check('one table: upcoming + registered cancelled, no past', (await rows.count()) === 4 && (await pj.locator('tr[data-session="tP"]').count()) === 0);
  check('no separate "Moje zápisy" / "Vypsané termíny" blocks', !(await pj.locator('main').innerText()).includes('Vypsané termíny') && !(await pj.locator('main').innerText()).includes('Moje zápisy'));
  check('other rows: full, register button', (await pj.locator('tr[data-session="tD"]').innerText()).includes('plno') && (await pj.locator('tr[data-session="tA"]').getByRole('button', { name: 'Zapsat se' }).count()) === 1);

  // zapsání z tabulky: řádek se zvýrazní a ukáže zvolený předmět s vyučujícím
  await pj.locator('tr[data-session="tA"]').getByRole('button', { name: 'Zapsat se' }).click();
  await pj.fill('#reg-note', 'test z mechaniky');
  await pj.click('[data-testid=reg-submit]'); const t = await toastText(pj);
  const a = pj.locator('tr[data-session="tA"]');
  check('registered row highlighted with subject, teacher and note', (await a.getAttribute('data-registered')) === 'true' && (await a.innerText()).includes('Matematika (Učitel Petr)') && (await a.innerText()).includes('test z mechaniky'), t);
  check('registered row actions: edit / move / cancel', (await a.getByRole('button', { name: 'Upravit' }).count()) === 1 && (await a.getByRole('button', { name: 'Přepsat' }).count()) === 1 && (await a.getByRole('button', { name: 'Odhlásit' }).count()) === 1);

  // zrušený termín se zvýrazněním a možností odhlášení / přepsání
  const c = pj.locator('tr[data-session="tC"]');
  check('cancelled registered row highlighted', (await c.innerText()).includes('termín zrušen') && (await c.getAttribute('data-registered')) === 'true' && (await c.getByRole('button', { name: 'Přepsat' }).count()) === 1);

  // zvýraznění předmětů mé třídy (Matematika má úvazek ve 3.A)
  const mathBadge = pj.locator('tr[data-session="tB"] >> text=Matematika').first();
  const czBadge = pj.locator('tr[data-session="tB"] >> text=Čeština').first();
  check('own class subject highlighted', ((await mathBadge.getAttribute('class')) ?? '').includes('bg-primary') && !((await czBadge.getAttribute('class')) ?? '').includes('bg-primary'));

  // filtr předmětu a přepínač „jen moje zápisy“
  await pj.selectOption('#subject-filter', { label: 'Čeština' });
  check('subject filter', (await rows.count()) === 2 && (await pj.locator('tr[data-session="tB"]').count()) === 1 && (await pj.locator('tr[data-session="tD"]').count()) === 1);
  await pj.selectOption('#subject-filter', '');
  await pj.click('#only-mine');
  check('only my registrations', (await rows.count()) === 2 && (await pj.locator('tr[data-session="tA"]').count()) === 1 && (await pj.locator('tr[data-session="tC"]').count()) === 1);
  await pj.click('#only-mine');

  // po uzávěrce: zapsáno, změny uzavřeny
  sql(`update "MakeupSession" set "changeDeadlineMinutes"=100000 where id='tA'`);
  await pj.reload(); await pj.waitForSelector('[data-testid=makeup-table]');
  check('after deadline: locked', (await pj.locator('tr[data-session="tA"]').innerText()).includes('zapsáno, změny uzavřeny') && (await pj.locator('tr[data-session="tA"]').getByRole('button', { name: 'Odhlásit' }).count()) === 0);

  // jakýkoli aktivní předmět (i bývalý seminář) lze dopisovat; bez úvazku se vezme učitel výskytu v zápisu
  session('tE', 8, '106', 5, ['subj_prog']);
  await pj.reload(); await pj.waitForSelector('[data-testid=makeup-table]');
  await pj.locator('tr[data-session="tE"]').getByRole('button', { name: 'Zapsat se' }).click();
  await pj.click('[data-testid=reg-submit]'); await toastText(pj);
  check('teacher from seminar occurrence when no assignment', sql(`select "subjectTeacherId" from "MakeupRegistrationSubject" s join "MakeupRegistration" r on r.id=s."registrationId" where r."sessionId"='tE' and s."subjectId"='subj_prog'`) === 'usr_teacher');

  // proběhlé zápisy sbalené pod tabulkou
  const past = pj.locator('[data-testid=past-registrations]');
  check('past registrations collapsed with count', (await past.locator('summary').innerText()).includes('(1)') && !(await past.evaluate((el) => (el as HTMLDetailsElement).open)));
  await past.locator('summary').click();
  check('past registration shows attendance', (await past.innerText()).includes('dopsal(a)'));
});
