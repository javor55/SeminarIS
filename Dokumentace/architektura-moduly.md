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
  core/                 jádro: uživatelé, profil, administrace
    manifest.ts
    server.ts           statistiky do administrace
    settings.ts         globální nastavení (ročník, registrace, výchozí role)
    school.ts           dotazy nad školou pro všechny moduly (aktuální rok, ročník studenta, setStudentClass, …)
    actions/            server actions: users.ts (vč. stavu studia), admin.ts, profile.ts, school.ts (vč. uzavření roku)
    components/         users/, admin/, school/
  seminars/             zápis seminářů
    manifest.ts
    server.tsx          widget na dashboard, statistiky, úklid při mazání uživatele
    window-status.ts    synchronizace stavu zápisového okna s časem
    eligibility.ts      cílení zápisových oken na ročníky
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
  school.ts             čisté výpočty: školní rok, ročník, označení třídy („3.A“), popisy stavu studia
app/                    stránky (URL zůstaly beze změny)
components/             sdílené UI (shadcn/ui, editor, topbar)
```

## Školní data v jádru

Všechny moduly sdílí tato data (správa: menu **Škola**, jen admin):

| Model | Význam |
|---|---|
| `SchoolYear` | školní rok (`startYear` 2026 = 2026/27), právě jeden je aktuální |
| `ClassGroup` | třída = písmeno + rok nástupu (`entryYear`) + délka studia (4) |
| `Subject` | školní předmět (Matematika, M) |
| `TeachingAssignment` | úvazek: učitel × předmět × třída × školní rok |
| `User.classGroupId` | aktuální třída studenta (u absolventů a ukončených poslední) |
| `ClassMembership` | historie: třída a ročník studenta v každém školním roce + důvod (zařazen, postup, opakuje, přeřazen) |
| `User.studyStatus` | stav studia: studuje / absolvoval / ukončil (+ důvod, datum, poznámka) |

Ročník se **nepřepisuje**, dopočítá se (`lib/school.ts`): třída s nástupem 2024 je ve
školním roce 2026/27 třída 3.A. Třídu studenta mění jen `setStudentClass()`
(`modules/core/school.ts`), která současně zapisuje historii.

Do modulů se počítají jen **studující** studenti (`activeStudentsWhere`). Absolventi a
ukončení mají deaktivovaný účet, jejich data (zápisy, historie) zůstávají.

### Uzavření školního roku (Škola → Uzavřít školní rok…)

Jednou ročně, typicky na konci srpna. Průvodce ukáže všechny studující se třídou a výchozí
výsledek: **postoupí** (1.–3. ročník), nebo **absolvuje** (4. ročník). Výjimky se nastaví u
konkrétních studentů:

- **Opakuje ročník** (libovolný ročník 1–4): student přejde do třídy o rok mladší, která bude
  v novém roce ve stejném ročníku (ze 2.A do nové 2.A = dnešní 1.A). Písmeno lze změnit, a
  pokud cílová třída neexistuje, založí se.
- **Ukončí studium:** přestup, zanechání, vyloučení, jiný důvod.

Potvrzením se v jedné transakci:
- zapíše historie (postup / opakování),
- absolventům a odcházejícím se nastaví stav a **deaktivují účty**,
- založí se nové 1. ročníky (výchozí A, B, C),
- volitelně se převezmou úvazky do nového roku (kromě absolvujících tříd),
- aktuálním rokem se stane následující školní rok.

Akce se nedá vrátit. Jednotlivé studenty jde ale opravit ručně (přeřazení do třídy,
obnovení studia).

### Během roku (Uživatelé)

- **Přeřazení do třídy:** úprava uživatele, nebo hromadně. V historii se zapíše jako „přeřazen“.
- **Ukončit studium** (ikona čepice u studenta): důvod, datum, poznámka. Účet se deaktivuje.
  Stejnou ikonou se studium obnoví.

Ruční nastavení aktuálního roku (Škola → Školní rok) je k dispozici jen při prvním nastavení
systému, dokud nikdo není zařazen do třídy. Potom se rok mění jen uzavřením.

Pro moduly jsou připravené funkce v `modules/core/school.ts`: `getCurrentSchoolYear()`,
`getStudentGrade(userId)`, `activeStudentsWhere`, `studentsInGradesWhere(grades, startYear)`,
`setStudentClass(...)`, `findOrCreateClass(...)`.

Semináře jsou model `Seminar` (v kódu seminářů se pro ně historicky používá název
„subject“, např. `SubjectOccurrence.subjectId`, v DB sloupec `seminarId`). Zápisové okno
má `targetGrades` (prázdné = všichni studující). Studenti jiných ročníků okno nevidí a
nemůžou se do něj zapsat. Exporty obsahují jen studenty cílových ročníků.

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
- **Student** (studující, všechny ročníky) vidí všechny nadcházející termíny a u nich jen
  počet zapsaných. Zapíše se, vybere předmět(y) z povolených a připíše volitelnou poznámku.
  Do uzávěrky může zápis upravit, odhlásit se nebo se přepsat na jiný termín. Ze zrušeného
  termínu se může odhlásit nebo přepsat kdykoliv.
- **Vyučující** se k zápisu doplní automaticky z úvazků (předmět × třída studenta ×
  aktuální rok). Učitel vidí přehled „Kdo dopisuje moje písemky“.
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
- **Pojmy:** modul Semináře = „seminář“, menu Škola = „předmět“ (školní předmět).
- **Název aplikace:** `lib/app-config.ts`. Změna bez úpravy kódu přes proměnnou prostředí
  `NEXT_PUBLIC_APP_NAME` (na Vercelu, pak nový build). Výchozí je „Školní informační systém“.

## Testy a CI

- **E2E testy** (`e2e/*.spec.ts`, Playwright) proklikají aplikaci v prohlížeči nad skutečnou
  databází:
  1. role, oprávnění a moduly,
  2. škola, import a cílení zápisu,
  3. dopisování,
  4. uzavření roku.
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

Dřív se schéma měnilo přes `prisma db push`. **Build na Vercelu databázi nemění**: spouští
jen `prisma generate` a `next build`. Od teď se schéma mění výhradně migracemi:

| Příkaz | Kdy |
|---|---|
| `npx prisma migrate dev --name <popis>` | lokálně/na vývojové DB: vytvoří a aplikuje novou migraci |
| `npm run db:status` | stav migrací na DB z `DATABASE_URL` |
| `npm run db:migrate` | aplikuje čekající migrace (`prisma migrate deploy`) na DB z `DATABASE_URL` |
| `npm run db:seed` | naplní prázdnou DB testovacími daty |

Migrace se do produkce aplikují **ručně** příkazem `npm run db:migrate` s produkčním
`DATABASE_URL`, a to před nasazením kódu, který je potřebuje. Do buildu se záměrně nedávají:
preview nasazení větví na Vercelu obvykle sdílejí produkční databázi a migrovala by ji každá
větev.

### Nasazení verze 10/2026 (nová databáze)

Zpětná kompatibilita se starými daty se nezachovává. Historie migrací začíná jednou čistou
migrací `20261024000000_init` a produkční databáze se založí znovu:

1. **Záloha** současné DB, pokud z ní chcete něco mít (Neon → Backup / branch).
2. Vyprázdnit produkční databázi. V Neonu nejjednodušeji: smazat a znovu vytvořit databázi
   (nebo nový branch) a aktualizovat `DATABASE_URL` na Vercelu, nebo v SQL editoru
   `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.
3. `DATABASE_URL="<produkční URL>" npm run db:migrate`, založí všechny tabulky.
4. Merge do `main` a nasazení na Vercel.
5. Naplnění:
   - první registrovaný uživatel se stane adminem,
   - Škola: zkontrolovat školní rok, založit třídy,
   - Uživatelé: import studentů se sloupcem `class` a učitelů,
   - Škola: předměty a úvazky,
   - Semináře: zápisová okna.

Do budoucna platí: každá změna schématu = nová migrace (`npx prisma migrate dev`), na
produkci `npm run db:migrate` **před** nasazením kódu.

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
