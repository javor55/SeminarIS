# Modulární architektura

Od 10/2026 je SeminarIS rozdělený na **jádro** a **moduly**. Pořád je to jedna Next.js
aplikace s jednou databází (modulární monolit), ale každá funkční oblast má svůj kód
pohromadě a do systému se zapojuje přes manifest. Prvním modulem je zápis seminářů,
dalším bude zápis na dopisovací písemky.

## Struktura

```
modules/
  types.ts              typ ModuleManifest (čistá data)
  server-types.ts       typ ModuleServer (serverové háčky)
  registry.ts           seznam modulů, can(), menu, oprávnění k cestám  ← i pro middleware a klienta
  server-registry.ts    serverové části modulů                           ← jen server
  core/                 jádro: uživatelé, třídy, předměty, profil, administrace
    manifest.ts
    server.tsx          dashboard (výzva k výběru třídy, čekající účty), statistiky do administrace
    settings.ts         globální nastavení (registrace, výchozí role, výběr třídy při registraci)
    school.ts           dotazy nad školou pro všechny moduly (aktuální rok, ročník studenta, setStudentClass, …)
    actions/            server actions: users.ts (vč. stavu studia), classes.ts, approvals.ts, subjects.ts,
                        assignments.ts (úvazky), school.ts (školní rok, uzavření roku), admin.ts, profile.ts
    components/         users/ (vč. záložek Třídy a Ke schválení), subjects/, admin/ (školní rok, uzavření roku)
  seminars/             zápisová okna a zápis studentů do předmětů (semináře)
    manifest.ts
    server.tsx          widget na dashboard, statistiky, úklid při mazání uživatele
    window-status.ts    synchronizace stavu zápisového okna s časem
    eligibility.ts      cílení zápisových oken na ročníky
    subject-windows.ts  „v zápisu“: ve kterých oknech je předmět nabízen (pro jádro)
  makeup/               dopisování písemek (termíny, zápisy, docházka)
    manifest.ts, server.tsx, data.ts (interní dotazy), types.ts
    actions/            sessions.ts (dozor), registrations.ts (student)
    components/
    actions/            subjects.ts, windows.ts, enrollment.ts
    components/         blocks/, enrollment/, occurrences/, subjects/
lib/
  session.ts            getCurrentUser, requireAuth, requireModule, requirePermission
  modules.ts            zapnuté moduly (SystemSetting `module.<id>.enabled`), ensureModulePage
  settings.ts           getSetting / setSetting
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
| `SchoolYear` | školní rok (`startYear` 2026 = 2026/27), právě jeden je aktuální | Administrace → Školní rok |
| `ClassGroup` | **pevná třída** = ročník (`grade` 1–4) + písmeno; třídy se zakládají jednou | Uživatelé → Třídy |
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

Stránka **Škola** už neexistuje: školní rok je v Administraci, třídy v Uživatelích, předměty
v menu Předměty a úvazky v detailu předmětu a u učitele.

### Předměty (`/subjects`, jádro)

Jeden model `Subject` pro všechno (dřív zvlášť `Seminar` a `Subject`). Žádný „typ“ předmětu:

- `grades` jsou ročníky, ve kterých se předmět vyučuje (prázdné = všechny), `code` je nepovinná
  a jedinečná zkratka. Oprávnění `core.subjects.view` (student, učitel, admin),
  `core.subjects.edit` (učitel, admin), `core.subjects.archive` (admin; archivace a trvalé smazání).
- **Do zápisu (blok zápisového okna) lze zařadit jakýkoli aktivní předmět.** U předmětu se
  zobrazuje odvozený štítek „v zápisu: <název okna>“ podle výskytů (`SubjectOccurrence`)
  v nesmazaných blocích (`modules/seminars/subject-windows.ts`).
- Učitel a admin vidí všechny předměty (filtry ročník / v zápisu / stav). Student vidí aktivní
  předměty svého ročníku a předměty nabízené v jemu viditelném zápisu.
- Detail: popis, sylabus, ročníky, vyučující (úvazky), u učitele a admina i zápisy, kde je
  předmět nabízen (panel z modulu Semináře, `SubjectOccurrencesPanel`).
- Dopisování nabízí na termínu všechny aktivní předměty.

### Třídy (Uživatelé → Třídy)

- Záložka **Třídy**: seznam tříd s počty studujících, rozkliknutím studenti třídy a jejich
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

### Uzavření školního roku (Administrace → Školní rok → Uzavřít školní rok…, `/admin/close-year`)

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

Ruční nastavení aktuálního roku (Administrace → Školní rok) je k dispozici jen při prvním
nastavení systému, dokud nikdo není zařazen do třídy. Potom se rok mění jen uzavřením.

### Během roku (Uživatelé)

- **Přesun do třídy:** úprava uživatele, záložka Třídy, nebo hromadně. V historii se zapíše
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

### Nastavení v aplikaci (Administrace → Přihlášení)

- **Přihlášení přes Microsoft 365**: zobrazí nebo skryje tlačítko na přihlašovací stránce.
- **Zakládat účty při prvním přihlášení**: vypnuto (výchozí) = projde jen ten, kdo už je
  v systému (import). Zapnuto = komukoli ze školy se založí účet s výchozí rolí.
- **Kdo se smí přihlásit heslem**: všichni / učitelé a admini / jen admini. Admin vždy.
  Omezení platí jen při zapnutém M365, takže se nikdo nemůže zamknout venku.

## Manifest modulu

`modules/<id>/manifest.ts` obsahuje jen data, takže ho může načíst middleware (Edge),
klient i server:

- `permissions`: oprávnění modulu (`"<modul>.<akce>"`) a role, které je mají,
- `nav`: položky menu včetně oprávnění a pořadí,
- `routes`: prefixy cest, které hlídá middleware,
- `enabledByDefault` / `core`: výchozí stav; jádro nejde vypnout.

## Serverová část modulu

`modules/<id>/server.ts(x)` implementuje `ModuleServer`. Všechny části jsou volitelné:

- `getDashboardWidget(user)` vrací obsah na dashboard, nebo `null`,
- `getAdminStats()` vrací karty se statistikami v administraci,
- `onUserDelete(tx, userId, replacementUserId)` uklidí data modulu v transakci před
  trvalým smazáním uživatele. Běží i u vypnutého modulu.

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

## Zapnutí a vypnutí modulu

Administrace → karta **Moduly**. Vypnutý modul:

- zmizí z menu (seznam zapnutých modulů je v session, `useAuth().enabledModules`),
- má stránky vracející 404 (layout volá `ensureModulePage("<id>")`),
- má server actions, které vyhodí chybu (`requirePermission` / `requireModule`),
- nepřispívá na dashboard ani do statistik.

Data zůstávají v databázi.

## Jak přidat nový modul

Vzorem je modul Dopisování (`modules/makeup/`).

1. `modules/<id>/manifest.ts`: id, název, oprávnění, menu, chráněné cesty.
2. Přidat manifest do `MODULES` v `modules/registry.ts`.
3. Modely do `prisma/schema.prisma` (do vlastní sekce) a vytvořit migraci
   (`npx prisma migrate dev --name <id>`, viz níže).
4. Server actions do `modules/<id>/actions/*.ts` (`"use server"`). Každá začíná
   `requirePermission(...)`.
5. Stránky do `app/<cesta>/` a `layout.tsx` s `ensureModulePage("<id>")`.
6. Podle potřeby `modules/<id>/server.tsx` (widget, statistiky, `onUserDelete`
   pro tabulky odkazující na uživatele) a jeho registrace v `modules/server-registry.ts`.
7. Časy zobrazovat přes `lib/datetime.ts` (pásmo Europe/Prague). Server na Vercelu běží v UTC.

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
- **Zatím chybí:**
  - e-mailové notifikace,
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

## Testy a CI

- **E2E testy** (`e2e/*.spec.ts`, Playwright) proklikají aplikaci v prohlížeči nad skutečnou
  databází:
  1. role, oprávnění a moduly,
  2. třídy, předměty, úvazky, import a cílení zápisu,
  3. dopisování (termíny, zápisy, docházka),
  4. uzavření roku (změna třídy, opakování, absolvování, odchod, úvazky),
  5. registrace se třídou a schvalování hostů,
  6. tabulka dopisování pro studenta.
- **Před každou sadou se databáze vyprázdní a naplní seedem.** Proto
  **nikdy neukazujte `DATABASE_URL` na produkci**.

```bash
# lokálně (testovací DB v DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000)
npm run db:migrate && npm run build && npm run test:e2e
```

- **GitHub Actions** (`.github/workflows/ci.yml`) běží u každého pull requestu a pushe do `main`:
  - typecheck, lint, build,
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
   - Administrace → Školní rok: zkontrolovat školní rok,
   - Uživatelé → Třídy: založit třídy (generátor 1–4 × A, B, C),
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
