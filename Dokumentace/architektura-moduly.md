# Modulární architektura

Od 10/2026 je SeminarIS rozdělený na **jádro** a **moduly**. Pořád je to jedna Next.js
aplikace s jednou databází (modulární monolit), ale každá funkční oblast má svůj kód
pohromadě a do systému se zapojuje přes manifest. Prvním modulem je zápis seminářů,
dalším bude zápis na dopisovací písemky.

## Struktura

```
modules/
  types.ts              typ ModuleManifest (čistá data) a datové typy bodů rozšíření
  server-types.ts       typ ModuleServer (serverové háčky)
  registry.ts           seznam modulů, can(), menu, oprávnění k cestám  ← i pro middleware a klienta
  server-registry.ts    serverové části modulů                           ← jen server
  core/                 jádro: uživatelé, třídy, předměty, profil, administrace
    manifest.ts
    server.tsx          dashboard (výzva k výběru třídy, čekající účty), statistiky do administrace
    extensions.ts       sběr bodů rozšíření ze zapnutých modulů (collectSubjectTabs, collectAdminTodos, collectAdminSections, …)
    settings.ts         tenké obálky nad registrem nastavení (registrace, výchozí role, výběr třídy)
    admin-todos.ts      položky přehledu „co udělat“ patřící jádru; system-status.ts stav DB, migrací, cronu, e-mailu
    school.ts           dotazy nad školou pro všechny moduly (aktuální rok, ročník studenta, setStudentClass, …)
    actions/            server actions: users.ts (vč. stavu studia), classes.ts, approvals.ts, subjects.ts,
                        assignments.ts (úvazky), school.ts (školní rok, uzavření roku), admin.ts, profile.ts
    components/         users/ (vč. záložky Ke schválení), subjects/, admin/ (AdminShell, AdminNav, SettingsForm,
                        ModulesForm, školní rok a třídy, uzavření roku, upozornění, historie)
  seminars/             zápisová okna a zápis studentů do předmětů (semináře)
    manifest.ts
    server.tsx          widget na dashboard, statistiky, úklid při mazání uživatele
    window-status.ts    synchronizace stavu zápisového okna s časem
    eligibility.ts      cílení zápisových oken na ročníky
    unenrolled.ts       nezapsaní studenti okna a ruční/automatická připomínka
    notifications.ts    e-maily modulu (zápis otevřen, připomínka nezapsaným) a jeho denní úloha
    subject-windows.ts  „v zápisu“: ve kterých oknech je předmět nabízen (podklad pro štítky předmětů)
  makeup/               dopisování písemek (termíny, zápisy, docházka)
    manifest.ts, server.tsx, data.ts (interní dotazy), types.ts, notifications.ts (e-maily a denní úloha)
    actions/            sessions.ts (dozor), registrations.ts (student)
    components/
    actions/            subjects.ts, windows.ts, enrollment.ts
    components/         blocks/, enrollment/, occurrences/, subjects/
lib/
  session.ts            getCurrentUser, requireAuth, requireModule, requirePermission, isImpersonating
  email/                odesílání e-mailů: send.ts (jediná funkce sendEventEmail), events.ts (seznam upozornění
                        a výchozí texty), settings.ts (nastavení a limity), transport.ts (Resend), template.ts
  audit.ts              audit(tx, uživatel, záznam) – historie změn; audit-settings.ts (doba uchování)
  impersonation*.ts     „zobrazit jako uživatel“ (podepsaná cookie)
  modules.ts            zapnuté moduly (SystemSetting `module.<id>.enabled`), ensureModulePage
  settings.ts           surové čtení/zápis klíčů SystemSetting, které nejsou nastavením (např. `cron.daily.lastRun`)
  settings-registry.ts  jednotný registr nastavení (viz Jednotné nastavení): čtení, validace, zápis s auditem
  prisma.ts             Prisma klient (passwordHash se nikdy nevrací bez výslovného omit: false)
  auth.ts               NextAuth (heslo + Microsoft 365); role a aktivita se při každém ověření načtou z DB
  auth-settings.ts      nastavení přihlašování (M365 zapnuto, kdo smí heslem, zakládání účtů)
  datetime.ts           formátování data a času v pásmu Europe/Prague
  action-result.ts      ActionResult, unwrap – chyby server actions pro uživatele (klient)
  safe-action.ts        safeAction – obalení server action (server)
  school.ts             čisté výpočty: školní rok, označení třídy („3.A“), ročníky předmětu, popisy stavu studia
app/                    stránky (URL zůstaly beze změny)
components/             sdílené UI (shadcn/ui, editor, topbar)
```

## Školní data v jádru

Všechny moduly sdílí tato data:

| Model | Význam | Kde se spravuje |
|---|---|---|
| `SchoolYear` | školní rok (`startYear` 2026 = 2026/27), právě jeden je aktuální | Administrace → Školní rok a třídy |
| `ClassGroup` | **pevná třída** = ročník (`grade` 1–4) + písmeno; třídy se zakládají jednou | Administrace → Školní rok a třídy |
| `Subject` | **předmět** (název, zkratka, popis, sylabus, ročníky, aktivní/archivovaný) | menu Předměty |
| `TeachingAssignment` | úvazek: učitel × předmět × třída × školní rok | detail předmětu, Uživatelé → Úvazky |
| `User.classGroupId` | aktuální třída studenta (u absolventů a ukončených poslední) | Uživatelé |
| `User.requestedClassGroupId` | třída, kterou si host přál při registraci (čeká na schválení) | registrace, dashboard |
| `ClassMembership` | historie: třída a ročník studenta v každém školním roce + důvod (zařazen, postup, opakuje, přeřazen) | automaticky |
| `User.studyStatus` | stav studia: studuje / absolvoval / ukončil (+ důvod, datum, poznámka) | Uživatelé |

Ročník studenta je `classGroup.grade`. Student se do vyššího ročníku **přesouvá mezi třídami**
(2.A → 3.A) při uzavření školního roku. Třídu studenta mění jen `setStudentClass()`
(`modules/core/school.ts`), která současně zapisuje historii (`ClassMembership`).

Do modulů se počítají jen **studující** studenti (`activeStudentsWhere`). Absolventi a
ukončení mají deaktivovaný účet, jejich data (zápisy, historie) zůstávají.

Stránka **Škola** už neexistuje: školní rok a třídy jsou v Administraci, předměty
v menu Předměty a úvazky v detailu předmětu a u učitele.

### Předměty (`/subjects`, jádro)

Jeden model `Subject` pro všechno (dřív zvlášť `Seminar` a `Subject`). Žádný „typ“ předmětu:

- `grades` jsou ročníky, ve kterých se předmět vyučuje (prázdné = všechny), `code` je nepovinná
  a jedinečná zkratka. Oprávnění `core.subjects.view` (student, učitel, admin),
  `core.subjects.edit` (učitel, admin), `core.subjects.archive` (admin; archivace a trvalé smazání).
- **Do zápisu (blok zápisového okna) lze zařadit jakýkoli aktivní předmět.** U předmětu se
  zobrazuje odvozený štítek „v zápisu: <název okna>“ podle výskytů (`SubjectOccurrence`)
  v nesmazaných blocích. Štítek dodává modul Semináře přes `getSubjectBadges`
  (`modules/seminars/subject-windows.ts`), jádro o něm nic neví; s vypnutým modulem zmizí.
- Učitel a admin vidí všechny předměty (filtry ročník / v zápisu / stav). Student vidí aktivní
  předměty svého ročníku a předměty nabízené v jemu viditelném zápisu.
- Detail: popis, sylabus, ročníky, vyučující (úvazky), u učitele a admina i zápisy, kde je
  předmět nabízen (záložka z modulu Semináře přes `getSubjectTabs`, `SubjectOccurrencesPanel`).
- Před trvalým smazáním detail ukazuje, kde se předmět používá (`getSubjectUsage` všech zapnutých
  modulů); použití se zapíše i do historie.
- Dopisování nabízí na termínu všechny aktivní předměty.

### Třídy (Administrace → Školní rok a třídy, `/admin/school-year`)

- V Uživatelích je jen odkaz (`/users?tab=classes` přesměruje admina do administrace). Učitel správu
  tříd nevidí (sekce je jen pro admina); třídu studenta vidí v seznamu uživatelů.
- Sekce **Třídy**: seznam tříd s počty studujících, rozkliknutím studenti třídy a jejich
  přesun do jiné třídy (`setStudentClass`, v historii „přeřazen“). Admin tu generátorem založí
  třídy (ročníky × písmena, např. 1–4 × A, B, C; existující se přeskočí) a smaže prázdnou třídu
  (bez studentů a bez historie zařazení).
- V seznamu uživatelů je sloupec a filtr třídy a hromadná akce **Přesunout do třídy**.
- Import uživatelů: sloupec `class` („3.A“) třídu při chybějící založí.

### Registrace se třídou a schvalování (Uživatelé → Ke schválení)

- Administrace → **Výběr třídy při registraci**: vypnuto (výchozí) / volitelný / povinný
  (`SystemSetting` `registration_class_mode`). Registrační formulář pak nabízí třídy
  (`GET /api/auth/register`) a uloží volbu do `User.requestedClassGroupId`. Role zůstává
  výchozí (host), nic dalšího se automaticky nemění.
- Hosté bez žádosti (např. účty z Microsoft 365) vidí při zapnutém nastavení na dashboardu výzvu
  **Vyberte svou třídu**; host může žádost měnit, dokud není schválen.
- Záložka **Ke schválení** (admin, s počtem): hosté se žádostí i bez ní.
  **Schválit** = jedním klikem role student, zařazení do vybrané (předvyplněné) třídy
  (`setStudentClass`, důvod „zařazen“), smazání žádosti. V menu u řádku **Schválit jako učitele**
  a **Zamítnout** (deaktivuje účet a smaže žádost; trvalé smazání je ve správě uživatelů).
  Zaškrtnuté řádky lze schválit hromadně (`approveUsers`, každý do své třídy, vše nebo nic).
- Dashboard admina ukazuje, kolik účtů čeká na schválení.

### Úvazky

Data `TeachingAssignment(teacher, subject, classGroup, schoolYear)` se upravují vždy pro
aktuální školní rok ze dvou míst (oprávnění `core.school.manage`, tedy admin):

- **detail předmětu → Vyučující 2026/27**: mřížka tříd (řádky = ročníky předmětu, sloupce =
  písmena), čipy učitelů (× odebere), výběr „+ učitel“, tlačítko **Stejný učitel pro celý
  ročník**; ukládá se hned,
- **Uživatelé → u učitele Úvazky**: seznam „předmět – třídy“ a přidání (předmět + třídy jen
  z ročníků předmětu).

Číst úvazky v detailu předmětu může každý, kdo předmět vidí. Podle úvazků dopisování dohledá
vyučujícího studenta.

### Uzavření školního roku (Administrace → Školní rok a třídy → Uzavřít školní rok…, `/admin/close-year`)

Jednou ročně, typicky na konci srpna. Průvodce má dva kroky.

1. **Studenti** po třídách. Každý má výběr cíle s výchozí hodnotou „postup do (g+1).<stejné
   písmeno>“ (4. ročník: absolvoval). Možnosti:
   - postup do libovolné třídy ročníku g+1 (tedy i změna písmene),
   - opakuje ročník: libovolná třída ročníku g (výchozí stejná),
   - absolvoval (jen poslední ročník), účet se deaktivuje,
   - ukončil studium: důvod (přestup, zanechání, vyloučení, jiný) a poznámka, účet se deaktivuje.

   U každé třídy lze hromadně nastavit „všem: postup do …“ a pak upravit jednotlivé výjimky.
2. **Souhrn**: počty podle cílových tříd, absolventi, odchody a upozornění (třídy, které se
   nově založí, a třídy 2.–4. ročníku, které zůstanou prázdné). Zde se vybírá i režim **úvazků**:
   *jít se třídou* (výchozí, 2.A → 3.A; přeskočí se úvazky ze 4. ročníku a předměty, které se
   v novém ročníku nevyučují podle `grades`), *ponechat u stejných tříd*, nebo *nepřebírat*.

Potvrzením se v jedné transakci zapíše historie (`PROMOTED` / `REPEATED`), založí se chybějící
cílové třídy, absolventům a odcházejícím se nastaví stav a deaktivují účty, přenesou se úvazky
a aktuálním rokem se stane následující školní rok. Hosté a učitelé se nemění. Akce se nedá
vrátit; jednotlivé studenty jde opravit ručně (přesun do třídy, obnovení studia).

Ruční nastavení aktuálního roku (Administrace → Školní rok a třídy) je k dispozici jen při prvním
nastavení systému, dokud nikdo není zařazen do třídy. Potom se rok mění jen uzavřením.

### Během roku (Uživatelé)

- **Přesun do třídy:** úprava uživatele, Administrace → Školní rok a třídy, nebo hromadně. V historii se zapíše
  jako „přeřazen“.
- **Ukončit studium** (ikona čepice u studenta): důvod, datum, poznámka. Účet se deaktivuje.
  Stejnou ikonou se studium obnoví.

Pro moduly jsou připravené funkce v `modules/core/school.ts`: `getCurrentSchoolYear()`,
`getStudentGrade(userId)`, `activeStudentsWhere`, `studentsInGradesWhere(grades)`,
`setStudentClass(...)`, `findOrCreateClass(grade, letter)`.

Zápisové okno (modul Semináře) má `targetGrades` (prázdné = všichni studující). Studenti jiných
ročníků okno nevidí a nemůžou se do něj zapsat. Exporty obsahují jen studenty cílových ročníků.

## Přihlášení přes Microsoft 365

Přihlášení přes Microsoft 365 a heslem funguje současně. Účty se párují podle e-mailu: student
se může přihlásit oběma způsoby a vždy je to tentýž účet. Microsoft se objeví až po nastavení
proměnných prostředí. Do té doby vše funguje jako dřív.

### Registrace aplikace (školní IT, jednorázově)

1. [Microsoft Entra admin center](https://entra.microsoft.com) → Applications → App registrations → New registration.
2. Název např. „SeminarIS“, *Supported account types*: **Accounts in this organizational directory only** (jen škola).
3. *Redirect URI*: platforma **Web**, adresa `https://<doména aplikace>/api/auth/callback/azure-ad`
   (např. `https://seminar-is.vercel.app/api/auth/callback/azure-ad`).
4. Z přehledu aplikace opsat **Application (client) ID** a **Directory (tenant) ID**.
5. Certificates & secrets → New client secret → opsat **Value** (zobrazí se jen jednou; hlídat datum expirace).
6. Oprávnění stačí výchozí (`openid`, `profile`, `email`, `User.Read`).

### Nastavení na Vercelu

Project → Settings → Environment Variables (Production, případně Preview):

| Proměnná | Hodnota |
|---|---|
| `AZURE_AD_TENANT_ID` | Directory (tenant) ID |
| `AZURE_AD_CLIENT_ID` | Application (client) ID |
| `AZURE_AD_CLIENT_SECRET` | hodnota client secretu |
| `NEXTAUTH_URL` | veřejná adresa aplikace (musí sedět s Redirect URI) |
| `NEXT_PUBLIC_APP_NAME` | volitelně název aplikace v hlavičce a na úvodní stránce |

Po uložení je potřeba nové nasazení (Redeploy).

### Nastavení v aplikaci (Administrace → Registrace a přihlášení)

- **Přihlášení přes Microsoft 365**: zobrazí nebo skryje tlačítko na přihlašovací stránce.
- **Zakládat účty při prvním přihlášení**: vypnuto (výchozí) = projde jen ten, kdo už je
  v systému (import). Zapnuto = komukoli ze školy se založí účet s výchozí rolí.
- **Kdo se smí přihlásit heslem**: všichni / učitelé a admini / jen admini. Admin vždy.
  Omezení platí jen při zapnutém M365, takže se nikdo nemůže zamknout venku.

## Upozornění (e-maily přes Resend)

E-maily se posílají přes [Resend](https://resend.com) z ověřené domény (REST API, bez SDK).
Všechna odesílání jdou přes **jednu funkci** `sendEventEmail(událost, příjemci[])`
(`lib/email/send.ts`), která postupně zkontroluje:

1. hlavní vypínač a zapnutí události (jinak záznam `SKIPPED_DISABLED`),
2. odhlášení příjemce z nepovinných upozornění (`SKIPPED_DISABLED`),
3. denní a měsíční limit (co se nevejde, je `SKIPPED_LIMIT`),

pak e-maily odešle (u více příjemců batch API Resendu `POST /emails/batch`, po nejvýš 100) a **každý
pokus zapíše do `EmailLog`** (příjemce, událost, předmět, stav `SENT` / `FAILED` / `SKIPPED_LIMIT` /
`SKIPPED_DISABLED`, chyba, čas). Podle `EmailLog` se počítají limity (jen `SENT`; den a měsíc podle
pásma Europe/Prague).

Pravidla pro autory kódu:

- Volat **až po commitu** transakce, která změnu provedla, nikdy uvnitř ní.
- `sendEventEmail` **nikdy nevyhodí výjimku**: chyba odeslání se zaloguje a akce proběhne.
- V režimu „zobrazit jako“ se neodešle nic.
- Novou událost přidat do `lib/email/events.ts` (výchozí zapnutí, povinná/nepovinná, proměnné, výchozí
  text) a volat `sendEventEmail("id", …)`.

| Proměnná | Hodnota |
|---|---|
| `RESEND_API_KEY` | API klíč z Resendu (Resend → API Keys, stačí „Sending access“). **Jen v env**, tajný, v databázi ani v administraci se nezobrazuje. Bez klíče se nic neposílá a Administrace → Upozornění to ukáže. |
| `EMAIL_FROM` | výchozí odesílatel z ověřené domény, např. `Školní IS <noreply@skola.cz>` |
| `EMAIL_REPLY_TO` | volitelně adresa, kam chodí odpovědi |
| `EMAIL_TRANSPORT` | `log` = nic neposílat, jen zapsat do `EmailLog` jako `SENT` (CI, vývoj, E2E testy) |

### Administrace → Upozornění (`/admin/notifications`)

- **Hlavní vypínač**, **odesílatel** a **reply-to** (přepíše env; prázdné pole = hodnota z env).
- **Limity**: denní (výchozí 90) a měsíční (výchozí 2 900) – free plán Resendu má 100/den a 3 000/měsíc.
  Ukazatel „dnes X / limit, tento měsíc Y / limit“; po dosažení limitu se další e-maily neposílají
  (`SKIPPED_LIMIT`) a administrace to ukáže varováním.
- **Seznam upozornění**: zapnuto/vypnuto, předmět a text šablony s proměnnými (`{{jmeno}}`,
  `{{termin}}`, `{{ucebna}}`, …; neznámá proměnná se při uložení odmítne), tlačítko „Obnovit výchozí“
  a u hromadných odhad počtu příjemců při příštím spuštění.
- **Poslat zkušební e-mail sobě** (posílá se i při vypnutých upozorněních, počítá se do limitů).
- **Přehled odeslaných e-mailů** (`EmailLog`) s filtrem stavu, upozornění a hledáním.
- Záznamy o e-mailech se mažou po nastavené době (výchozí 90 dní, nejméně 35 – podle záznamů se
  počítá měsíční limit).

### Upozornění (výchozí stav)

| Upozornění | Komu | Výchozí | Povinné |
|---|---|---|---|
| Termín dopisování zrušen | zapsaným studentům | zapnuto | ano |
| Termín změněn (čas, učebna) | zapsaným studentům | zapnuto | ano |
| Student odepsán / přesunut dozorem | dotčenému studentovi | zapnuto | ano |
| Připomínka den předem | zapsaným studentům (cron) | vypnuto | ne |
| Denní souhrn „zítra dopisují“ | dozoru a vyučujícím předmětů (cron) | vypnuto | ne |
| Účet schválen | uživateli | zapnuto | ano |
| Souhrn účtů ke schválení | adminům, jen když N > 0 (cron) | zapnuto | ne |
| Zápis otevřen | studentům cílových ročníků | vypnuto | ne |
| Připomínka nezapsaným | nezapsaným studentům (ručně / cron) | vypnuto | ne |

**Povinná** upozornění chodí vždy, když je událost zapnutá. **Nepovinná** (připomínky, souhrny, zápis
otevřen) nedostane ten, kdo si v **profilu** vypnul „Dostávat nepovinná upozornění“
(`User.receiveOptionalEmails`). Ruční tlačítko „Poslat připomínku nezapsaným“ obchází jen vypnutí
*události*; hlavní vypínač, limity i odhlášení příjemců platí vždy.

„Zápis otevřen“ se pošle jednou za okno (`EnrollmentWindow.openedNotifiedAt`), a to při vytvoření nebo
úpravě již otevřeného okna, při prvním zobrazení po otevření a nejpozději denní úlohou.

## Plánované úlohy (cron)

Jeden endpoint **`GET /api/cron/daily`** (`app/api/cron/daily/route.ts`) chráněný hlavičkou
`Authorization: Bearer ${CRON_SECRET}` – přesně takovou posílá Vercel Cron, když je v projektu
nastavená proměnná `CRON_SECRET`. Bez ní (nebo s jinou hodnotou) vrací 401. `vercel.json` obsahuje
jedno denní spuštění (`0 5 * * *` UTC, tj. 6:00 v zimě a 7:00 v létě; Vercel Hobby umí cron jen 1× denně
a spouští ho v rámci zvolené hodiny).

Každý zapnutý modul přispívá svým krokem (`ModuleServer.runDailyJob`):

- **Dopisování**: připomínky na zítřek (studentům) a souhrny „zítra dopisují“ (dozoru a vyučujícím),
  „zítra“ podle pásma Europe/Prague (`lib/datetime.ts`),
- **Semináře**: doběhnutí upozornění „zápis otevřen“ a automatické připomínky nezapsaným (u okna
  nastavení „připomenout N dní před koncem“; pošle se **jednou za okno** v den *konec − N dní*, případně
  první úlohou po něm, dokud okno běží),
- **Jádro**: souhrn čekajících účtů adminům a **mazání starých záznamů** (historie změn podle
  nastavené doby uchování, `EmailLog` podle nastavení).

**Idempotence:** úloha si na začátku atomicky zabere dnešní den (`SystemSetting` `cron.daily.lastRun`,
datum v pásmu Europe/Prague). Druhé volání téhož dne vrátí `{ skipped: true }` a nic neposílá.
Při chybě celé úlohy se značka uvolní. Jednotlivé kroky si hlídají chyby samy a výsledek vrací odpověď.
Vypnuté události se přeskočí (nic se nepočítá ani neloguje).

## Nezapsaní studenti (Zápisy → detail okna → záložka Nezapsaní)

Aktivní studenti cílových ročníků, kteří nemají zápis ve všech blocích (bloky bez nabízeného předmětu se
nepočítají); u každého jsou vidět chybějící bloky. Filtr třídy a export CSV. Tlačítko **Poslat
připomínku nezapsaným (N e-mailů)** (s potvrzením, jen admin) pošle e-maily a zapíše souhrn do historie.
Na dashboardu admina a učitele je u otevřeného okna počet nezapsaných.

## Historie změn (Administrace → Historie, `/admin/history`)

`AuditLog`: kdo (`actorId`, `actorName`), případně `impersonatorId`, `action` (`oblast.entita.akce`,
např. `makeup.registration.remove`), `entityType`, `entityId`, **`summary`** (čitelný popis česky),
`data` (JSON před/po) a čas. Záznam se píše pomocí `audit(tx, uživatel, {…})` **ve stejné transakci**
jako změna, takže nemůže vzniknout jedno bez druhého:

```ts
await prisma.$transaction(async (tx) => {
  await tx.user.update({ … });
  await audit(tx, admin, { action: "users.role", entityType: "user", entityId: id, summary: "Změněna role …" });
});
```

Loguje se: uživatelé (role, aktivace, schválení a zamítnutí, třída, úprava, ukončení a obnovení studia,
reset hesla, smazání, import souhrnně), třídy, školní rok a jeho uzavření (souhrnně), nastavení a moduly,
předměty a úvazky, zápisová okna, bloky a předměty v nich, zápis a odepsání v seminářích (sám i jiným),
termíny dopisování, zápisy, přesuny, docházka, ruční připomínky a spuštění a ukončení náhledu.
Automatické přepnutí stavu okna podle času se nezapisuje.

Stránka má filtr (kdo, oblast, období, hledání v popisu) a detail s daty před/po. U uživatele v seznamu je
ikona **Historie** (`/admin/history?user=<id>`): co dělal on a co se s ním dělo. **Doba uchování**
(výchozí 2 roky) se nastavuje na stránce Historie, starší záznamy maže denní úloha.

## Zobrazit jako uživatel (náhled, jen admin)

V seznamu uživatelů akce **Zobrazit jako** (ne na jiného admina, na sebe ani na neaktivní účet). Admin pak
vidí celou aplikaci očima uživatele (menu, oprávnění, data) a nahoře je výrazný pruh „Prohlížíte jako Jan
Novák (student 2.A) – Ukončit náhled“. Začátek a konec náhledu jsou v historii.

Jak to funguje (a čeho se držet):

- Cookie `seminaris_impersonate` je **httpOnly**, podepsaná HMAC-SHA256 s `NEXTAUTH_SECRET`, platí 1 hodinu
  a obsahuje id admina, id cíle a čas konce (`lib/impersonation-token.ts`).
- Cookie se uplatní **jen když platí vše současně** (`lib/impersonation.ts`, volá ho `session` callback
  v `lib/auth.ts`): platný podpis a platnost, cookie patří právě přihlášenému adminovi, ten je v DB stále
  **aktivní ADMIN** (role se načítá při každém požadavku), cíl existuje, je aktivní a není admin. Jinak se
  tiše ignoruje.
- Protože se uživatel zamění v session, `getCurrentUser()`, `requirePermission`, `getServerSession` na
  stránkách, `useAuth()` i menu v prohlížeči vidí cílového uživatele (s `impersonatedBy`). Middleware
  hlídá cesty podle role z ověřené cookie, takže `/admin` se v náhledu studenta chová jako u studenta.
- **Jen pro čtení:** `safeAction` v náhledu odmítne každou akci hláškou „V režimu náhledu nelze nic měnit.“
  Přímé zápisy mimo `safeAction` si to hlídají samy (`assertNotImpersonating()` v zápisu a odepsání
  semináře, `isImpersonating()` v registračním API). `sendEventEmail` v náhledu nic neposílá. Při psaní
  nové akce mimo `safeAction` nebo nového API zápisu na to nezapomeňte.
- Odhlášení náhled ukončí.

## Manifest modulu

`modules/<id>/manifest.ts` obsahuje jen data, takže ho může načíst middleware (Edge),
klient i server:

- `permissions`: oprávnění modulu (`"<modul>.<akce>"`) a role, které je mají,
- `nav`: položky menu včetně oprávnění a pořadí,
- `routes`: prefixy cest, které hlídá middleware,
- `enabledByDefault` / `core`: výchozí stav; jádro nejde vypnout,
- `adminSections` (volitelné): položky bočního menu administrace (`label`, `href`, `permission`, `order`;
  jádro 0–99, moduly 100+). Stránka sekce modulu leží ve složce cest modulu (např. `/makeup/settings`,
  chráněná pravidlem v `routes`) a obalí se `<AdminShell>` z jádra, aby měla boční menu,
- `settings` (volitelné): deklarace nastavení (viz Jednotné nastavení).

## Serverová část modulu

`modules/<id>/server.ts(x)` implementuje `ModuleServer`. Všechny části jsou volitelné:

- `getDashboardWidget(user)` vrací obsah na dashboard, nebo `null`,
- `getAdminStats()` vrací karty se statistikami v administraci,
- `onUserDelete(tx, userId, replacementUserId)` uklidí data modulu v transakci před
  trvalým smazáním uživatele. Běží i u vypnutého modulu.
- `runDailyJob(now)` je krok denní úlohy (cron, viz Plánované úlohy); vrací seznam kroků s výsledkem,
- `getEmailEstimates()` vrací odhad počtu příjemců hromadných upozornění pro Administraci → Upozornění.

### Body rozšíření jádra

Jádro o modulech nic neví, moduly do něj jen „přispívají“. Body rozšíření jsou volitelné metody
`ModuleServer` (`modules/server-types.ts`); jádro je sbírá **jen ze zapnutých modulů** funkcemi
v `modules/core/extensions.ts` (`collect*`). Chyba jednoho modulu se zaloguje a jeho příspěvky se
vynechají, stránka jádra se neshodí. Id záložek, štítků a položek jádro prefixuje id modulu
(`seminars.occurrences`). Oprávnění uživatele si bod hlídá sám (jádro kontroluje jen zapnutí modulu).

| Bod rozšíření | Sběr | Použití |
| --- | --- | --- |
| `getSubjectTabs(subjectId, user)` | `collectSubjectTabs` | záložky detailu předmětu (do F4 zobrazené pod sebou, `data-subject-tab`) |
| `getSubjectBadges(subjectIds, user)` | `collectSubjectBadges` | štítky v seznamu a detailu předmětů, filtr (`filter`), `grantsAccess` zpřístupní předmět studentovi mimo jeho ročník |
| `getSubjectUsage(subjectId)` | `collectSubjectUsage` | použití předmětu před smazáním/archivací |
| `getUserTabs(userId, viewer)` | `collectUserTabs` | záložky detailu uživatele (F3) |
| `getAdminTodos(user)` | `collectAdminTodos` | přehled „co udělat“ v administraci (F2) |
| `bulkUserActions` | `collectBulkUserActions` | hromadné akce nad uživateli (F3) |
| `getAdminStats()` | `collectAdminStats` | krátké statistiky pod přehledem v administraci |
| `adminSections` (v manifestu) | `collectAdminSections` | boční menu administrace (jádro i moduly, podle oprávnění) |
| `settings` (v manifestu) | registr nastavení | deklarace nastavení modulu |

Zapojené jsou `getSubjectTabs`, `getSubjectBadges`, `getSubjectUsage` (Semináře; Dopisování dodává
`getSubjectUsage`, záložky přijdou ve F4), `getAdminTodos` (jádro, Semináře, Dopisování), `getAdminStats`,
`adminSections` a `settings`. `getUserTabs` a `bulkUserActions` jsou definované a mají sběrné funkce,
UI na nich vznikne ve F3.

### Hranice mezi jádrem a moduly

ESLint (`no-restricted-imports` v `.eslintrc.json`, chyba při `npm run lint`):

- `modules/core/**`, `lib/**`, `components/**` a stránky jádra (`app/**` kromě složek modulů)
  nesmějí importovat `@/modules/seminars/**` ani `@/modules/makeup/**`,
- `modules/seminars/**` (a `app/enrollments/**`) nesmí importovat `modules/makeup` a naopak,
- jediná výjimka: `modules/registry.ts` a `modules/server-registry.ts`.

Co moduly sdílejí, patří do jádra; co jádro potřebuje od modulů, jde přes body rozšíření.

## Oprávnění

Kód se neptá na role (`role === "TEACHER"`), ale na oprávnění:

```ts
// server action: přihlášení + zapnutý modul + oprávnění, jinak vyhodí chybu
const user = await requirePermission("seminars.windows.manage");

// podmínka v kódu (server i klient)
if (can(user.role, "seminars.enroll.others")) { … }
```

Mapování oprávnění na role je jen v manifestech. Novou roli nebo jiné rozdělení práv
stačí upravit tam.

> Zbývá doladit: klientské komponenty seminářů a uživatelů ještě místy porovnávají
> role přímo (jen schovávají tlačítka). Server oprávnění vynucuje vždy.

## Administrace (`/admin`)

`app/admin/layout.tsx` obaluje stránky `AdminShell` s **bočním menu** (na mobilu je z něj výběr nad obsahem).
Menu skládá `collectAdminSections(user)` z `adminSections` zapnutých modulů a nabízí jen sekce, na které má
uživatel oprávnění. Stránky jsou serverové komponenty, klientské jsou jen formuláře.

| Sekce | URL | Obsah |
| --- | --- | --- |
| Přehled | `/admin` | **Co udělat** + statistiky |
| Registrace a přihlášení | `/admin/registration` | registrace, výchozí role, výběr třídy, Microsoft 365, kdo smí heslem |
| Školní rok a třídy | `/admin/school-year` (+ `/admin/close-year`) | školní rok, uzavření roku, třídy |
| Moduly | `/admin/modules` | zapnutí a vypnutí modulů |
| Upozornění | `/admin/notifications` | e-maily: vypínač, limity, šablony, přehled odeslaných |
| Historie | `/admin/history` | historie změn a doba uchování |
| Diagnostika | `/admin/diagnostics` | databáze a migrace, denní úloha, e-mail, commit nasazení, benchmark |
| Semináře | `/enrollments/settings` | výchozí hodnoty nového zápisového okna |
| Dopisování | `/makeup/settings` | výchozí kapacita a uzávěrka nových termínů |

### Přehled „co udělat“

Položky dodává jádro (`modules/core/admin-todos.ts`) a zapnuté moduly přes `getAdminTodos(user)`
(`AdminTodo`: `id`, `label`, `count`, `severity` = `critical` / `warning` / `info`, `href`). Položky s počtem 0
se nezobrazí, řadí se podle závažnosti. Jádro hlídá: čekající registrace, studenty bez třídy, denní úlohu
(chybí `CRON_SECRET`, neběžela, selhala), e-maily (nenastavené, čerpání denního/měsíčního limitu, neúspěšné
za 24 h), Microsoft 365 nenastaveno (jen informativně), předměty bez ročníků a bez úvazku, třídy bez úvazků.
Semináře přidávají nezapsané v každém otevřeném okně, Dopisování nadcházející termíny bez předmětů nebo
s neaktivním dozorem. Nový modul přidá položku jedním voláním `getAdminTodos` (oprávnění si hlídá sám).

### Jednotné nastavení (`lib/settings-registry.ts`)

Každé nastavení je **deklarace** (`SettingDeclaration` v `modules/types.ts`): `key`, `type`
(`boolean` / `number` / `string` / `enum`), `default`, `label`, `description`, `options` (enum), `min`/`max`
(celá čísla), `maxLength`, `validate`, `permission` (oprávnění k zápisu, výchozí `core.admin`), `hidden`
(spravuje ho vlastní obrazovka, generický formulář ho vynechá) a `audit` (`action` pro historii, `group`
= více nastavení jedním záznamem). Deklarace jsou v `settings` manifestů (jádro má i historické klíče bez
prefixu, např. `registration_enabled`; nové klíče modulů mají prefix `<modul>.`, hlídá to
`npm run test:contract`). Registr k nim sám přidá zapnutí modulů (`module.<id>.enabled`) a e-mailové události
(`email.event.<id>.enabled|subject|body`).

- **Uložení** zůstává v `SystemSetting` pod původními klíči a ve stejném tvaru (boolean `"true"`/`"false"`,
  číslo jako text, enum a text jako text), takže přechod na registr nezměnil žádná uložená data.
  Neplatná uložená hodnota se čte jako výchozí.
- **Čtení**: `getSetting(key)` / `getSettingValues(filter)` – jeden dotaz na požadavek (React `cache`),
  doplní výchozí hodnoty. Starší funkce (`isRegistrationEnabled`, `getAuthSettings`, `loadEmailConfig`,
  `getAuditRetentionYears`, …) jsou tenké obálky nad ním.
- **Zápis**: `saveSettings(user, { klíč: hodnota }, { audit? })` – ověří oprávnění (a zapnutý modul),
  zvaliduje podle deklarace, uloží jen změněné hodnoty a zapíše **historii změn ve stejné transakci**
  („Výchozí kapacita termínu: 10 → 25“); beze změny se nezapíše nic. Je to jediná cesta zápisu; akce
  `saveSettingsAction` ji nabízí formulářům. Složitější obrazovky (šablony upozornění, zapnutí modulů)
  validují po svém a volají `saveSettings` s vlastním záznamem do historie (`opts.audit`).
- **Formuláře**: `describeSettings(user, filter)` vrátí pole pro komponentu `SettingsForm`
  (přepínač a výběr se ukládají hned, číslo a text tlačítkem Uložit). Stránka sekce modulu tak stojí jen na
  deklaracích: viz `app/makeup/settings/page.tsx`.

## Zapnutí a vypnutí modulu

Administrace → **Moduly**. Vypnutý modul:

- zmizí z menu (seznam zapnutých modulů je v session, `useAuth().enabledModules`) i z menu administrace,
- má stránky vracející 404 (layout volá `ensureModulePage("<id>")`),
- má server actions, které vyhodí chybu (`requirePermission` / `requireModule`),
- nepřispívá na dashboard ani do statistik.

Data zůstávají v databázi.

## Jak přidat nový modul

Vzorem je modul Dopisování (`modules/makeup/`).

```bash
npm run new-module <id> "<Název>"   # např. npm run new-module attendance "Docházka"
```

Příkaz (`scripts/new-module.mjs`, jen Node) vytvoří kostru a zaregistruje ji v obou registrech:
`modules/<id>/manifest.ts`, `modules/<id>/server.tsx`, `app/<id>/layout.tsx` (`force-dynamic` +
`ensureModulePage`), `app/<id>/page.tsx` a prázdný `e2e/NN-<id>.spec.ts`. `id` jsou malá písmena a číslice.
Dál ručně:

1. V `manifest.ts` doplnit oprávnění (prefix `<id>.`), menu a chráněné cesty (`routes`); případně
   sekci administrace (`adminSections` + stránka obalená `<AdminShell>`, cesta musí být v `routes`)
   a deklarace nastavení (`settings`, klíče `<id>.…`, `permission` modulu).
2. Modely do `prisma/schema.prisma` (do vlastní sekce) a migrace
   (`npx prisma migrate dev --name <id>`, viz níže).
3. Server actions do `modules/<id>/actions/*.ts` (`"use server"`). Každá začíná
   `requirePermission(...)`.
4. Stránky do `app/<cesta>/` (každá složka cest modulu má `layout.tsx` s `ensureModulePage("<id>")`
   a `export const dynamic = "force-dynamic"`).
5. V `server.tsx` implementovat potřebné body rozšíření (widget, statistiky, `onUserDelete` pro tabulky
   odkazující na uživatele, `getSubjectTabs` / `getSubjectBadges` / `getSubjectUsage`, `getAdminTodos`, …).
6. Časy zobrazovat přes `lib/datetime.ts` (pásmo Europe/Prague). Server na Vercelu běží v UTC.
7. Modul nesmí importovat jiný modul ani ho jádro (ESLint to hlídá); sdílené věci do jádra.

Kontrolní seznam před PR: `npm run typecheck`, `npm run lint` (0 chyb), `npm run test:contract`,
`npm run build`, `npm run test:e2e`; E2E test modulu; aktualizovaná tato dokumentace.
Ručně (bez příkazu) se modul přidá do `MODULES` v `modules/registry.ts` a do `MODULE_SERVERS`
v `modules/server-registry.ts`.

### Chyby v server actions (důležité)

V produkčním buildu Next.js **nahradí text výjimky** vyhozené ze server action obecnou
hláškou. Uživatel by místo „Učebna je obsazená“ viděl „An error occurred…“. Akce, jejichž
chyby má uživatel vidět, proto:

```ts
// server ("use server")
export async function createSessions(input: …) {
  return safeAction(async () => {          // lib/safe-action.ts
    const user = await requirePermission("makeup.sessions.manage");
    if (…) throw new Error("Učebna je v tu dobu obsazená.");
    …
  });
}

// klient
const count = unwrap(await createSessions(input));     // lib/action-result.ts
onSubmit={() => unwrapAsync(registerForSession(…))}    // jako callback
```

`safeAction` předá text běžných chyb a chyby databáze nahradí obecnou hláškou. Takto jsou
napsané všechny mutace v aplikaci. Výjimkou je zápis a odepsání semináře
(`modules/seminars/actions/enrollment.ts`): ty už původně vracely `{ success } | { error }`.

## Modul Dopisování písemek (`modules/makeup`)

- **Termín** = čas a místo dozoru (učitele): datum, od–do, učebna, kapacita (na celý termín),
  povolené předměty, uzávěrka změn (do začátku / 30 min / 1 h / 2 h / 24 h / 48 h předem)
  a poznámka. Učitel ho vypisuje sobě, admin komukoli. Lze vytvořit **opakovanou řadu**
  (každý týden do zvoleného data, max. 60 termínů).
- **Kontroly:**
  - dozor nemá dva termíny současně,
  - učebna není obsazená dvakrát,
  - student nemá dva zápisy, které se časově překrývají.
- **Povolené předměty** termínu jsou všechny aktivní předměty (jádro).
- **Student** (studující, všechny ročníky) má **jednu tabulku termínů** ve stylu zápisu seminářů:
  nadcházející nezrušené termíny a termíny, kde je zapsaný (i zrušené, zvýrazněné). Sloupce:
  termín, učebna, dozor, předměty (zvýrazněné předměty jeho ročníku a třídy), obsazenost, akce.
  Řádek, kde je zapsaný, je zvýrazněný a ukazuje jeho předměty (s vyučujícím) a poznámku; akce
  Upravit / Přepsat / Odhlásit platí do uzávěrky, potom je tam „zapsáno, změny uzavřeny“.
  Ostatní řádky nabízejí Zapsat se, nebo „plno“ / „po uzávěrce“ / „kolize s jiným zápisem“.
  Nad tabulkou je filtr předmětu a přepínač „Jen moje zápisy“; proběhlé zápisy s docházkou jsou
  sbalený seznam pod tabulkou. Ze zrušeného termínu se lze odhlásit nebo přepsat kdykoliv.
- **Vyučující**, kterému student píše: úvazek pro třídu studenta v aktuálním roce; když
  úvazek není a student je zapsaný do výskytu toho předmětu v zápisu (modul Semináře), vezme
  se učitel výskytu. Učitel vidí přehled „Kdo dopisuje moje písemky“.
- **Dozor (a admin):**
  - upraví termín i s přihlášenými (kapacita nesmí klesnout pod počet zapsaných a nelze
    odebrat předmět, který si někdo zvolil),
  - zruší termín nebo celou řadu (s důvodem),
  - smaže termín bez zápisů,
  - odepíše nebo přesune studenta (uzávěrka se u něj nekontroluje),
  - po začátku termínu zapíše docházku (dopsal/a – nedostavil/a se),
  - vytiskne seznam.
- **Oprávnění:**
  - `makeup.view` (všichni),
  - `makeup.register` (studenti),
  - `makeup.sessions.manage` (učitelé, vlastní termíny),
  - `makeup.sessions.manageAll` (admin),
  - `makeup.subjectTeacher`.
- **E-mailová upozornění:** zrušení a změna termínu, odepsání a přesun studenta dozorem, denní
  připomínka a souhrn (viz Upozornění).
- **Zatím chybí:**
  - import termínů z Excelu (čeká na ukázku tabulky),
  - omezení počtu zápisů na studenta.

## UI konvence

- **Stránka:** obsah je v `container` z layoutu (odsazení 16 px na mobilu, víc na desktopu).
  Stránky si samy nenastavují šířku (`max-w-*`), aby všechny začínaly na stejné hraně.
- **Hlavička:** vždy `PageHeader` (`components/page-header.tsx`). Nadpis, popis, akce vpravo
  a volitelný odkaz `back`.
- **Rozbalovací seznamy:** `Select` (shadcn), nebo `NativeSelect`
  (`components/ui/native-select.tsx`) se stejným vzhledem. Holý `<select>` ne.
- **Datum a čas:** jen přes `lib/datetime.ts` (`formatDateTime`, `formatTimeRange`, …). Pásmo
  je Europe/Prague a výstup stejný na serveru i v prohlížeči. `toLocaleString()` bez
  locale dává americký formát.
- **Pojmy:** všude „předmět“ (jeden model `Subject`); „seminář“ zůstává jen v názvu modulu
  Zápis seminářů a v hovorovém označení volitelných předmětů.
- **Název aplikace:** `lib/app-config.ts`. Změna bez úpravy kódu přes proměnnou prostředí
  `NEXT_PUBLIC_APP_NAME` (na Vercelu, pak nový build). Výchozí je „Školní informační systém“.

## Proměnné prostředí

| Proměnná | Význam |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `NEXTAUTH_SECRET` | tajemství pro session; podepisuje i cookie náhledu „zobrazit jako“ |
| `NEXTAUTH_URL` | veřejná adresa aplikace (odkazy v e-mailech, Microsoft 365) |
| `RESEND_API_KEY` | klíč k Resendu (tajný, jen env) |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | výchozí odesílatel a reply-to, v administraci přepsatelné |
| `EMAIL_TRANSPORT` | `log` = e-maily se jen zapisují do `EmailLog` (testy) |
| `CRON_SECRET` | tajemství pro `/api/cron/daily`; na Vercelu ho Vercel Cron posílá jako `Authorization: Bearer …`. Bez něj cron nic nespustí. Dlouhá náhodná hodnota. |
| `AZURE_AD_*` | přihlášení přes Microsoft 365 (viz výše) |
| `NEXT_PUBLIC_APP_NAME` | název aplikace |

## Testy a CI

- **E2E testy** (`e2e/*.spec.ts`, Playwright) proklikají aplikaci v prohlížeči nad skutečnou
  databází:
  1. role, oprávnění a moduly,
  2. třídy, předměty, úvazky, import a cílení zápisu,
  3. dopisování (termíny, zápisy, docházka),
  4. uzavření roku (změna třídy, opakování, absolvování, odchod, úvazky),
  5. registrace se třídou a schvalování hostů,
  6. tabulka dopisování pro studenta,
  7. zkušební e-mail a přehled odeslaných e-mailů,
  8. upozornění: limity, vypnuté události, odhlášení z nepovinných, nezapsaní studenti a ruční připomínka,
  9. denní cron (autorizace, připomínky, souhrny, idempotence, úklid),
  10. historie změn,
  11. náhled „zobrazit jako“ (data studenta, odmítnutí změn, podvržené cookie).

  Vypnutí modulu Semináře (test 1) ověřuje, že z detailu i seznamu předmětů zmizí jeho panel a štítek.
- **Kontraktový test modulů** (`npm run test:contract`, `scripts/contract-test.ts`, bez DB a buildu, běží
  v CI v jobu „checks“): unikátní id, shoda `registry.ts` a `server-registry.ts`, oprávnění s prefixem modulu,
  cesty a menu chráněné oprávněním vlastního modulu, každý nejádrový modul má layout s `ensureModulePage`
  a `force-dynamic` (vypnutý modul = 404), platné deklarace `adminSections` a `settings`.
- E-maily se v testech neposílají: `EMAIL_TRANSPORT=log` jen zapisuje `EmailLog`. Test cronu potřebuje
  `CRON_SECRET` (v CI je nastavený, lokálně např. `CRON_SECRET=test-cron`).
- **Před každou sadou se databáze vyprázdní a naplní seedem.** Proto
  **nikdy neukazujte `DATABASE_URL` na produkci**.

```bash
# po přidání modulu smazat starou cache zapnutých modulů: rm -rf .next/cache/fetch-cache
# lokálně (testovací DB v DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000)
npm run db:migrate && npm run build && npm run test:e2e
```

- **GitHub Actions** (`.github/workflows/ci.yml`) běží u každého pull requestu a pushe do `main`:
  - typecheck, lint, kontraktový test modulů, build,
  - E2E testy s PostgreSQL v kontejneru.

  Při selhání se uloží report s trasami a screenshoty.
- Doporučení: v nastavení repozitáře nastavit kontroly „Typecheck, lint, build“ a „E2E
  testy“ jako povinné pro merge do `main`.

## Databáze a migrace

Dřív se schéma měnilo přes `prisma db push`. Od teď se schéma mění výhradně migracemi.
**Produkční nasazení na Vercelu migrace aplikuje samo:** Vercel místo `build` spouští skript
`vercel-build` (`scripts/vercel-build.sh`), který při `VERCEL_ENV=production` nejdřív pustí
`prisma migrate deploy` a pak `next build`. Když migrace selže, build skončí chybou a dál běží
předchozí verze. Preview nasazení migrace přeskakují, protože mohou sdílet produkční databázi
a migrovala by ji každá větev. V nastavení projektu na Vercelu nesmí být přepsaný Build Command,
jinak se `vercel-build` nespustí.

| Příkaz | Kdy |
|---|---|
| `npx prisma migrate dev --name <popis>` | lokálně/na vývojové DB: vytvoří a aplikuje novou migraci |
| `npm run db:status` | stav migrací na DB z `DATABASE_URL` |
| `npm run db:migrate` | aplikuje čekající migrace (`prisma migrate deploy`) na DB z `DATABASE_URL` |
| `npm run db:seed` | naplní prázdnou DB testovacími daty |

Ruční `npm run db:migrate` s produkčním `DATABASE_URL` zůstává jako záložní cesta (např.
když je potřeba migraci pustit dřív, než se nasadí kód).

### Nasazení verze 10/2026 (nová databáze)

Zpětná kompatibilita se starými daty se nezachovává. Historie migrací začíná jednou čistou
migrací `20261024000000_init` a produkční databáze se založí znovu:

1. Na Vercelu (Storage) vytvořit novou databázi Prisma Postgres a připojit ji k projektu.
   Starou databázi jen odpojit, poslouží jako záloha. Zkontrolovat, že `DATABASE_URL`
   v Environment Variables patří nové databázi.
2. Merge do `main`. Produkční build sám založí tabulky (`prisma migrate deploy`).
3. Ověřit v logu buildu řádek „All migrations have been successfully applied.“
4. Návrat zpět: Instant Rollback na předchozí nasazení a znovu připojit starou databázi.
5. Naplnění:
   - první registrovaný uživatel se stane adminem,
   - Administrace → Školní rok a třídy: zkontrolovat školní rok,
   - Administrace → Školní rok a třídy: založit třídy (generátor 1–4 × A, B, C),
   - Uživatelé: import studentů se sloupcem `class` a učitelů,
   - Předměty: založit předměty (ročníky) a nastavit vyučující,
   - Zápisy: zápisová okna.

Migrace `20261025000000_predmety_tridy` (předměty a pevné třídy) data zachovává: řádky
`Seminar` přenese do `Subject` se stejným id (zkratka, která by kolidovala, se vyprázdní),
třídy z kohort (rok nástupu) převede na pevné třídy podle dnešního ročníku a historii zařazení
a úvazky z minulých let přepojí na třídu, ve které studenti v tom roce skutečně byli. Třídy mimo
ročníky 1–4 smaže (studující zůstanou bez třídy, absolventi si ponechají poslední třídu).

Do budoucna platí: každá změna schématu = nová migrace (`npx prisma migrate dev`), na
produkci ji aplikuje produkční build. Migrace musí být kompatibilní s běžící verzí
(přidávat sloupce s výchozí hodnotou, mazat až v další verzi), protože se aplikuje chvíli
před přepnutím na nový kód.

## Bezpečnostní opravy provedené při refaktoringu

- Hash hesla se už neposílá do prohlížeče. Dřív ho obsahovaly objekty učitelů u výskytů
  seminářů (vidět i pro studenty) a seznam uživatelů. Nově ho Prisma globálně vynechává.
- Odstraněna nepoužívaná akce `getUserByEmail`, kterou mohl kterýkoli přihlášený uživatel
  získat cizí účet včetně hashe hesla.
- Akce pro čtení zápisových oken vyžadují přihlášení. Student už nedostane skryté okno
  ani koncept, ani když akci zavolá s jinými parametry.
- `getUsersForFilters` vrací studentům jen učitele a adminy, ne seznam všech uživatelů.
- Změna role a deaktivace účtu platí hned, ne až po novém přihlášení.
- Role při změně role a importu uživatelů se validuje.
- Pomocné autorizační funkce už nejsou v `"use server"` souboru, takže nejsou
  zavolatelné z klienta.
