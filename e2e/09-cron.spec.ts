import { test, expect } from "@playwright/test";
import { sql, resetDb, seedSubjects } from "./helpers";

// Denní úloha /api/cron/daily: autorizace přes CRON_SECRET, idempotence, připomínky, souhrny, automatická
// připomínka nezapsaným a mazání starých záznamů. E-maily se jen zapisují do EmailLogu (EMAIL_TRANSPORT=log).

const check = (name: string, ok: boolean, extra = "") => expect.soft(ok, `${name} ${extra}`).toBe(true);
const secret = process.env.CRON_SECRET;

// dnešní den v Praze jako RRRR-MM-DD
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
const sent = (event: string) => Number(sql(`select count(*) from "EmailLog" where event='${event}' and status='SENT'`));

test.skip(!secret, "CRON_SECRET není nastaven");

test("cron: špatné tajemství se odmítne", async ({ request }) => {
  resetDb();
  const none = await request.get("/api/cron/daily");
  expect(none.status()).toBe(401);
  const wrong = await request.get("/api/cron/daily", { headers: { Authorization: "Bearer spatne-tajemstvi" } });
  expect(wrong.status()).toBe(401);
  // jen přesný tvar „Bearer <tajemství>“
  const noScheme = await request.get("/api/cron/daily", { headers: { Authorization: secret! } });
  expect(noScheme.status()).toBe(401);
  // nic se nespustilo
  expect(sql(`select count(*) from "SystemSetting" where key='cron.daily.lastRun'`)).toBe("0");
  expect(sql(`select count(*) from "EmailLog"`)).toBe("0");
});

test("cron: připomínky, souhrny, automatická připomínka nezapsaným, úklid a idempotence", async ({ request }) => {
  resetDb();
  seedSubjects();
  // zapnout nepovinné události (ve výchozím stavu jsou vypnuté)
  for (const ev of ["makeup.reminder", "makeup.digest", "seminars.window.reminder"]) {
    sql(`insert into "SystemSetting"(key,value) values ('email.event.${ev}.enabled','true')`);
  }
  // druhý učitel, který učí češtinu ve 3.A
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('t2','Marie','Druhá','teacher2@skola.cz','TEACHER',now())`);
  // zítra v poledne (Praha): termín dozoru Petra Učitele, Jan se zapsal na matematiku a češtinu
  const tomorrowNoon = `(timezone('Europe/Prague', date_trunc('day', timezone('Europe/Prague', now())) + interval '1 day 12 hours') at time zone 'UTC')`;
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('tm','usr_teacher',${tomorrowNoon},${tomorrowNoon}+interval '45 min','101',5,60,'usr_teacher',now())`);
  sql(`insert into "MakeupSessionSubject" values ('tm','sm'),('tm','scj')`);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('rtm','tm','usr_stud1','usr_stud1',now())`);
  sql(`insert into "MakeupRegistrationSubject"("registrationId","subjectId","subjectTeacherId") values ('rtm','sm','usr_teacher'),('rtm','scj','t2')`);
  // pozítří (ne zítra) – o tom se nic neposílá
  sql(`insert into "MakeupSession"(id,"teacherId","startsAt","endsAt",room,capacity,"changeDeadlineMinutes","createdById","updatedAt") values ('later','usr_teacher',${tomorrowNoon}+interval '1 day',${tomorrowNoon}+interval '1 day 45 min','102',5,60,'usr_teacher',now())`);
  sql(`insert into "MakeupSessionSubject" values ('later','sm')`);
  sql(`insert into "MakeupRegistration"(id,"sessionId","studentId","createdById","updatedAt") values ('rlater','later','usr_stud2','usr_stud2',now())`);
  sql(`insert into "MakeupRegistrationSubject"("registrationId","subjectId") values ('rlater','sm')`);
  // zápisové okno končí za 2 dny, připomínka 3 dny před koncem → už se má poslat
  sql(`update "EnrollmentWindow" set "endsAt"=now()+interval '2 days', "reminderDaysBefore"=3 where id='enr_ls_2025'`);
  // dva účty čekají na schválení
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('g1','Host','Jedna','g1@skola.cz','GUEST',now()),('g2','Host','Dva','g2@skola.cz','GUEST',now())`);
  // staré záznamy k úklidu
  sql(`insert into "AuditLog"(id,action,"entityType",summary,"createdAt") values ('old','users.role','user','Starý záznam',now()-interval '3 years'),('recent','users.role','user','Nedávný záznam',now()-interval '1 year')`);
  sql(`insert into "EmailLog"(id,recipient,event,subject,status,"createdAt") values ('oldmail','x@skola.cz','test','Starý','SENT',now()-interval '200 days')`);

  const headers = { Authorization: `Bearer ${secret}` };
  const res = await request.get("/api/cron/daily", { headers });
  expect(res.status()).toBe(200);
  const body = await res.json();
  check("job ok", body.ok === true && body.day === today(), JSON.stringify(body));

  check("reminder only for tomorrow's student", sent("makeup.reminder") === 1 && sql(`select recipient from "EmailLog" where event='makeup.reminder'`) === "jan.student@skola.cz");
  check("digest to supervisor and subject teacher", sent("makeup.digest") === 2 && sql(`select string_agg(recipient, ',' order by recipient) from "EmailLog" where event='makeup.digest'`) === "teacher2@skola.cz,teacher@skola.cz");
  check("window reminder to both unenrolled students", sent("seminars.window.reminder") === 2);
  check("window reminder marked as sent today", sql(`select "reminderSentOn" from "EnrollmentWindow" where id='enr_ls_2025'`) === today());
  check("pending accounts digest to admin", sent("account.pending.digest") === 1 && sql(`select recipient||'|'||subject from "EmailLog" where event='account.pending.digest'`) === "admin@skola.cz|Účty čekající na schválení: 2");
  check("window-opened is off by default → nothing", sent("seminars.window.opened") === 0);
  check("old audit entry deleted, recent kept", sql(`select string_agg(id, ',') from "AuditLog" where id in ('old','recent')`) === "recent");
  check("old e-mail log deleted", sql(`select count(*) from "EmailLog" where id='oldmail'`) === "0");
  check("run marker stored", sql(`select value from "SystemSetting" where key='cron.daily.lastRun'`) === today());
  const total = sql(`select count(*) from "EmailLog"`);

  // druhé spuštění téhož dne nic neposílá znovu
  const again = await (await request.get("/api/cron/daily", { headers })).json();
  check("second run skipped", again.ok === true && again.skipped === true, JSON.stringify(again));
  check("no duplicate e-mails", sql(`select count(*) from "EmailLog"`) === total);

  // další den (značka je ze včerejška): okno už má připomínku označenou → nepošle se podruhé
  sql(`update "SystemSetting" set value=to_char(now() - interval '1 day','YYYY-MM-DD') where key='cron.daily.lastRun'`);
  const next = await (await request.get("/api/cron/daily", { headers })).json();
  check("next day runs again", next.ok === true && !next.skipped, JSON.stringify(next));
  check("window reminder only once per window", sent("seminars.window.reminder") === 2);
});

test("cron: vypnuté události a hlavní vypínač nic neodešlou", async ({ request }) => {
  resetDb();
  sql(`insert into "User"(id,"firstName","lastName",email,role,"updatedAt") values ('g1','Host','Jedna','g1@skola.cz','GUEST',now())`);
  sql(`insert into "SystemSetting"(key,value) values ('email.enabled','false')`);
  const res = await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${secret}` } });
  expect(res.status()).toBe(200);
  check("nothing sent with global switch off", sql(`select count(*) from "EmailLog" where status='SENT'`) === "0");
});
