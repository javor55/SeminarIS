import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, toastText, pickSubjectChip } from "./helpers";

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

test("dopisování studenta (F12): moje přihlášky, čipy předmětů, termíny jen pro vybraný předmět", async ({ browser }) => {
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
  await pj.goto('/makeup'); await pj.waitForSelector('[data-testid=subject-chips]');
  const terms = pj.locator('[data-session]');
  check('nahoře Moje přihlášky: jen budoucí zápis (zrušený termín), ne proběhlý', (await pj.locator('[data-registration]').count()) === 1 && (await pj.locator('[data-registration][data-session-id="tC"]').count()) === 1);
  const cancelled = pj.locator('[data-registration][data-session-id="tC"]');
  check('zrušený termín: zvýrazněn, jde přepsat i odhlásit', (await cancelled.innerText()).includes('termín zrušen') && (await cancelled.getByRole('button', { name: 'Přepsat' }).count()) === 1 && (await cancelled.getByRole('button', { name: 'Odhlásit se' }).count()) === 1 && (await cancelled.getByRole('button', { name: 'Upravit' }).count()) === 0);
  check('čipy: předměty z budoucích nezrušených termínů, můj předmět první a označený', (await pj.locator('[data-subject-chip]').allInnerTexts()).join(',') === 'Matematika,Čeština' && (await pj.locator('[data-subject-chip]').first().getAttribute('data-mine')) === 'true' && (await pj.locator('[data-subject-chip]').last().getAttribute('data-mine')) === 'false');
  check('bez zvoleného předmětu nejsou termíny, jen nápověda; žádný rozbalovací filtr ani přepínač', (await terms.count()) === 0 && (await pj.getByTestId('pick-subject-hint').count()) === 1 && (await pj.locator('#subject-filter, #only-mine').count()) === 0);

  // čip Matematika: termíny s tímto předmětem (ne zrušený tC, ne tD bez matematiky)
  await pickSubjectChip(pj, 'Matematika');
  check('termíny pro Matematiku', (await terms.count()) === 2 && (await pj.locator('[data-session="tA"]').count()) === 1 && (await pj.locator('[data-session="tB"]').count()) === 1 && (await pj.locator('[data-session="tC"]').count()) === 0);
  // zvýraznění vybraného předmětu v termínu s více předměty
  const mathBadge = pj.locator('[data-session="tB"] >> text=Matematika').first();
  const czBadge = pj.locator('[data-session="tB"] >> text=Čeština').first();
  check('vybraný předmět zvýrazněn', ((await mathBadge.getAttribute('class')) ?? '').includes('bg-primary') && !((await czBadge.getAttribute('class')) ?? '').includes('bg-primary'));
  // čip Čeština: tB a tD (plný)
  await pickSubjectChip(pj, 'Čeština');
  check('termíny pro Češtinu, plný termín je neaktivní', (await terms.count()) === 2 && (await pj.locator('[data-session="tD"]').innerText()).includes('plno') && (await pj.locator('[data-session="tD"]').getByRole('button', { name: 'Přihlásit se' }).count()) === 0);

  // přihlášení z dialogu: předmět předvyplněný, poznámka pro vyučujícího
  await pickSubjectChip(pj, 'Matematika');
  await pj.locator('[data-session="tA"]').getByRole('button', { name: 'Přihlásit se' }).click();
  check('dialog: předmět je předvyplněný a je tu poznámka pro vyučujícího', (await pj.locator('#reg-subjects [data-subject="M"]').isChecked()) && (await pj.getByLabel('Poznámka pro vyučujícího (nepovinné)').count()) === 1);
  await pj.fill('#reg-note', 'test z mechaniky');
  await pj.click('[data-testid=reg-submit]'); const t = await toastText(pj);
  const a = pj.locator('[data-registration][data-session-id="tA"]');
  check('přihláška nahoře s předmětem, vyučujícím a poznámkou', (await a.innerText()).includes('Matematika (Učitel Petr)') && (await a.innerText()).includes('test z mechaniky'), t);
  check('přihláška: Upravit / Přepsat / Odhlásit se', (await a.getByRole('button', { name: 'Upravit' }).count()) === 1 && (await a.getByRole('button', { name: 'Přepsat' }).count()) === 1 && (await a.getByRole('button', { name: 'Odhlásit se' }).count()) === 1);
  await pickSubjectChip(pj, 'Matematika');
  check('termín v nabídce ukazuje Jste přihlášeni', (await pj.locator('[data-session="tA"]').getAttribute('data-registered')) === 'true' && (await pj.locator('[data-session="tA"]').innerText()).includes('Jste přihlášeni'));

  // po uzávěrce: změny uzavřeny
  sql(`update "MakeupSession" set "changeDeadlineMinutes"=100000 where id='tA'`);
  await pj.reload(); await pj.waitForSelector('[data-testid=subject-chips]');
  check('po uzávěrce: změny uzavřeny, bez odhlášení', (await pj.locator('[data-registration][data-session-id="tA"]').innerText()).includes('změny jsou už uzavřeny') && (await pj.locator('[data-registration][data-session-id="tA"]').getByRole('button', { name: 'Odhlásit se' }).count()) === 0);

  // jakýkoli aktivní předmět (i bývalý seminář) lze dopisovat; bez úvazku se vezme učitel výskytu v zápisu
  session('tE', 8, '106', 5, ['subj_prog']);
  await pj.reload(); await pj.waitForSelector('[data-testid=subject-chips]');
  await pickSubjectChip(pj, 'Programování');
  await pj.locator('[data-session="tE"]').getByRole('button', { name: 'Přihlásit se' }).click();
  await pj.click('[data-testid=reg-submit]'); await toastText(pj);
  check('teacher from seminar occurrence when no assignment', sql(`select "subjectTeacherId" from "MakeupRegistrationSubject" s join "MakeupRegistration" r on r.id=s."registrationId" where r."sessionId"='tE' and s."subjectId"='subj_prog'`) === 'usr_teacher');

  // proběhlé zápisy sbalené dole
  const past = pj.locator('[data-testid=past-registrations]');
  check('past registrations collapsed with count', (await past.locator('summary').innerText()).includes('(1)') && !(await past.evaluate((el) => (el as HTMLDetailsElement).open)));
  await past.locator('summary').click();
  check('past registration shows attendance', (await past.innerText()).includes('dopsal(a)'));
});
