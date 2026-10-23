import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects, login, tryLogin, navLabels, toastText, tmpFile, currentSchoolYear, yearLabel } from "./helpers";

// Převedeno z ručních scénářů; každá kontrola je samostatná „soft“ aserce.
const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);

const pad = (n: number) => String(n).padStart(2, "0");
// dost daleko, aby neplatila 24h uzávěrka řady
const tomorrow = new Date(Date.now() + 48 * 3600e3);
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inWeeks = (w: number) => new Date(tomorrow.getTime() + w * 7 * 24 * 3600e3);
const navText = async (p) => (await navLabels(p)).join(",");

async function createSession(p, { date, from, to, room, capacity, subjects, deadline, repeatUntil = "" }) {
  await p.goto("/makeup"); await p.waitForLoadState("networkidle");
  await p.click("[data-testid=new-session]"); await p.waitForSelector("#ms-subjects");
  await p.fill("#ms-date", date); await p.fill("#ms-from", from); await p.fill("#ms-to", to);
  if (repeatUntil) { await p.check("#ms-repeat"); await p.fill("#ms-until", repeatUntil); }
  await p.fill("#ms-room", room); await p.fill("#ms-capacity", String(capacity));
  for (const s of subjects) await p.click(`#ms-subjects [data-subject="${s}"]`);
  await p.selectOption("#ms-deadline", String(deadline));
  await p.click("[data-testid=ms-submit]");
  return toastText(p);
}

test.beforeAll(() => {
  resetDb();
  seedSubjects();
});

test("dopisování: termíny, řady, kolize, zápis, přepis, přesun, uzávěrka, docházka, zrušení", async ({ browser }) => {
  const b = browser;

  const pt = await login(b, 'teacher@skola.cz');
  check('nav has Dopisování', (await navText(pt)).includes('Dopisování'));

  // 1) jednorázový termín, kapacita 1
  let t = await createSession(pt, { date: dateStr(tomorrow), from: '14:00', to: '14:45', room: '204', capacity: 1, subjects: ['M', 'CJ'], deadline: 30 });
  check('create single session', sql(`select count(*) from "MakeupSession"`) === '1', t);
  check('stored local time 14:00 Prague', sql(`select to_char("startsAt" at time zone 'UTC' at time zone 'Europe/Prague','HH24:MI') from "MakeupSession"`) === '14:00');
  // 2) řada každý týden (4 termíny), jiná učebna a čas
  t = await createSession(pt, { date: dateStr(tomorrow), from: '15:00', to: '15:45', room: '205', capacity: 5, subjects: ['M'], deadline: 1440, repeatUntil: dateStr(inWeeks(3)) });
  check('create weekly series', sql(`select count(*) from "MakeupSession" where "seriesId" is not null`) === '4', t);
  // 3) kolize učebny
  t = await createSession(pt, { date: dateStr(tomorrow), from: '14:15', to: '14:30', room: '204', capacity: 3, subjects: ['F'], deadline: 0 });
  check('room/teacher conflict rejected', sql(`select count(*) from "MakeupSession"`) === '5' && /obsazen|jiný termín/.test(t), t);

  const s1 = sql(`select id from "MakeupSession" where room='204'`);
  const s2 = sql(`select id from "MakeupSession" where room='205' order by "startsAt" limit 1`);

  // 4) Jan se zapíše na s1 – matematika + poznámka
  const pj = await login(b, 'jan.student@skola.cz');
  await pj.goto('/makeup'); await pj.waitForLoadState('networkidle');
  await pj.locator(`tr[data-session="${s1}"]`).getByRole('button', { name: 'Zapsat se' }).click();
  await pj.check('#reg-subjects [data-subject="M"]').catch(() => {});
  await pj.fill('#reg-note', 'test z derivací');
  await pj.click('[data-testid=reg-submit]'); t = await toastText(pj);
  check('student registered', sql(`select count(*) from "MakeupRegistration" where "sessionId"='${s1}'`) === '1', t);
  check('subject teacher resolved from assignments', sql(`select "subjectTeacherId" from "MakeupRegistrationSubject"`) === 'usr_teacher');
  await pj.reload(); await pj.waitForLoadState('networkidle');
  check('Jan sees my registration highlighted in the table', (await pj.locator(`tr[data-session="${s1}"]`).innerText()).includes('test z derivací') && (await pj.locator(`tr[data-session="${s1}"]`).getAttribute('data-registered')) === 'true');
  check('Jan dashboard widget', await (async () => { await pj.goto('/dashboard'); return (await pj.locator('[data-testid=makeup-widget]').count()) === 1; })());

  // 5) Eva vidí plno
  const pe = await login(b, 'eva.studentova@skola.cz');
  await pe.goto('/makeup'); await pe.waitForLoadState('networkidle');
  check('full session shows plno', (await pe.locator(`tr[data-session="${s1}"]`).innerText()).includes('plno'));

  // 6) Jan se přepíše na s2 (řada, učebna 205)
  await pj.goto('/makeup'); await pj.waitForLoadState('networkidle');
  await pj.getByRole('button', { name: 'Přepsat' }).click();
  await pj.check(`#move-candidates input[value="${s2}"]`);
  await pj.click('[data-testid=move-submit]'); t = await toastText(pj);
  check('student moved own registration', sql(`select "sessionId" from "MakeupRegistration"`) === s2, t);

  // 7) dozor nemůže odebrat předmět, který si student vybral; změna učebny projde
  await pt.goto(`/makeup/sessions/${s2}`); await pt.waitForLoadState('networkidle');
  check('teacher detail lists Jan with subject teacher', (await pt.locator('[data-testid=registrations]').innerText()).includes('Matematika (Učitel Petr)'));
  await pt.click('[data-testid=edit-session]'); await pt.waitForSelector('#ms-subjects');
  await pt.click('#ms-subjects [data-subject="M"]'); await pt.click('#ms-subjects [data-subject="F"]');
  await pt.click('[data-testid=ms-submit]'); t = await toastText(pt);
  check('cannot remove subject in use', t.includes('Předmět nelze odebrat'), t);
  await pt.click('#ms-subjects [data-subject="M"]'); await pt.fill('#ms-room', '206');
  await pt.click('[data-testid=ms-submit]'); t = await toastText(pt);
  check('edit room with registered students', sql(`select room from "MakeupSession" where id='${s2}'`) === '206', t);

  // 8) přehled vyučujícího
  await pt.goto('/makeup'); await pt.waitForLoadState('networkidle');
  check('subject teacher overview shows Jan', (await pt.locator('[data-testid=subject-registrations]').innerText()).includes('Student Jan'));

  // 9) dozor přesune Jana zpět na s1 a pak ho odepíše
  await pt.goto(`/makeup/sessions/${s2}`); await pt.waitForLoadState('networkidle');
  await pt.getByRole('button', { name: 'Přesunout' }).click();
  await pt.check(`#move-candidates input[value="${s1}"]`);
  await pt.click('[data-testid=move-submit]'); t = await toastText(pt);
  check('teacher moved student', sql(`select "sessionId" from "MakeupRegistration"`) === s1, t);
  await pt.goto(`/makeup/sessions/${s1}`); await pt.waitForLoadState('networkidle');
  await pt.getByRole('button', { name: 'Odepsat' }).click();
  await pt.getByRole('button', { name: 'Odepsat', exact: true }).last().click(); await pt.waitForTimeout(1500);
  check('teacher removed student', sql(`select count(*) from "MakeupRegistration"`) === '0');

  // 10) uzávěrka: termín za 20 min s uzávěrkou 30 min
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('late','usr_teacher',now()+interval '20 min',now()+interval '60 min','301',5,30,'usr_teacher',now()); insert into "MakeupSessionSubject" values ('late','sm')`);
  await pj.goto('/makeup'); await pj.waitForLoadState('networkidle');
  check('past deadline blocks registration', (await pj.locator('tr[data-session="late"]').innerText()).includes('po uzávěrce'));

  // 11) kolize studenta: Jan zapsán na s1, překrývající termín jiného učitele (DB)
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('r1','${s1}','usr_stud1','usr_stud1',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('r1','sm')`);
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") select 'ovl','usr_admin',"startsAt"+interval '10 min',"endsAt",'401',5,0,'usr_admin',now() from "MakeupSession" where id='${s1}'; insert into "MakeupSessionSubject" values ('ovl','sm')`);
  await pj.reload(); await pj.waitForLoadState('networkidle');
  check('student time conflict shown', (await pj.locator('tr[data-session="ovl"]').innerText()).includes('kolize'));

  // 12) docházka po začátku
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('now','usr_teacher',now()-interval '10 min',now()+interval '30 min','302',5,0,'usr_teacher',now()); insert into "MakeupSessionSubject" values ('now','scj'); insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('r2','now','usr_stud2','usr_stud2',now()); insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('r2','scj')`);
  await pt.goto('/makeup/sessions/now'); await pt.waitForLoadState('networkidle');
  await pt.selectOption('select[aria-label="Docházka – Studentová Eva"]', 'ATTENDED'); await pt.waitForTimeout(1500);
  check('attendance saved', sql(`select attendance from "MakeupRegistration" where id='r2'`) === 'ATTENDED');

  // 13) zrušení celé řady
  const s3 = sql(`select id from "MakeupSession" where "seriesId" is not null order by "startsAt" limit 1`);
  await pt.goto(`/makeup/sessions/${s3}`); await pt.waitForLoadState('networkidle');
  await pt.getByRole('button', { name: 'Zrušit termín' }).click();
  await pt.fill('#cancel-reason', 'nemoc'); await pt.check('text=Zrušit i všechny další termíny');
  await pt.click('[data-testid=cancel-submit]'); t = await toastText(pt);
  check('cancel whole series', sql(`select count(*) from "MakeupSession" where "seriesId" is not null and "cancelledAt" is not null`) === '4', t);

  // 14) student nemůže otevřít správu termínu, cizí učitel nemůže spravovat
  await pj.goto(`/makeup/sessions/${s1}`);
  check('student redirected from session admin', pj.url().endsWith('/dashboard'), pj.url());

  await pj.goto('/makeup'); await pj.waitForLoadState('networkidle');
});
