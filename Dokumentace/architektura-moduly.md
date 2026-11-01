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
    server.tsx          karta dashboardu (výzva k výběru třídy), statistiky do administrace
    dashboard-cards.tsx karty jádra poskládané z bodů rozšíření všech modulů (Co udělat, Statistiky) + sběr karet modulů
    extensions.ts       sběr bodů rozšíření ze zapnutých modulů (collectSubjectTabs, collectAdminTodos, collectAdminSections, …)
    settings.ts         tenké obálky nad registrem nastavení (registrace, výchozí role, výběr třídy)
    admin-todos.ts      položky přehledu „co udělat“ patřící jádru; system-status.ts stav DB, migrací, cronu, e-mailu
    school.ts           dotazy nad školou pro všechny moduly (aktuální rok, ročník studenta, setStudentClass, …)
    actions/            server actions: users.ts (vč. stavu studia), classes.ts, approvals.ts, subjects.ts,
                        assignments.ts (úvazky), school.ts (školní rok, uzavření roku), admin.ts, profile.ts
    users-filter.ts     filtr seznamu uživatelů (čistá data, parametry URL); users-query.ts dotazy (stránka, počty)
    user-detail.ts      data detailu uživatele (profil, třídy, úvazky, historie, e-maily)
    imports/            importy s náhledem: types.ts (řádek náhledu, počty), users.ts, assignments.ts, subjects.ts
                        (každý „plán“ čte DB a vrací řádky + apply); lib/csv.ts čte CSV, lib/import-samples.ts vzory
    bulk-actions.ts     hromadné akce jádra (přesun, role, aktivita, schválení, studium, e-mail, smazání);
                        bulk-runner.ts společný běh (výběr, náhled, transakce, audit)
    demo/               ukázková data pro prezentaci (F9): index.ts (stav, naplnění, smazání), seed-core.ts, catalog.ts, names.ts, random.ts
    components/         users/ (seznam, detail/, hromadné akce, záložka Ke schválení), subjects/, admin/ (AdminShell, AdminNav, SettingsForm,
                        ModulesForm, školní rok a třídy, uzavření roku, upozornění, historie)
  seminars/             zápisová okna a zápis studentů do předmětů (semináře)
    manifest.ts
    server.tsx          body rozšíření (karty dashboardu, štítky, záložky, todo), statistiky, úklid při mazání uživatele
    dashboard-cards.tsx karty dashboardu: student (Zápis seminářů), učitel (moje semináře v zápisu), admin (průběh zápisů)
    student-windows.ts  JEDINÉ místo, které vybírá okna pro studenta/hosta (stránka Zápisy i karty): viditelná, ne koncept, publikum, průběh
    window-phase.ts     JEDINÝ zdroj pravdy o stavu zápisového okna (koncept / plánováno / otevřeno / uzavřeno), čistá logika + Prisma podmínky
    occurrence-code.ts  kód výskytu „KAJ/A“, bez podkódu „KAJ“ (nikdy koncové lomítko)
    audience.ts         publikum okna a omezení výskytu: typy a čistá logika (isInAudience), bez DB; audience-view.ts popisky pro UI
    eligibility.ts      JEDINÝ zdroj pravdy o způsobilosti: audienceWhere, viditelnost oken a výskytů, zápis publika
    window-rules.ts     pravidla okna (odepsání, termín změn) a bloků (min/max, povinnost), sdílená serverem i UI
    bulk-audience.ts    hromadné akce Uživatelů „Přidat do / Odebrat z publika zápisu“ (bulkUserActions)
    actions/            windows.ts (okna, bloky, výskyty, publikum, duplikace), enrollment.ts (zápis, odepsání, přepsání),
                        participants.ts (jména zapsaných), unenrolled.ts, occurrences.ts
    unenrolled.ts       nezapsaní studenti okna a ruční/automatická připomínka
    notifications.ts    e-maily modulu (zápis otevřen, připomínka nezapsaným) a jeho denní úloha
    demo-data.ts        ukázková data modulu (zápisová okna, bloky, výskyty, zápisy)
    subject-windows.ts  „v zápisu“: ve kterých oknech je předmět nabízen (podklad pro štítky předmětů)
  makeup/               dopisování písemek (termíny, zápisy, docházka)
    manifest.ts, server.tsx, data.ts (interní dotazy), types.ts, notifications.ts (e-maily a denní úloha), demo-data.ts (ukázková data)
    dashboard-cards.tsx karty dashboardu: student (moje zápisy, volné termíny), učitel (dozory, kdo u mě dopisuje), admin (dnes a zítra)
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
  datetime.ts           formátování data a času v pásmu Europe/Prague, odpočty (`formatRemaining`: „8 dní 23 h“)
  names.ts              jména osob: `formatName(u, "list"|"text")`, české řazení (`compareNames`, `sortByName`, `sortByText`)
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
- Učitel a admin vidí všechny předměty (fulltext včetně vyučujících, filtry ročník / štítky modulů /
  stav). Student vidí aktivní předměty svého ročníku a předměty nabízené v jemu viditelném zápisu.
- **Štítky z modulů** (`getSubjectBadges`): Semináře „v zápisu: <okno>“, Dopisování „3 termíny
  dopisování“ (nadcházející neodvolané termíny, odkaz na záložku). Štítek s `filter` tvoří v seznamu
  filtr „má / nemá“ (`<klíč>:yes|no`).
- **Detail se záložkami** (`/subjects/[id]?tab=<id>`, sdílená komponenta `components/tab-links.tsx`,
  stejná jako v detailu uživatele; neznámá nebo nepovolená záložka spadne na první): jádro dává
  **Přehled** (popis, zkratka, ročníky, štítky, sylabus) a **Vyučující** (úvazky, mřížka tříd), moduly
  přes `getSubjectTabs`: **Zápisy** (Semináře, jen učitel a admin: výskyty ve všech oknech a blocích,
  obsazenost, studenti, úpravy) a **Dopisování** (nadcházející a nedávné termíny s předmětem, zapsáno
  /kapacita, počet na tento předmět; jména a docházku vidí admin u všech termínů a učitel u termínů,
  které dozoruje, a u studentů, kterým dopisuje jeho předmět; student vidí termíny a jen svůj zápis).
  Záložka vypnutého modulu zmizí.
- **Archivace a mazání** (`SubjectLifecycleDialogs`, jen `core.subjects.archive`): dialog vždy vypíše
  použití (úvazky z jádra + `getSubjectUsage` modulů). **Použitý předmět nejde trvale smazat** –
  tlačítko mizí a nabízí se archivace; stejně to hlídá server (`deleteSubjectPermanently`). Použití se
  počítá i z **vypnutých** modulů (jejich data po vypnutí zůstávají; v dialogu s dovětkem „modul je
  vypnutý“), takže smazání nic tiše nezničí. Smazat jde jen nepoužitý předmět, zápis v historii.
- **Moje předměty** (`/subjects/mine`, oprávnění `core.subjects.mine` = student a učitel, v menu za
  Předměty): jádro ukazuje učiteli úvazky (předmět × třídy) a studentovi předměty jeho ročníku s vyučujícím
  jeho třídy; sekce modulů přes `getMySubjectsSections` (Semináře: učitel vede výskyty s obsazeností,
  student je zapsán; Dopisování: učitel – kdo dopisuje jeho předměty podle `subjectTeacherId`,
  student – jeho zápisy).
- Formulář termínu dopisování: předměty seskupené podle ročníků (`SubjectPicker`), nahoře předměty
  dozorujícího z úvazků aktuálního roku (admin po přepnutí dozorujícího), hledání bez ohledu na diakritiku.
- Štítky/kategorie předmětů (např. „seminář“, „jazyk“) se neimplementovaly: vyžadují nový model
  a správu číselníku, filtrování podle modulových štítků a ročníku zatím stačí.

### Třídy (Administrace → Školní rok a třídy, `/admin/school-year`)

- V Uživatelích je jen odkaz (`/users?tab=classes` přesměruje admina do administrace). Učitel správu
  tříd nevidí (sekce je jen pro admina); třídu studenta vidí v seznamu uživatelů.
- Sekce **Třídy**: seznam tříd s počty studujících, rozkliknutím studenti třídy a jejich
  přesun do jiné třídy (`setStudentClass`, v historii „přeřazen“). Admin tu generátorem založí
  třídy (ročníky × písmena, např. 1–4 × A, B, C; existující se přeskočí) a smaže prázdnou třídu
  (bez studentů a bez historie zařazení).
- V seznamu uživatelů je sloupec a filtr třídy a hromadná akce **Přesunout do třídy**.
- Import uživatelů: sloupec `class` („3.A“) třídu při chybějící založí (viz Importy s náhledem).

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
- Na dashboardu admina je v kartě **Co udělat** položka „Účty čekající na schválení“ (počet, odkaz na záložku).

### Úvazky

Data `TeachingAssignment(teacher, subject, classGroup, schoolYear)` se upravují vždy pro
aktuální školní rok ze dvou míst (oprávnění `core.school.manage`, tedy admin):

- **detail předmětu → Vyučující 2026/27**: mřížka tříd (řádky = ročníky předmětu, sloupce =
  písmena), čipy učitelů (× odebere), výběr „+ učitel“, tlačítko **Stejný učitel pro celý
  ročník**; ukládá se hned,
- **detail učitele → záložka Úvazky (tlačítko s počtem otevře úpravy)**: seznam „předmět – třídy“ a přidání (předmět + třídy jen
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

- **Přesun do třídy:** úprava uživatele (detail), Administrace → Školní rok a třídy, nebo hromadně. V historii se
  zapíše jako „přeřazen“.
- **Ukončit studium** (detail uživatele → Profil → Ukončit studium): důvod, datum, poznámka. Účet se deaktivuje.
  Stejným tlačítkem se studium obnoví.

### Seznam a detail uživatele (`/users`, `/users/[id]`)

**Seznam** (`app/users/page.tsx`, server): filtrování, řazení a stránkování (50 na stránku) probíhá na serveru
(`modules/core/users-query.ts`). Celý filtr je v URL, takže jde sdílet odkazem:
`/users?q=novák&role=STUDENT&class=3.A&grade=3&study=ACTIVE&active=1&pending=1&noclass=1&sort=email&dir=desc&page=2`.
Parametry čte `parseUserListQuery` (`users-filter.ts`, neplatné hodnoty se ignorují); fulltext hledá každé
slovo ve jménu, příjmení nebo e-mailu. Dlaždice nad seznamem jsou odkazy na hotové filtry.
Řádek má jen rychlé akce (role, aktivita, detail, historie, „zobrazit jako“); ostatní jsou v detailu.

**Výběr řádků:** zaškrtnutá id (i napříč stránkami) nebo **„vybrat všech N odpovídajících filtru“**. V druhém případě
klient neposílá žádná id, jen filtr a odškrtnuté výjimky; id vyhodnotí server (`resolveSelection`). Výběr je omezen na
`BULK_MAX` = 2000 uživatelů (víc se musí zúžit filtrem). **Export CSV** exportuje výběr, bez výběru vše odpovídající
filtru (`exportUsersCsv`, buňky začínající `= + - @` jsou ošetřené proti vzorcům v Excelu).

**Detail** (`app/users/[id]/page.tsx`): učitel čte, správce (`core.users.manage`) upravuje, student a host cizí detail
neotevřou (přesměrování na dashboard, oprávnění `core.users.view`). Záložka je v URL (`?tab=`), neplatná nebo
nedostupná záložka spadne na Profil. Záložky jádra: **Profil** (údaje a akce: upravit, reset hesla, role, aktivita,
ukončení/obnova studia, smazat; „Zobrazit jako“ je v hlavičce), **Třídy** (`ClassMembership`), **Úvazky** (učitel,
admin; úpravy jen s `core.school.manage`), **Historie** a **E-maily** (jen admin, jako Administrace → Historie
a Upozornění). Záložky modulů dodává `getUserTabs`: Semináře **Zápisy** (po zápisových oknech), Dopisování
**Dopisování** (zápisy s docházkou; u učitele dozorované termíny; učitel vidí jen své termíny a písemky svých
předmětů). Vypnutý modul = jeho záložka zmizí.

### Hromadné akce nad uživateli

Akce jsou `BulkUserAction` (`modules/server-types.ts`) v poli `bulkUserActions` modulu. Jádro svoje akce registruje
stejným bodem (`coreServer.bulkUserActions`, `modules/core/bulk-actions.ts`), takže modul přidává akce stejně
(id se prefixuje id modulu, `core.class` → audit `users.bulk.class`). Akce deklaruje `permission`, `params` (parametry
dialogu: výběr, text), `preview` (kdo je dotčen, kdo se přeskočí a proč, co se stane) a `run`. Společný běh
(`modules/core/bulk-runner.ts`, server actions `actions/user-bulk.ts`) zajišťuje:

1. výběr (id, nebo filtr + výjimky vyhodnocené na serveru, strop `BULK_MAX`),
2. **náhled** v potvrzovacím dialogu (`BulkActionDialog`): počet vybraných, počet dotčených, popis dopadu, přeskočení,
   několik jmen; nebezpečné akce (smazání) vyžadují opsání slova `SMAZAT` (kontroluje i server),
3. spuštění: oprávnění akce (nedostupná akce se vůbec nenabídne ani nespustí), **režim „zobrazit jako“ jen pro čtení**
   (`safeAction`), kontrola, že se výběr od náhledu nezměnil (počty), **jedna transakce** (timeout 120 s),
   **jeden souhrnný záznam v historii** `users.bulk.<akce>` s id dotčených v `data.userIds` (historie uživatele
   i Administrace → Historie podle uživatele hromadné akce najdou). Akce vrací `afterCommit` (např. e-mail o schválení).

Akce jádra: přesun do třídy (jen studenti), změna role (sebe přeskočí), aktivovat / deaktivovat (sebe přeskočí),
schválit hosty (třída podle žádosti nebo zvolená), ukončit / obnovit studium, poslat e-mail, trvale smazat (admin,
sebe přeskočí, úklid modulů přes `onUserDelete`).

**Hromadný e-mail** jde přes e-mailovou vrstvu (`sendEventEmail("manual.bulk", …, { content })`): událost `manual.bulk`
**respektuje hlavní vypínač e-mailových upozornění**: při vypnutém se neodešle (příjemci se zapíšou jako
`SKIPPED_DISABLED`), náhled to řekne a akci zablokuje. Přepínač jednotlivé události nemá (ruční událost). Navíc se
**počítá do denního i měsíčního limitu**, co se nevejde, se zapíše jako `SKIPPED_LIMIT`. Odhad (kolik se odešle a kolik zablokuje limit) je v náhledu před
odesláním, vyčerpaný limit akci zablokuje. Příjemci jsou aktivní uživatelé s platným e-mailem, text může obsahovat
`{{jmeno}}`. Neběží v DB transakci (e-mail se nedá vrátit); souhrn do historie se zapíše po odeslání (bez textu zprávy).

Akce modulů: Semináře přidávají **Přidat do publika zápisu** a **Odebrat z publika zápisu** (viz Zápisy seminářů).

Pro moduly jsou připravené funkce v `modules/core/school.ts`: `getCurrentSchoolYear()`,
`getStudentGrade(userId)`, `activeStudentsWhere`, `studentsInGradesWhere(grades)`,
`setStudentClass(...)`, `findOrCreateClass(grade, letter)`.

Zápisové okno (modul Semináře) určuje své **publikum** (kdo ho vidí a smí se zapsat), viz Zápisy seminářů.

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

0. adresy na TLD `.invalid` (ukázková data, RFC 2606) **nikdy neodejdou**: zapíšou se jako `SKIPPED_DISABLED`
   s důvodem „Adresa na doméně .invalid“ (platí i pro zkušební a ruční e-maily),
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
- **Poslat zkušební e-mail sobě** (jediný e-mail, který ignoruje hlavní vypínač; počítá se do limitů). Hromadný e-mail správce (`manual.bulk`) hlavní vypínač respektuje.
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
| Zápis otevřen | studentům z publika okna | vypnuto | ne |
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

## Zápisy seminářů (modul Semináře)

Okno (`EnrollmentWindow`) obsahuje **bloky**, blok **výskyty předmětů** a student se zapisuje do výskytů. Konfigurace
(F5) je rozdělena na publikum okna, pravidla bloků a pravidla okna. Všechna pravidla vynucuje **server** v transakci
(`modules/seminars/actions/enrollment.ts`, zápis v izolaci Serializable s opakováním při souběhu, takže kapacita a
maximum v bloku platí i při současných zápisech); UI pravidla jen zobrazuje.

### Stav okna (F10)

V databázi jsou jen `published` (koncept / zveřejněno), `startsAt` / `endsAt` a `closedEarlyAt` (správce okno předčasně
uzavřel). Dřívější ruční `status` (DRAFT / SCHEDULED / OPEN / CLOSED), který se rozcházel s časem a musel se
„synchronizovat“, i příznak `visibleToStudents` zanikly. Stav **plánováno / otevřeno / uzavřeno se nikde neukládá**,
vždy ho počítá `windowPhase()` v `modules/seminars/window-phase.ts` (server i UI stejnou funkcí):

| Podmínka | Stav |
|---|---|
| `published = false` | Koncept (studenti okno nevidí, nelze se zapisovat, ať jsou data jakákoli) |
| zveřejněno, `closedEarlyAt` v minulosti | Uzavřeno předčasně |
| zveřejněno, před `startsAt` | Naplánováno |
| zveřejněno, `startsAt` až `endsAt` | Otevřeno |
| zveřejněno, po `endsAt` | Uzavřeno |

- **Viditelnost pro studenty = zveřejněno** (jedna věc místo dvou): student vidí jen `published` okna určená jemu
  (`windowsForViewerWhere` v `eligibility.ts` přidává `published: true` ke každému čtení pro studenta a hosta).
- **Zápis rozhoduje server**: `assertWindowOpen` v transakci zápisu a odepsání volá `windowPhase`, takže „zastaralá“
  stránka studenta po uzavření dostane odmítnutí. Admin (`seminars.enroll.anytime`) zapisuje vždy.
- Akce admina na stránce okna: **Zveřejnit** (`setEnrollmentWindowPublished`), **Předčasně uzavřít**
  (`closeEnrollmentWindowEarly`, jen otevřené okno) a **Znovu otevřít** (`reopenEnrollmentWindow`, jen předčasně
  uzavřené okno, dokud neuplynul jeho konec; po konci se upraví konec zápisu). Audit `seminars.window.publish` /
  `unpublish` / `close` / `reopen`. Nové okno je ve výchozím stavu koncept (výchozí hodnotu mění Administrace →
  Semináře), duplikace vytvoří koncept.
- Dotazy bez načtení řádků používají `openWindowWhere()` / `liveWindowWhere()` (statistiky, karty, denní úloha);
  upozornění „zápis otevřen“ se odešle jednou za okno (`openedNotifiedAt`) při prvním čtení otevřeného okna nebo
  denní úlohou (`notifyWindowOpenedIfOpen`).
- **Migrace `20261031100000_zapisova_okna_zverejneni`**: `published = (status <> 'DRAFT' AND visibleToStudents)` (co
  student dřív viděl, vidí i teď; skryté okno, které nebylo koncept, se stává konceptem), ruční `CLOSED` s koncem
  v budoucnosti → `closedEarlyAt = LEAST(updatedAt, now())`, pak se sloupce `status`, `visibleToStudents` a typ `Status` zruší.
  Aplikuje se na prázdnou DB i na DB s daty.

### Publikum okna (`EnrollmentWindowAudience`)

Publikum = **(ročníky ∪ třídy ∪ konkrétní studenti) \ vynechaní studenti**. Položka má typ `GRADE`, `CLASS`, `USER` nebo
`EXCLUDE_USER`; okno **bez kladných položek** (GRADE/CLASS/USER) je určeno **všem aktivním studentům**. Vynechání vyhrává
nad ročníkem, třídou i jmenovitým přidáním. Studenti mimo studium (absolventi, ukončení, neaktivní) v publiku nejsou.
Migrace převedla dosavadní `targetGrades` na položky `GRADE` a sloupec zrušila.

**Jediný zdroj pravdy** je `modules/seminars/eligibility.ts` (čistá logika bez DB v `audience.ts`):
`isInAudience(položky, student)`, `audienceWhere(položky)` (stejná logika jako Prisma podmínka na uživatele),
`windowsForViewerWhere` / `occurrencesForViewerWhere` (co smí vidět konkrétní student), `isStudentInWindowAudience`.
Používá je viditelnost oken (stránka Zápisy, karty dashboardu, seznam, detail), kontrola při zápisu, seznam nezapsaných, exporty, e-mailové odhady,
připomínky i „zápis otevřen“, štítky „v zápisu“ u předmětů a panel výskytů. Nikde jinde se způsobilost nepočítá.

- **Formulář okna** (`AudiencePicker`): ročníky, třídy, hledání studentů (jmenovitě a „kromě“), živý počet a seznam
  studentů, kterých se zápis týká (`previewAudience` na serveru). Publikum okna vidí a mění jen správce zápisů.
- **Hromadné akce v Uživatelích** (bod rozšíření `bulkUserActions` modulu, `modules/seminars/bulk-audience.ts`,
  oprávnění `seminars.windows.manage`): *Přidat do publika zápisu* (parametr = zápis; náhled: kolik studentů se přidá,
  kdo už v publiku je, kdo není aktivní student; ruší případnou výjimku „kromě“) a *Odebrat z publika zápisu* (smaže
  jmenovitou položku, a pokud studenta pokrývá ročník či třída, přidá ho mezi vynechané; už existující zápisy zůstanou).
  Obě akce se **zablokují u okna určeného všem** (přidání by okno omylem zúžilo / odebrání nemá smysl) a odebrání se
  zablokuje, pokud by publikum zůstalo bez kladných položek (to by znamenalo „všichni“). Audit: souhrnný záznam
  `users.bulk.seminars.audience[-remove]` a záznam `seminars.window.audience` u okna.

### Pravidla bloků (`Block`)

- `required`: povinný blok (výchozí). **Nezapsaní** (záložka, karty dashboardu, připomínky, přehled „co udělat“) se počítají
  jen z povinných bloků.
- `minEnrollments` / `maxEnrollments` (výchozí 1 / 1): kolik různých výskytů bloku si student vybere. Povinný blok má
  minimum alespoň 1. Server nedovolí zapsat víc, než je maximum; maximum nejde snížit pod počet zápisů, které studenti
  už mají. V bloku s maximem 1 je v UI „přepsání“ zápisu (jedna transakce `switchEnrollment`: když nový zápis selže,
  původní zůstane).
- Nezapsaný = student z publika, kterému v povinném bloku chybí zápisy do `min` (nebo do počtu výskytů, které si
  může vybrat). Blok bez výskytů nebo bez výskytu určeného pro studenta se mu nepočítá.
- `SubjectOccurrence.restrictGrades` + `restrictClasses`: volitelné **omezení výskytu na ročníky a třídy** (sjednocení,
  obojí prázdné = pro všechny z publika). Student jiné třídy výskyt nevidí (ani blok, který by zůstal prázdný) a server
  ho nenechá zapsat. Učitel a admin vidí omezení u řádku výskytu; zápis za jiné (učitel/admin) omezení obchází.

### Pravidla okna

- `allowSelfUnenroll` (výchozí ano): smí se student sám odepsat **a přepsat** zápis. Učitel a admin mohou vždy.
- `changesUntil` (null = konec okna): student může měnit (odepsat, přepsat) nejpozději do tohoto času; musí ležet mezi
  začátkem a koncem okna. Nový zápis do bloku, kde student zápis nemá, je možný do konce okna.
- `resultsVisibility`: `COUNTS` (výchozí, studenti vidí jen obsazenost) nebo `NAMES` (studenti si na stránce Zápisy otevřou
  seznam jmen zapsaných na výskytu, bez e-mailů; `getOccurrenceParticipants`). Studentovi se do prohlížeče neposílají
  cizí zápisy ani při `COUNTS` (jen jeho vlastní a počty).
- Všechny změny a zápisy jdou do historie (`seminars.enrollment.*`, `seminars.window.*`, `seminars.block.*`,
  `seminars.occurrence.*`), v režimu „zobrazit jako“ se nic neprovede.

### Duplikace okna

*Duplikovat* v hlavičce okna (admin) vytvoří **koncept** `<název> (kopie)`, neviditelný studentům, s bloky (pravidla),
výskyty (kapacita, vyučující, omezení), publikem a pravidly okna; bez zápisů studentů a bez odeslaných upozornění
(`openedNotifiedAt`, `reminderSentOn`). Audit `seminars.window.duplicate`.

### Nezapsaní studenti (Zápisy → detail okna → záložka Nezapsaní)

Aktivní studenti z publika okna, kterým chybí zápisy v povinných blocích (viz Pravidla bloků); u každého jsou vidět
chybějící bloky (u bloků s víc zápisy „zapsáno 1 z 2“). Filtr třídy a export CSV. Tlačítko **Poslat
připomínku nezapsaným (N e-mailů)** (s potvrzením, jen admin) pošle e-maily a zapíše souhrn do historie.
Na dashboardu je počet nezapsaných v kartách učitele („Moje semináře v zápisu“) a admina („Průběh otevřených zápisů“).

## Dashboard a stránka Zápisy pro studenty (F8)

**Dashboard (`/dashboard`) je jen přehled s kartami**; vlastní práce probíhá na stránkách modulů. Moduly dodávají
karty bodem rozšíření `getDashboardCards(user)` (typ `DashboardCard` v `modules/server-types.ts`), jádro je sbírá jen
ze zapnutých modulů (`collectDashboardCards`, chyba modulu jeho karty vynechá) a stránka je vykreslí v mřížce
(`DashboardGrid`; mobil pod sebou, `size` sm / md / lg = třetina / polovina / celá šířka). Karta má nadpis, volitelný
odkaz na stránku modulu a obsah, který si modul připraví podle oprávnění uživatele. `modules/core/dashboard-cards.tsx`
přidává dvě karty jádra poskládané z bodů rozšíření všech modulů, takže zmizí s modulem, který je dodával:
**Co udělat** (`collectAdminTodos`: učitel jen své položky, admin vše, zkrácené na 6 s odkazem do administrace) a
**Statistiky** (`collectAdminStats`, jen admin). Bez karet se ukáže pozdrav a prázdný stav. Karty (`data-card`):

| Role | Karta | Obsah |
| --- | --- | --- |
| Student, host | `seminars.windows` | otevřená / blížící se okna (stav, do kdy, chybějící povinné bloky, „Zapsat se“ / „Upravit zápis“ / „Zobrazit“ → `/zapisy/[id]`); když nic neběží, zapsané semináře z posledního uzavřeného okna |
| Student | `makeup.student` | nadcházející zápisy (termín, učebna, předměty, uzávěrka změn) a počet volných termínů |
| Host | `core.class-request` | výzva „Vyberte svou třídu“ (při zapnutém výběru třídy) |
| Učitel, admin | `seminars.my-occurrences` | semináře, které vedu v otevřených / blížících se oknech: obsazenost a počet nezapsaných v okně |
| Učitel, admin | `makeup.supervision`, `makeup.who-writes` | moje nadcházející dozory (zapsáno / kapacita); kdo dopisuje písemky mých předmětů |
| Učitel, admin | `core.todos` | položky „co udělat“, které se týkají uživatele |
| Admin | `seminars.progress` | průběh otevřených zápisů (hotovo / nezapsaní) s odkazem na detail okna |
| Admin | `makeup.today` | termíny dopisování dnes a zítra |
| Admin | `core.stats` | statistiky modulů |

Dotazy karet jsou hromadné (jeden `findMany` na kartu); jediná smyčka je výpočet nezapsaných pro otevřená okna
(`computeUnenrolled`), kterých je zpravidla málo.

### Stránka Zápisy (`/zapisy`, `/zapisy/[id]`)

Student a host mají v menu **Zápisy** (oprávnění `seminars.enroll.view` = STUDENT, GUEST; cesta `/zapisy` v manifestu
Semináří). Učitel a admin ji nemají (middleware je přesměruje na dashboard) a dál používají `/enrollments`
(`seminars.windows.view`); naopak student se do `/enrollments` nedostane. Zápis do okna je stále chráněn
`seminars.enroll.self` (host jen čte).

- **Seznam** (`listStudentWindows`, `modules/seminars/student-windows.ts`) je jediné místo, které vybírá okna pro
  studenta: jen zveřejněná okna (`published`, ne koncept), jen okna s publikem zahrnujícím studenta (`windowsForViewerWhere`)
  a výskyty zúžené na jeho ročník / třídu (`occurrencesForViewerWhere`). Řadí otevřená (podle konce), naplánovaná,
  uzavřená; u každého okna stav, termíny, zapsané předměty a **chybějící povinné bloky** (`missingBlocksFor` z
  `unenrolled.ts` – stejná logika jako seznam nezapsaných). Okna, bloky, výskyty i moje zápisy načte jeden dotaz.
- **Detail** `/zapisy/[id]` používá od F12 krokové UI studenta (`StudentEnrollmentView`; učitel a admin dál `EnrollmentView`). Data dává
  `getEnrollmentWindowByIdWithBlocks`, která skryté okno, koncept i okno mimo publikum vrátí jako „nenalezeno“ –
  rozhoduje server, ne UI; zápis, odepsání a přepsání navíc vynucují stejná pravidla v transakci (viz Zápisy).
- Štítek „v zápisu“ u předmětů vede studentovi na `/zapisy/[id]`, e-maily „zápis otevřen“ a připomínka nezapsaným
  na detail okna ve `/zapisy`.

### Zjednodušené rozhraní studenta (F12)

Student vidí jen dvě záložky: **Zápis seminářů** a **Dopisování písemek**. Profil, Moje předměty, Katalog předmětů
a Odhlásit se jsou v menu pod kolečkem s iniciálami (`components/student-nav.tsx`); Dashboard a Předměty z hlavní
navigace zmizely, stránky zůstávají po URL. Učitel, admin a host mají navigaci i stránky beze změny (host: úvod
`/dashboard`, zápis jen ke čtení).

- **Viditelnost záložek se počítá na serveru** bodem rozšíření `getStudentTabs(user)` (`ModuleServer`, typ `StudentTab`;
  sběr `collectStudentTabs`, `modules/core/student-nav.ts`). Semináře: aspoň jedno zveřejněné, studentovi určené a
  neuzavřené okno (`listStudentWindows(user, { liveOnly })` = `windowsForViewerWhere` + `windowPhase`); tečka =
  otevřené okno s chybějícím povinným blokem. Dopisování: budoucí nezrušený termín, nebo budoucí přihláška (i na
  zrušený termín). Kořenový layout (`app/layout.tsx`) předá výsledek `AppShell`; po odhlášení klient server-data
  nepoužije. Jedna záložka = bez lišty; žádná = prázdný stav „Teď tu nic nečeká“ na `/dashboard`.
- **Úvod** `/` (server): student → záložka s tečkou, jinak první nedokončená (dopisování), jinak `/dashboard` (prázdný
  stav); ostatní role `/dashboard`. Po přihlášení, registraci i „zobrazit jako“ se jde na `/`.
- **`/zapisy`**: student s jediným neuzavřeným oknem jde rovnou na `/zapisy/[id]`; seznam všech oken je `/zapisy?vse=1`.
- **Zápis po krocích** (`StudentEnrollmentView`, model `student-blocks.ts`): bloky jsou sbalitelné karty (při zápisu
  akordeon, rozbalený je blok na řadě); hotový blok = fajfka a název vybraného. Vybrat / Vyměnit (`switchEnrollment`) /
  Odepsat, nepovinný blok „Nechci nic z tohoto bloku“, lepivá lišta „Zbývá vybrat / Zápis je kompletní“ (telefon), panel
  „Váš výběr“ (počítač). Pravidla vynucuje server beze změny. `data-testid`: `block-toggle`, `block-name`, `block-state`,
  `block-progress`, `enroll-button` (`data-action` enroll/switch), `unenroll-button`, `skip-block`, `participants-button`,
  `enrollment-status-bar`; karty mají `data-block`, `data-occurrence`.
- **Dopisování** (`StudentMakeupView`): Moje přihlášky (`data-registration`, `data-session-id`) a čipy předmětů
  (`data-subject-chip`); po výběru čipu karty termínů (`data-session`) s tlačítkem Přihlásit se → dialog s předvyplněným
  předmětem a poznámkou pro vyučujícího (`MakeupRegistration.note`, bez migrace).
- E2E: `e2e/22-student-ui.spec.ts` (navigace podle stavu, kroky zápisu, Vyměnit, nepovinný blok, dopisování s poznámkou,
  host), mobil v `e2e/21-mobile.spec.ts`; helpery `occ`, `pickSubjectChip`, `waitForAppHome`.

## Ukázková data pro prezentaci (Administrace → Ukázková data, `/admin/demo`, F9)

Jen admin (`core.admin`; akce v režimu „zobrazit jako“ odmítne `safeAction`). **Naplnit ukázkovými daty** vytvoří
realistická data pro prezentaci, **Smazat ukázková data** smaže jen to, co vytvořila. Obě akce vyžadují opsání slova
(„UKÁZKA“ / „SMAZAT“), zapisují do historie (`system.demo.seed` / `system.demo.clear`) a běží v **jedné transakci**
(timeout 50 s; lokálně naplnění do ~1 s, smazání do ~1 s). Dokud ukázková data existují, nejdou naplnit znovu.

- **Evidence** `DemoRecord { model, recordId }` (unikátní dvojice, bez relací; migrace `20261031000000_ukazkova_data`):
  každý vytvořený záznam se zapíše ve stejné transakci (`ctx.track(model, ids)`). Mazání jde podle evidence,
  moduly nejdřív (`demoData.clear`), jádro nakonec (`modules/core/demo/index.ts`).
- **Bod rozšíření** `ModuleServer.demoData` (`ModuleDemoData`): `seed(tx, ctx)` dostane admina, čas, deterministický generátor
  (`ctx.rng`, pevný seed `DEMO_SEED`, stejný seed = stejná data), referenční data jádra (`ctx.core`: třídy, učitelé, studenti,
  hosté, předměty, úvazky) a `ctx.track`; `clear(tx, ctx)` dostane `ctx.ids(model)` z evidence. Jádro volá `seed` jen u zapnutých
  modulů, `clear` u všech. Popisky modelů pro přehled dodává `labels`.
- **Co vznikne** (pevné objemy): školní rok (jen když žádný není), třídy 1.A–4.C (existující se použijí a neeviduje se,
  nové ano; 12 tříd), 240 studentů (20 na třídu, zařazení + historie `ClassMembership`), 15 učitelů, 4 hosté čekající na
  schválení (se žádostí o třídu), 22 předmětů (13 povinných podle ročníků, 9 seminářů pro 4. ročník) a úvazky podle ročníků.
  Semináře: otevřené okno „Zápis volitelných seminářů – 4. ročník“ (publikum ročník 4, 3 bloky, 10 výskytů s kapacitami a
  vyučujícími; ~68 % zapsáno úplně, ~15 % jen napůl, zbytek nezapsaný; některé semináře plné) a uzavřené „1. kolo“.
  Dopisování: 10 termínů na příští dva týdny (různí dozoři, učebny, předměty, kapacity; jeden plný) se zápisy a poznámkami
  a jeden proběhlý termín s docházkou. Všechna data jsou relativní k „teď“ (Europe/Prague, víkendy se přeskakují).
- **Bezpečnost**: e-maily `jmeno.prijmeni@ukazka.invalid` (e-mailová vrstva `.invalid` vždy přeskočí), při naplnění se nevolají
  žádné e-mailové události, společné heslo účtů se při každém naplnění vygeneruje náhodně (uloženo v `SystemSetting` `demo.password`, účtům jako bcrypt), zobrazí se jen adminovi v sekci a při smazání se odstraní – v kódu žádné heslo není, aby se do produkce nedalo přihlásit podle zdrojového kódu.
  Sekce nabízí „Zobrazit jako“ pro dva studenty 4. ročníku a učitele (a host jako účet k přihlášení).
- **Mazání**: smaže se jen to, co je v evidenci, a co na tom závisí přes kaskádu (např. zápis skutečného studenta do ukázkového
  výskytu, úvazek skutečného učitele na ukázkový předmět). Skutečné záznamy, které ukázkový uživatel jen vlastnil
  (zápisové okno, termín dopisování), zůstanou a převezme je admin; zápisy ukázkových studentů do skutečných oken se smažou.
  **Třída, ve které zůstal skutečný student (nebo jeho historie zařazení), se nemaže**: zůstane, evidence se jí zbaví a výsledek
  (hláška i historie) ji uvede. Školní rok založený ukázkovými daty se smaže, jen pokud k němu nezůstala žádná historie.

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
- `routes`: prefixy cest, které hlídá middleware (první odpovídající pravidlo vyhrává, konkrétnější dávejte dřív; `exact: true` = jen přesně tato cesta, ne podstránky),
- `enabledByDefault` / `core`: výchozí stav; jádro nejde vypnout,
- `adminSections` (volitelné): položky bočního menu administrace (`label`, `href`, `permission`, `order`;
  jádro 0–99, moduly 100+). Stránka sekce modulu leží ve složce cest modulu (např. `/makeup/settings`,
  chráněná pravidlem v `routes`) a obalí se `<AdminShell>` z jádra, aby měla boční menu,
- `settings` (volitelné): deklarace nastavení (viz Jednotné nastavení).

## Serverová část modulu

`modules/<id>/server.ts(x)` implementuje `ModuleServer`. Všechny části jsou volitelné:

- `getDashboardCards(user)` vrací karty dashboardu pro uživatele (viz Dashboard a stránka Zápisy),
- `getAdminStats()` vrací karty se statistikami v administraci,
- `onUserDelete(tx, userId, replacementUserId)` uklidí data modulu v transakci před
  trvalým smazáním uživatele. Běží i u vypnutého modulu.
- `runDailyJob(now)` je krok denní úlohy (cron, viz Plánované úlohy); vrací seznam kroků s výsledkem,
- `getEmailEstimates()` vrací odhad počtu příjemců hromadných upozornění pro Administraci → Upozornění,
- `demoData` ukázková data modulu pro prezentaci (viz Ukázková data): `{ labels, seed(tx, ctx), clear(tx, ctx) }`.

### Body rozšíření jádra

Jádro o modulech nic neví, moduly do něj jen „přispívají“. Body rozšíření jsou volitelné metody
`ModuleServer` (`modules/server-types.ts`); jádro je sbírá **jen ze zapnutých modulů** funkcemi
v `modules/core/extensions.ts` (`collect*`). Chyba jednoho modulu se zaloguje a jeho příspěvky se
vynechají, stránka jádra se neshodí. Id záložek, štítků a položek jádro prefixuje id modulu
(`seminars.occurrences`). Oprávnění uživatele si bod hlídá sám (jádro kontroluje jen zapnutí modulu).

| Bod rozšíření | Sběr | Použití |
| --- | --- | --- |
| `getSubjectTabs(subjectId, user)` | `collectSubjectTabs` | záložky detailu předmětu `/subjects/[id]` (`?tab=<modul>.<id>`, `data-subject-tab`), jádro má 0–99, moduly 100+ |
| `getSubjectBadges(subjectIds, user)` | `collectSubjectBadges` | štítky v seznamu a detailu předmětů, filtr (`filter`), `grantsAccess` zpřístupní předmět studentovi mimo jeho ročník |
| `getSubjectUsage(subjectId)` | `collectSubjectUsage` | použití předmětu v dialogu archivace/mazání; počítá i vypnuté moduly, použitý předmět nejde smazat |
| `getMySubjectsSections(user)` | `collectMySubjectsSections` | sekce stránky „Moje předměty“ (`/subjects/mine`) |
| `getUserTabs(userId, viewer)` | `collectUserTabs` | záložky detailu uživatele `/users/[id]` (`?tab=<modul>.<id>`), jádro má 0–99, moduly 100+ |
| `getAdminTodos(user)` | `collectAdminTodos` | přehled „co udělat“ v administraci (F2) |
| `bulkUserActions` | `collectBulkUserActions` | hromadné akce v seznamu uživatelů (parametry, náhled dopadu, jedna transakce, audit) |
| `getAdminStats()` | `collectAdminStats` | krátké statistiky pod přehledem v administraci a na dashboardu admina |
| `getDashboardCards(user)` | `collectDashboardCards` | karty dashboardu (`{ id, title, order, size?, content, href?, linkLabel? }`), id prefixované id modulu |
| `demoData` | Administrace → Ukázková data | `{ labels, seed, clear }`: ukázková data modulu; jádro volá `seed` jen u zapnutých modulů, `clear` u všech |
| `adminSections` (v manifestu) | `collectAdminSections` | boční menu administrace (jádro i moduly, podle oprávnění) |
| `settings` (v manifestu) | registr nastavení | deklarace nastavení modulu |

Zapojené jsou `getDashboardCards` (jádro, Semináře, Dopisování), `getSubjectTabs`, `getSubjectBadges`, `getSubjectUsage`, `getMySubjectsSections` (Semináře
i Dopisování), `getAdminTodos` (jádro, Semináře, Dopisování), `getAdminStats`,
`adminSections` a `settings`. `getUserTabs` dodávají Semináře (Zápisy) a Dopisování, `bulkUserActions` jádro
(viz Seznam a detail uživatele) i Semináře („Přidat do publika zápisu“, „Odebrat z publika zápisu“).

### Hranice mezi jádrem a moduly

ESLint (`no-restricted-imports` v `.eslintrc.json`, chyba při `npm run lint`):

- `modules/core/**`, `lib/**`, `components/**` a stránky jádra (`app/**` kromě složek modulů)
  nesmějí importovat `@/modules/seminars/**` ani `@/modules/makeup/**`,
- `modules/seminars/**` (a `app/enrollments/**`, `app/zapisy/**`) nesmí importovat `modules/makeup` a naopak,
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

**Učitel v administraci (jen čtení).** Položka menu „Administrace“ (`core.admin.view`, TEACHER + ADMIN) se ukáže i učiteli.
Učitel vidí jen **Přehled** (`core.admin.view`) a **Školní rok a třídy** (`core.classes.view`): aktuální rok a třídy se
studenty, bez uzavření roku, ručního nastavení roku, importů, zakládání a mazání tříd a přesunů. Všechny ostatní
sekce (`core.admin`) jsou jen pro admina. Oprávnění se vynucuje na třech místech: pravidla cest v manifestu
(`/admin` s `exact: true` → `core.admin.view`, `/admin/school-year` → `core.classes.view`, vše ostatní pod `/admin`
→ `core.admin`), **každá stránka sama** (`requirePagePermission(…)` z `lib/session.ts`) a každá server action
(`requirePermission` – akce mutací vyžadují `core.admin` / `core.users.manage` / `core.school.manage`, nikdy
`*.view`). Nová stránka pod `app/admin` musí volat `requirePagePermission`; kontraktový test to hlídá a porovnává
oprávnění stránky, sekce a pravidla cesty.

| Sekce | URL | Obsah |
| --- | --- | --- |
| Přehled | `/admin` | **Co udělat** + statistiky |
| Registrace a přihlášení | `/admin/registration` | registrace, výchozí role, výběr třídy, Microsoft 365, kdo smí heslem |
| Školní rok a třídy | `/admin/school-year` (+ `/admin/close-year`) | školní rok, uzavření roku, třídy |
| Moduly | `/admin/modules` | zapnutí a vypnutí modulů |
| Upozornění | `/admin/notifications` | e-maily: vypínač, limity, šablony, přehled odeslaných |
| Historie | `/admin/history` | historie změn a doba uchování |
| Diagnostika | `/admin/diagnostics` | databáze a migrace, denní úloha, e-mail, commit nasazení, benchmark |
| Ukázková data | `/admin/demo` | naplnění a smazání ukázkových dat pro prezentaci (jen admin) |
| Semináře | `/enrollments/settings` | výchozí hodnoty nového zápisového okna |
| Dopisování | `/makeup/settings` | výchozí kapacita a uzávěrka nových termínů |

### Přehled „co udělat“

Položky dodává jádro (`modules/core/admin-todos.ts`) a zapnuté moduly přes `getAdminTodos(user)`
(`AdminTodo`: `id`, `label`, `count`, `severity` = `critical` / `warning` / `info`, `href`). Položky s počtem 0
se nezobrazí, řadí se podle závažnosti. Jádro hlídá: čekající registrace, studenty bez třídy, denní úlohu
(chybí `CRON_SECRET`, neběžela, selhala), e-maily (nenastavené, čerpání denního/měsíčního limitu, neúspěšné
za 24 h), předměty bez ročníků a bez úvazku, třídy bez úvazků.
Semináře přidávají nezapsané v každém otevřeném okně, Dopisování nadcházející termíny bez předmětů nebo
s neaktivním dozorem. Nový modul přidá položku jedním voláním `getAdminTodos`.

**Podtitulek** ukazuje „K vyřízení: N · Informace: M“, počty sedí s viditelnými řádky. **Informační položky** (jen
`info`) jde skrýt tlačítkem **Nezobrazovat** (jen admin); seznam skrytých id je v nastavení systému
(`SystemSetting` `core.admin.hiddenTodos`, `modules/core/admin-todo-hidden.ts`), platí pro všechny, pod seznamem je
„Zobrazit skryté informace (n)“; audit `settings.todos.hide` / `settings.todos.show`. Naléhavé a ke zpracování
se skrýt nedají. Microsoft 365 už není položka přehledu: stav je v **Diagnostice → Přihlášení**.

Každá položka nese **`permission`** (výchozí `core.admin`, tj. jen admin) a `collectAdminTodos` ji filtruje podle role
uživatele, takže učitel vidí jen to, co smí řešit: nezapsané studenty v otevřených oknech (`seminars.windows.view`)
a vlastní nadcházející termíny dopisování bez předmětů (`makeup.sessions.manage`; admin vidí všechny). Položky bez
`permission` zůstávají adminovi.

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
- nepřispívá kartami na dashboard ani do statistik.

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
5. V `server.tsx` implementovat potřebné body rozšíření (karty dashboardu, statistiky, `onUserDelete` pro tabulky
   odkazující na uživatele, `getSubjectTabs` / `getSubjectBadges` / `getSubjectUsage` / `getMySubjectsSections`, `getAdminTodos`, …).
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
- **Učitel a admin** (`/makeup`): osobní sekce „Moje termíny (dozor)“ se ukáže jen tomu, kdo nějaký termín vypsal,
  „Kdo dopisuje moje písemky“ jen tomu, kdo má úvazky v aktuálním roce (`getMakeupPersonalInfo`). Seznam termínů
  se jmenuje **Všechny termíny** (admin, včetně vlastních) / Termíny ostatních učitelů (učitel) a má filtry: období
  (nadcházející / tento týden / příští týden / proběhlé / vše; týden pondělí až neděle v pásmu školy), učitel (dozor),
  předmět a „jen s volnými místy“. Filtry jsou v adrese (`?period=&teacher=&subject=&free=1`, `session-filter.ts`),
  seznam dává `getSessions(filter)` (nejvýš 300 řádků).
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
- **Sdílené komponenty (`components/ui`):** `Button`, `Chip` (přepínací čip s `aria-pressed`: ročník, třída, předmět),
  `Input`, `Textarea`, `NativeSelect` (jediný rozbalovací seznam; Radix `Select` v projektu není), `Checkbox` a `Radio`
  (`components/ui/checkbox.tsx`, uvnitř nativní `<input>`, s volitelným `label`), `Switch`, `Label`, `Badge`, `Card`,
  `Table`, `DataTable`, `Dialog`, `AlertDialog` / `ConfirmAction` (potvrzení), `Alert`, `Skeleton`, `Progress`.
  **Žádné holé prvky formuláře** (`<select>`, `<input type="checkbox|radio">`, `<button>`, `<table>`) mimo
  `components/ui`.
- **Oznámení a potvrzení:** chyby a úspěchy přes `toast` (sonner), potvrzení přes `ConfirmAction`. `alert()`,
  `confirm()`, `prompt()` (i `window.*`) zakazuje ESLint (`no-restricted-globals`).
- **Barvy:** žádné natvrdo zadané odstíny (`bg-emerald-600`, `text-red-500`, `border-slate-200`…). Používají se
  sémantické tokeny z `app/globals.css` / `tailwind.config.ts`, které mají světlou i tmavou variantu:
  `text-muted-foreground`, `bg-muted`, `border-border`, `text-foreground` a stavové `success`, `warning`, `info`,
  `danger` (`text-success`, `bg-warning/10`, `border-danger/30`; průhlednost funguje) + `banner` pro výrazný pruh.
  Pro text v červené použijte `text-danger` (`text-destructive` je v tmavém režimu příliš tmavé, `destructive`
  patří jen plným výplním tlačítek). Štítky přes `Badge` (`success`, `warning`, `info`, `danger`, `muted`
  jemné; `successSolid`, `infoSolid` plné; `default`, `secondary`, `outline`, `destructive`).
- **Jména:** jen přes `lib/names.ts`. V tabulkách a seznamech „Příjmení Jméno“ (`formatName(u, "list")`), ve větách,
  hláškách, historii a e-mailech „Jméno Příjmení“ (`"text"`). **Řazení jmen i českých názvů** (předměty) přes
  `compareNames` / `sortByName` / `sortByText` (`Intl.Collator("cs")`: Bartáček < Bartoš < Bartošová, S < Š < T, H < CH),
  nikdy `orderBy` na jméno v databázi: výchozí kolace Postgresu není česká. Lokální Postgres má `cs-CZ-x-icu`,
  Prisma Postgres by ICU kolace mít měl, ale nespoléháme na to: seznamy načtené celé se řadí v JS po načtení a
  stránkovaný seznam uživatelů (`queryUsers`) načte jen `id + jména` všech odpovídajících, seřadí v JS a plné řádky
  načte pro jednu stránku (škola: stovky až tisíce uživatelů). Řazení podle e-mailu, registrace a přihlášení zůstává v DB.
- **Tabulky (`DataTable`):** výchozí 50 řádků na stránku (10 / 25 / 50 / 100).
- **Mobil (pod `md`, < 768 px):** široké tabulky se na telefonu nahrazují kartami pod sebou. `DataTable` má volitelné
  `renderCard`; tabulky mimo `DataTable` používají `ResponsiveView desktop/mobile` a `MobileCard`, `MobileCardField`,
  `MobileCardList` z `components/ui/mobile-card.tsx`. Přepínání dělá `useIsMobile()` (`lib/use-is-mobile.ts`,
  matchMedia, na serveru a při hydrataci `false`): vykreslí se **jen jedna varianta**, ne obě skryté CSS, aby v DOMu
  nebyla duplicitní tlačítka a E2E selektory (`.first()`) netrefily skrytý prvek. Karty mají stejné `data-session` /
  `data-testid` jako řádky; akce jsou tlačítka přes celou šířku vysoká aspoň 44 px (`MobileCardActions`). Na počítači
  se tabulky nemění. Nová tabulka, kterou čtou studenti, má mít kartu; E2E pro mobil: `e2e/21-mobile.spec.ts`.
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
  11. náhled „zobrazit jako“ (data studenta, odmítnutí změn, podvržené cookie),
  12. administrace (sekce, přehled „co udělat“, nastavení),
  13. uživatelé (`13-users.spec.ts`): detail se záložkami (včetně zmizení záložky vypnutého modulu), filtry v URL
      a stránkování na serveru, „vybrat vše odpovídající filtru“ + hromadný přesun s jedním záznamem v historii,
      hromadný e-mail s limitem, ostatní hromadné akce a export CSV, učitel jen čte, student nemá přístup.

  14. předměty (`14-subjects.spec.ts`): záložky detailu podle modulů a oprávnění (admin, učitel, student),
      štítek „N termínů dopisování“ a filtr, dialog použití a zákaz smazání použitého předmětu (i na
      serveru a pro vypnutý modul), Moje předměty (učitel, student, admin bez stránky), seskupený výběr
      předmětů ve formuláři termínu.

  15. konfigurovatelné zápisy (`15-enrollment-rules.spec.ts`), 16. importy s náhledem (`16-imports.spec.ts`),
  17. učitel v administraci (`17-teacher-admin.spec.ts`): vidí jen Přehled (své položky) a Školní rok a třídy bez
      ovládacích prvků, přímé adresy ostatních sekcí ho přesměrují; hlavní vypínač e-mailů blokuje hromadný
      e-mail (`13-users.spec.ts`).

  18. dashboard a stránka Zápisy (`18-dashboard.spec.ts`),
  19. ukázková data (`19-demo.spec.ts`): naplnit → počty a stránky studenta, učitele a admina → smazat (zůstanou jen původní
      data a skutečné záznamy nezávislé na ukázkových) → znovu naplnit stejně, druhé naplnění zablokované, třída se skutečným
      studentem se nesmaže, učitel sekci nevidí, e-mailová vrstva přeskočí adresy `.invalid`.
  20. opravy z procházení obrazovek (`20-opravy-obrazovek.spec.ts`, F10): stav okna (koncept → zveřejněno → předčasně
      uzavřít, server odmítne zápis → znovu otevřít), kód výskytu bez lomítka a bez sloupce pro studenta, české řazení,
      uzavřené okno bez varování, filtry a osobní sekce dopisování, K vyřízení / Informace a Nezobrazovat.

  Vypnutí modulu Semináře (test 1) ověřuje, že z detailu i seznamu předmětů zmizí jeho panel a štítek.
- **Kontraktový test modulů** (`npm run test:contract`, `scripts/contract-test.ts`, bez DB a buildu, běží
  v CI v jobu „checks“): unikátní id, shoda `registry.ts` a `server-registry.ts`, oprávnění s prefixem modulu,
  cesty a menu chráněné oprávněním vlastního modulu, každý nejádrový modul má layout s `ensureModulePage`
  a `force-dynamic` (vypnutý modul = 404), platné deklarace `adminSections` a `settings`, oprávnění pravidla cesty
  shodné s oprávněním sekce administrace a `requirePagePermission` v každé stránce `app/admin/*`.
- **Lint** (`npm run lint` = `eslint . --ext .js,.mjs,.ts,.tsx --report-unused-disable-directives`) pokrývá celý
  repozitář včetně `e2e/` a `scripts/`; chyby i nepoužité direktivy `eslint-disable` shodí CI.
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

Migrace `20261030000000_zapisy_publikum_pravidla` (F5) přidá tabulku publika okna (`EnrollmentWindowAudience`),
pravidla bloků a oken a omezení výskytů. Dosavadní `EnrollmentWindow.targetGrades` převede na položky publika
typu `GRADE` (okna s prázdným polem zůstanou bez položek, tedy pro všechny studenty) a sloupec zruší; stávající
bloky dostanou výchozí hodnoty (povinný, 1 až 1 zápis), okna povolené odepsání a viditelnost jen počtů,
takže se chování existujících zápisů nemění.

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


## Importy s náhledem (uživatelé, úvazky, předměty)

Jeden mechanismus pro všechny importy (`modules/core/imports/*`, akce `modules/core/actions/imports.ts`,
dialog `components/import/ImportDialog.tsx`):

- **Dva kroky.** Klient pošle obsah CSV; `preview…` ho na serveru přečte (`lib/csv.ts`: oddělovač `;`, `,` nebo
  tabulátor se pozná z hlavičky, BOM, uvozovky, české i anglické názvy sloupců bez ohledu na diakritiku) a každý
  řádek zařadí: **nový / změna** (přesný výpis polí „před → po“) **/ beze změny / chyba** (důvod). Nic nezapisuje.
- **Potvrzení nevěří náhledu z klienta.** `confirm…` pošle stejný obsah znovu, na serveru se v jedné transakci
  znovu přečte a zvaliduje (stejná funkce plánu s `tx`), zapíšou se jen platné řádky (chybné se přeskočí) a vznikne
  **jeden** záznam historie se souhrnem a počty (`users.import`, `subjects.assignment.import`,
  `subjects.subject.import`; u uživatelů `data.userIds`, takže se import objeví i v historii uživatele).
  Soubor je omezen na 2 MB a 2000 řádků. Akce jsou `safeAction`, tedy v náhledu „jako uživatel“ zakázané.
- **Uživatelé** (`core.users.manage`; Uživatelé → Import i Administrace → Školní rok a třídy): klíč e-mail
  (bez ohledu na velikost písmen), volba „Aktualizovat existující“ (jméno, příjmení, role, aktivita, třída).
  Hesla existujících uživatelů se nikdy nemění; nový uživatel má heslo ze sloupce `password`, jinak náhodné
  (přihlášení přes M365 / reset). Třída jde jen přes `setStudentClass` (historie `ClassMembership`), chybějící
  třída se založí. Prázdná buňka u existujícího uživatele hodnotu nemění. Nelze měnit vlastní roli ani se deaktivovat.
- **Úvazky** (`core.school.manage`; Administrace → Školní rok a třídy, Předměty): `email_ucitele;kod_predmetu;trida`
  pro aktuální školní rok; chyba při neznámém učiteli / předmětu / třídě, uživateli, který není učitel, archivovaném
  předmětu nebo ročníku, ve kterém se předmět nevyučuje. Jen přidává chybějící úvazky (třídy nezakládá).
- **Předměty** (`core.subjects.edit`; Předměty): `nazev;kod;rocniky` (`1,2,3`, `2-4`, prázdné = všechny), klíč
  zkratka, jinak název; volba „Aktualizovat existující“ (název, ročníky).
- Vzorové soubory (`lib/import-samples.ts`) se stahují z dialogu. E2E: `e2e/16-imports.spec.ts`.
