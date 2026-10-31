# Plán: administrace, uživatelé, předměty napříč moduly, konfigurovatelné zápisy

Velký celek rozdělený do **fází**. Každá fáze je samostatný PR, který se mergne do `main`,
než začne další. Díky tomu jde kdykoli přerušit a pokračovat (i v nové session).

## Jak pokračovat po přerušení
1. Najít první fázi níže, která **není** označená `[x]`.
2. Zkontrolovat větev `claude/adoring-turing-j6cece` a otevřené PR: pokud fáze má rozpracované
   commity nebo PR, dokončit je (kontroly, CI, merge); jinak větev srovnat s `origin/main`.
3. Fázi předat agentovi (Sonnet) s odkazem na tento soubor a sekci fáze, výsledek zkontrolovat
   (oprávnění, migrace, typecheck, lint, build, E2E), pushnout, PR, zelené CI, merge.
4. V tomto souboru fázi označit `[x]` s číslem PR (commit spolu s fází nebo hned po mergi).

## Stav
- [x] F1 Body rozšíření a hranice modulů (PR #6)
- [x] F2 Administrace se sekcemi a přehled „co udělat“, jednotné nastavení (PR #7)
- [x] F3 Detail uživatele a hromadné akce (PR #8)
- [x] F4 Předměty napříč moduly (PR #9)
- [x] F5 Konfigurovatelné zápisy (publikum, pravidla bloků) (PR #10)
- [x] F6 Importy s náhledem (uživatelé, úvazky) (PR #11)
- [x] F7 Učitel v administraci, vypínač hromadného e-mailu, jednotné UI, úklid lintu (PR #12)
- [x] F8 Dashboard jako přehled (karty z modulů) a stránka Zápisy pro studenty (PR #14)
- [x] F9 Ukázková data (naplnit / smazat) pro prezentaci (PR #15)
- [ ] F10 Opravy z procházení skutečných obrazovek (chyby, workflow, sjednocení)

Společná pravidla pro všechny fáze: konvence z `Dokumentace/architektura-moduly.md`
(`safeAction`/`unwrap`, `requirePermission`/`can`, audit `audit(tx, …)` ve stejné transakci,
náhled jako uživatel = jen čtení, `PageHeader`, `NativeSelect`, `lib/datetime.ts`, české texty),
nejvýš jedna nová migrace na fázi (aplikovatelná na prázdnou DB i na DB s daty), aktualizace
dokumentace a E2E testů, hotovo = typecheck, lint, build a E2E projdou.

---

## F1 Body rozšíření a hranice modulů
Cíl: jádro o modulech nic neví, moduly do jádra jen „přispívají“.

- Rozšířit `ModuleServer` (`modules/server-types.ts`) o body rozšíření (všechny volitelné,
  async, dostanou aktuálního uživatele a respektují oprávnění):
  - `getSubjectTabs(subjectId, user)` → záložky detailu předmětu `{ id, label, order, content }`,
  - `getSubjectBadges(subjectIds, user)` → štítky do seznamu předmětů (text, odkaz, filtr),
  - `getSubjectUsage(subjectId)` → kde se předmět používá (pro archivaci/mazání),
  - `getUserTabs(userId, viewer)` → záložky detailu uživatele (F3),
  - `getAdminTodos(user)` → položky přehledu „co udělat“ (F2),
  - `adminSections` v manifestu → položky bočního menu administrace (F2),
  - `settings` → deklarace nastavení modulu (klíč, typ, výchozí hodnota, validace, popisek) (F2).
- Přepojit stávající kód na tyto body: „v zápisu“ u předmětů a panel výskytů v detailu předmětu
  dodává modul Semináře; `modules/core/**` ani `app/subjects/**` nesmí importovat z
  `modules/seminars` nebo `modules/makeup`.
- ESLint `no-restricted-imports` (nebo `import/no-restricted-paths`): jádro (`modules/core`,
  `lib`, `components`, stránky jádra) nesmí importovat moduly; moduly se navzájem neimportují
  (jen přes jádro a body rozšíření). Výjimka jen pro registry (`modules/registry.ts`,
  `modules/server-registry.ts`).
- Šablona modulu: `npm run new-module <id> "<Název>"` vytvoří kostru (manifest, server,
  stránka, layout s `force-dynamic`, prázdný E2E test) a zaregistruje ji; dokumentace
  „Jak přidat modul“ aktualizovaná o body rozšíření a kontrolní seznam.
- Kontraktový test (E2E nebo node test spustitelný v CI): každý manifest má unikátní id,
  oprávnění s prefixem modulu, cesty chráněné oprávněním modulu; vypnutý modul zmizí z menu,
  z detailu předmětu i z administrace.

## F2 Administrace se sekcemi a přehled „co udělat“, jednotné nastavení
- `app/admin/layout.tsx` s bočním menu (na mobilu nahoře jako výběr). Sekce jádra:
  Přehled, Registrace a přihlášení, Školní rok a třídy (rok, uzavření roku, správa tříd –
  přesunout sem z Uživatelů, v Uživatelích nechat odkaz), Moduly, Upozornění, Historie,
  Diagnostika. Moduly přidávají sekce přes `adminSections` (např. Semináře: výchozí nastavení
  zápisů; Dopisování: výchozí uzávěrka, kapacita).
- Každá stávající karta z `app/admin/page.tsx` se přesune do své sekce (stránka = server
  komponenta, klientské jen formuláře).
- **Přehled „co udělat“** (výchozí stránka administrace): položky z jádra i modulů přes
  `getAdminTodos`, každá s počtem, závažností a odkazem na řešení. Minimálně:
  čekající registrace; studenti bez třídy; nezapsaní v otevřeném zápisu; denní úloha
  (kdy naposledy, chyba, chybí `CRON_SECRET`); e-maily (nenastavené, čerpání limitů,
  neúspěšné odeslání za 24 h); M365 nenastaveno (jen informativně); předměty bez ročníků;
  úvazky chybí pro třídy/předměty aktuálního roku; termíny dopisování bez dozoru/předmětů.
  Pod tím krátké statistiky (stávající `getAdminStats`).
- **Jednotné nastavení:** registr nastavení (`lib/settings-registry.ts`) z deklarací jádra
  a modulů: typ, výchozí hodnota, validace (zod nebo ruční), popis; čtení přes jednu
  funkci s cache, zápis přes jednu akci s auditem. Stávající nastavení (registrace, role,
  výběr třídy, M365, upozornění, retence, moduly) na registr převést. Formuláře sekcí se
  z deklarací vykreslují tam, kde to dává smysl (přepínač, výběr, číslo, text).
- Diagnostika: stav DB a migrací (`_prisma_migrations`), poslední běh cronu, e-mail,
  verze/commit nasazení (`VERCEL_GIT_COMMIT_SHA`), stávající benchmark.

## F3 Detail uživatele a hromadné akce
- Stránka `/users/[id]` (učitel čte, admin upravuje) se záložkami:
  Profil (jméno, e-mail, role, aktivita, stav studia, poslední přihlášení, akce: upravit,
  reset hesla, role, ukončení/obnova studia, „Zobrazit jako“, smazat),
  Třídy (historie `ClassMembership`), Úvazky (u učitele), Historie (audit: co dělal
  a co se dělo s ním), E-maily (EmailLog adresáta), a záložky modulů přes `getUserTabs`
  (Semináře: zápisy po oknech; Dopisování: zápisy, docházka, u učitele dozory).
  Dialogy v seznamu uživatelů nahradit odkazem na detail (rychlé akce v řádku mohou zůstat).
- **Seznam uživatelů:** fulltext (jméno, e-mail), filtry role / třída / ročník / stav studia /
  aktivní / „ke schválení“ / „bez třídy“, výběr řádků (i „vybrat vše odpovídající filtru“),
  stránkování na serveru, export CSV vybraných.
- **Hromadné akce** nad výběrem (vše v jedné transakci, audit jedním souhrnným záznamem
  + položky, potvrzení s počtem a náhledem dopadu):
  přesun do třídy, změna role, aktivace/deaktivace, schválit (hosté), ukončit studium
  (důvod), obnovit studium, poslat e-mail (předmět + text, přes e-mailovou vrstvu s limity
  a odhadem počtu), **přidat do publika zápisu** (F5), smazat (jen admin, s dvojitým
  potvrzením). Moduly mohou přidat vlastní hromadné akce (bod rozšíření `bulkUserActions`).
- Uložené pohledy filtrů jsou volitelné (stačí filtr v URL, aby šel sdílet odkaz).

## F4 Předměty napříč moduly
- Detail předmětu se záložkami: Přehled (popis, sylabus, ročníky, kód), Vyučující (úvazky,
  mřížka), záložky modulů přes `getSubjectTabs`:
  Semináře – okna/bloky/výskyty s obsazeností a odkazy; Dopisování – nadcházející a nedávné
  termíny s tímto předmětem, počty, u učitele/admina kdo dopisuje a docházka.
- Seznam předmětů: štítky z modulů (`getSubjectBadges`, např. „v zápisu ZS 2026“,
  „3 termíny dopisování“), filtry podle nich, filtr ročníku, fulltext.
- Archivace/mazání: dialog ukáže použití ze všech modulů (`getSubjectUsage`); smazání
  zakázat, pokud je předmět použitý (nabídnout archivaci).
- „Moje předměty“ (stránka nebo záložka v Předmětech):
  učitel – co učí (úvazky + výskyty v zápisech), kdo jeho předměty dopisuje;
  student – předměty ročníku, zapsané semináře, jeho dopisování.
- Formulář termínu dopisování: předměty seskupené po ročnících, nahoře předměty
  dozorujícího učitele (z úvazků), vyhledávání.
- Volitelné štítky/kategorie předmětů (např. „seminář“, „jazyk“) pro filtrování – jen
  pokud to nezkomplikuje model; jinak vynechat a uvést v reportu.

## F5 Konfigurovatelné zápisy
Zápisy se dnes cílí jen na ročníky (`EnrollmentWindow.targetGrades`). Nově:
- **Publikum okna** = sjednocení: ročníky, konkrétní třídy, konkrétní uživatelé
  (+ volitelně výjimky „kromě těchto uživatelů“). Prázdné = všichni aktivní studenti.
  Model např. `EnrollmentWindowAudience` (typ GRADE / CLASS / USER / EXCLUDE_USER + hodnota).
  Migrace převede `targetGrades`. Všude, kde se dnes počítá způsobilost (viditelnost oken,
  zápis, nezapsaní, e-mailové odhady a připomínky), použít jednu funkci
  `isInAudience` / `audienceWhere` (`modules/seminars/eligibility.ts`).
- UI okna: výběr publika (ročníky, třídy, hledání uživatelů), přehled „kolik studentů to je“
  se seznamem; hromadná akce z Uživatelů „přidat do publika zápisu“ (F3).
  **Hák z F3:** jádro už má celý běh hromadných akcí (výběr, náhled, transakce, audit; viz
  `Dokumentace/architektura-moduly.md`, „Hromadné akce nad uživateli“). Akci F5 přidá modul Semináře jako
  `bulkUserActions` v `modules/seminars/server.tsx` (`permission: "seminars.windows.manage"`, parametr
  `windowId` přes `params`, `preview` s počtem nových členů publika a přeskočenými, `run` zapíše
  `EnrollmentWindowAudience` typu USER); v jádře se nemění nic.
- **Pravidla bloků:** povinný / nepovinný blok (nezapsaní počítají jen povinné), počet
  povolených zápisů v bloku (min/max, výchozí 1/1), volitelně omezení výskytu na ročníky/třídy.
- **Pravidla okna:** může se student sám odepsat (ano/ne), změny povoleny do (konec okna /
  vlastní datum), viditelnost výsledků (kdo je zapsaný – jen počty / jména).
- Kontroly na serveru (ne jen v UI), souběh přes transakci (kapacita, max v bloku), audit.
- Duplikace okna (zkopírovat bloky, výskyty a publikum do nového okna).

## F6 Importy s náhledem
- Import uživatelů ve dvou krocích: nahrát CSV → **náhled** (tabulka: nový / změna – co
  přesně / beze změny / chyba – proč), volby (aktualizovat existující: jméno, třída, role;
  neměnit hesla), potom potvrzení. Import je opakovatelný bez duplicit (klíč e-mail).
  Výsledek do auditu jedním záznamem se souhrnem.
- Import úvazků z CSV (`email_ucitele;kod_predmetu;trida` např. `novak@…;M;2.A`) se stejným
  náhledem, pro aktuální školní rok; vzorový soubor ke stažení.
- Volitelně import předmětů (název, kód, ročníky) se stejným mechanismem.

## F7 Učitel v administraci, vypínač hromadného e-mailu, jednotné UI, úklid lintu
- **Učitel v administraci (jen čtení):** položka menu „Administrace“ i pro učitele, sekce
  podle oprávnění. Učitel vidí: Přehled (jen položky, které se ho týkají / které smí řešit:
  nezapsaní v oknech, termíny dopisování; položky jen pro admina skrýt) a Školní rok a třídy
  (aktuální rok, seznam tříd s počty a studenty – bez úprav, bez importů a bez uzavření roku).
  Ostatní sekce (Registrace a přihlášení, Moduly, Upozornění, Historie, Diagnostika, nastavení
  modulů) zůstávají jen pro admina. Nová oprávnění podle konvence (např. `core.admin.view`
  pro TEACHER+ADMIN, `core.classes.view`), kontraktový test a E2E (učitel vidí jen povolené
  sekce, nic nezmění, přímé URL na adminské sekce ho odmítnou).
- **Hromadný e-mail a hlavní vypínač:** událost `manual.bulk` respektuje hlavní vypínač
  e-mailů (při vypnutém se neodešle, náhled akce to řekne a akci zablokuje). Zkušební e-mail
  sobě může vypínač dál ignorovat. E2E.
- **Jednotné UI** (zjištěno auditem):
  - Radix `Select` → `NativeSelect` (EditEnrollmentDialog, EditSubjectOccurrenceDialog,
    StudyStatusDialog, EditUserDialog),
  - nová komponenta `components/ui/checkbox.tsx` (shadcn styl, přístupná, s labelem) a nahradit
    holé `<input type="checkbox">` (cca 7 souborů),
  - `alert()` / `window.confirm()` → toast / `ConfirmAction` (Semináře: EditEnrollmentDialog,
    EditSubjectOccurrenceDialog, SubjectOccurrencesPanel),
  - formátování dat v `EnrollmentHeader` → `lib/datetime.ts`,
  - holá `<table>` v náhledu importu → `components/ui/table`,
  - natvrdo zadané barvy (`bg-*/text-*/border-*-NNN`, cca 100 výskytů mimo `components/ui`)
    → sémantické tokeny / varianty `Badge` (success, warning, destructive, muted…); doplnit
    chybějící varianty, ověřit tmavý režim,
  - holé `<button>` → `Button` (případně sdílený `Chip` pro čipy učitelů/tříd),
  - dokumentace: oddíl „UI konvence“ doplnit o seznam komponent a pravidlo „žádné holé
    prvky formuláře, žádné natvrdo barvy“; pokud to jde levně, ESLint pravidlo
    (`no-restricted-syntax`) proti `alert`/`confirm`.
- **Úklid lintu:** `npm run lint` ať pokrývá celý repozitář včetně `e2e/` a `scripts/`
  (`next lint --dir .` nebo `eslint .`), opravit všechny chyby (nepoužité importy
  a proměnné v E2E) a ideálně i varování.

## F8 Dashboard jako přehled a stránka Zápisy pro studenty
Dnes modul Semináře vykresluje na dashboard celou tabulku zápisu a student se zapisuje
právě tam, kdežto dopisování je jinde. Cíl: dashboard = **přehled s kartami** pro každou roli,
vlastní práce na stránkách modulů.

- **Bod rozšíření:** místo `getDashboardWidget` nový `getDashboardCards(user)` →
  `{ id, title, order, size?: "sm"|"md"|"lg", content, href?, linkLabel? }[]` (sběr v
  `modules/core/extensions.ts`, jen zapnuté moduly, chyba modulu kartu vynechá). Stránka
  `/dashboard` vykreslí mřížku karet (mobil: pod sebou), pozdrav v `PageHeader`, prázdný stav.
- **Stránka Zápisy pro studenty:** student (a host podle dnešních pravidel) dostane položku menu
  „Zápisy“ a stránku se seznamem jemu viditelných oken (stav, termíny, co má hotovo / co
  chybí v povinných blocích) a detailem okna, kde se zapisuje, odepisuje a přepisuje (přesunout
  sem dnešní zápisové UI z dashboardu; učitel/admin dál používají `/enrollments`). Oprávnění
  a cesty upravit tak, aby student viděl jen okna, která smí (stejné filtry jako dnes:
  `visibleToStudents`, ne koncept, publikum).
- **Student – karty:**
  - Semináře: otevřená / blížící se okna – stav, do kdy, kolik povinných bloků chybí, tlačítko
    „Zapsat se“ / „Upravit zápis“ → stránka Zápisy; po uzavření jeho zapsané semináře.
  - Dopisování: moje nadcházející zápisy (datum, učebna, předměty, uzávěrka změn), počet
    volných termínů, odkaz na Dopisování.
  - Jádro: výzva „Vyberte svou třídu“ (host), případně další upozornění.
- **Učitel – karty:**
  - Dopisování: moje nadcházející dozory (datum, učebna, zapsáno/kapacita), kdo u mě
    dopisuje (nadcházející zápisy na předměty, které učím).
  - Semináře: moje výskyty v otevřených/blížících se oknech s obsazeností a počtem nezapsaných
    v okně (průběh zápisu), odkaz na detail okna.
  - Jádro: položky přehledu „co udělat“, které se ho týkají (z `getAdminTodos`).
- **Admin – karty:** „co udělat“ (zkrácený přehled s odkazem do administrace), průběh
  otevřených zápisů (zapsáno / nezapsaní), dnešní a zítřejší termíny dopisování, statistiky.
- Odstranit `getDashboardWidget` a staré komponenty dashboardu, aktualizovat dokumentaci,
  kontraktový test (nové cesty) a E2E (student se zapisuje na stránce Zápisy, karty podle
  rolí, karta zmizí po vypnutí modulu, skrytý / nepřístupný zápis se nikde neukáže).

## F9 Ukázková data pro prezentaci
Administrace → nová sekce „Ukázková data“ (jen ADMIN): **Naplnit ukázkovými daty** a **Smazat
ukázková data**. Smí se smazat jen to, co ukázková data vytvořila; skutečná data zůstanou.

- **Evidence:** nová tabulka (např. `DemoRecord { model, recordId, createdAt }`, unikátní dvojice)
  – každý vytvořený záznam se do ní zapíše ve stejné transakci. Mazání jde podle evidence
  (v pořadí opačném k závislostem, moduly nejdřív, jádro nakonec); co skutečný uživatel
  vytvořil nad ukázkovými daty (např. zápis skutečného studenta do ukázkového okna), smaže
  kaskáda nebo modul – nikdy nic, co není v evidenci nebo na ní nezávisí.
- **Bod rozšíření:** `ModuleServer.demoData?: { seed(tx, ctx), clear(tx, ctx) }`, kde `ctx`
  nese evidenci (`track(model, id)`), referenční data z jádra (třídy, učitelé, studenti,
  předměty) a deterministický generátor (stejný seed = stejná data). Jádro volá zapnuté
  moduly; vypnutý modul se přeskočí (a při mazání se smaže podle evidence i tak).
- **Obsah (realistický, česky):**
  - jádro: aktuální školní rok; třídy 1.A–4.C (existující třídy použít, nové evidovat),
    ~20 studentů na třídu s českými jmény, ~15 učitelů, 3–5 hostů čekajících na schválení
    (s žádostí o třídu), předměty s ročníky (povinné i semináře pro 4. ročník), úvazky
    podle ročníků;
  - Semináře: jedno otevřené okno pro 4. ročník (publikum), 2–3 bloky s výskyty, kapacitami
    a vyučujícími, část studentů zapsaná (aby byli i nezapsaní), jedno uzavřené starší okno;
  - Dopisování: termíny na příští 2 týdny (různí dozoři, učebny, předměty), zápisy studentů
    s poznámkami, jeden proběhlý termín s docházkou.
- **Bezpečnost:** e-maily `…@ukazka.invalid` (nic neodejde; e-mailová vrstva doménu `.invalid`
  vždy přeskočí), během naplnění se nevolají žádné e-mailové události, společné heslo
  ukázkových účtů zobrazené v sekci (bcrypt), akce jen pro admina s potvrzením (napsat
  „UKÁZKA“ / „SMAZAT“), audit, nelze naplnit podruhé, dokud ukázková data existují,
  transakce (timeout dle potřeby), náhled jako uživatel = jen čtení.
- **UI sekce:** stav (jsou/nejsou ukázková data, počty podle druhu), heslo ukázkových účtů,
  tip „Zobrazit jako“ s odkazy na pár ukázkových účtů (student 4. ročníku, učitel, host).
- **Testy:** E2E naplnit → počty a stránky (dashboard studenta/učitele, zápis, dopisování,
  ke schválení) → smazat → zůstanou jen původní data (seed), skutečný záznam vytvořený
  nad ukázkovými daty se neztratí, pokud na nich nezávisí; druhé naplnění zablokováno;
  učitel sekci nevidí.

## F10 Opravy z procházení skutečných obrazovek
Zjištěno při focení prezentace s ukázkovými daty (1440×900).

**Chyby**
1. Detail zápisového okna (admin, `/enrollments/[id]`): tři bloky vedle sebe jsou příliš úzké –
   názvy bloků se ořezávají („Blok …“), popisy („Vybert…“), akce u každého výskytu (Studenti,
   Upravit, Smazat) jsou pod sebou a řádky jsou vysoké. Bloky pod sebe (celá šířka) nebo
   nejvýš 2 vedle sebe od velké šířky, celý název a popis bloku, akce bloku i výskytu do menu „⋯“
   (nebo kompaktní ikonová tlačítka v jednom řádku).
2. „Kód výskytu“ zobrazuje `SMA/` – bez podkódu nesmí být koncové lomítko (kód předmětu,
   s podkódem `KAJ/A`). Opravit všude, kde se kód skládá (UI, exporty).
3. Řazení českých jmen: všude, kde se řadí podle jména/příjmení (seznam uživatelů – řazení na
   serveru, nezapsaní, výběry, exporty, karty), použít českou kolaci – v SQL `COLLATE "cs-CZ-x-icu"`
   (ověřit, že je v Postgresu dostupná; jinak `"und-x-icu"` nebo řadit v JS přes
   `Intl.Collator("cs")`), v JS `localeCompare(…, "cs")`. Bartáček < Bartoš < Bartošová, S < Š < T.
   Jedna sdílená pomocná funkce. E2E test na pořadí.
4. Student v `/zapisy`: u uzavřeného okna nezobrazovat varování „Chybí zápis v bloku…“
   (jen neutrální „nezapsáno“ / jeho zapsané semináře); varování jen u otevřeného/plánovaného.

**Workflow**
5. Dopisování pro admina (`/makeup`): osobní sekce („Moje termíny (dozor)“, „Kdo dopisuje moje
   písemky“) zobrazit jen tomu, kdo dozoruje nebo má úvazky; seznam termínů přejmenovat
   („Všechny termíny“ pro admina) a přidat filtry: učitel (dozor), předmět, období
   (nadcházející / tento týden / příští týden / proběhlé / vše), jen s volnými místy; filtry v URL.
6. Stav zápisového okna: dnes data + ruční stav (DRAFT/SCHEDULED/OPEN/CLOSED) – zmatené.
   Nově: **Koncept** (nezveřejněno) / **Zveřejněno** (otevření a zavření podle dat) + akce
   **Předčasně uzavřít** (a „Znovu otevřít“, pokud ještě neuplynul konec). Stav zobrazovaný
   v UI se vždy odvozuje z dat (plánováno / otevřeno / uzavřeno). Migrace převede stávající
   okna bez ztráty významu (ruční CLOSED před koncem → předčasně uzavřeno). Všechna místa,
   která dnes čtou `status`, přepojit (viditelnost pro studenty, zápis, cron, e-maily, karty,
   duplikace, ukázková data, E2E). Viditelnost pro studenty = zveřejněno (sloučit s
   „Viditelné pro studenty“, pokud to dává smysl – jinak ponechat a popsat rozdíl).
7. Přehled „co udělat“: počet v podtitulku musí sedět s tím, co je vidět (počítat i informační,
   nebo je oddělit „K vyřízení: 2 · Informace: 2“); informační položky lze skrýt (admin
   „Nezobrazovat“, uloženo v nastavení) a M365 přesunout do Diagnostiky, pokud není zapnuté.
8. Seznam předmětů: výchozí 50 na stránku (a obecně u tabulek s malým počtem řádků).

**Sjednocení**
9. Pořadí jména: v tabulkách a seznamech „Příjmení Jméno“, v textu a pozdravech „Jméno Příjmení“;
   jedna sdílená funkce (`formatName(u, "list" | "text")`) a použít ji všude (uživatelé, dopisování,
   předměty, úvazky, nezapsaní, karty dashboardu, e-maily).
10. Texty: odpočet zavření okna česky („za 8 dní 23 h“, bez sekund), stavy bez angličtiny
    („Otevřeno (Open)“ → „Otevřeno“), vlastní české tlačítko pro výběr souboru v importu,
    „Změny studenty do konce zápisu“ → srozumitelná věta. Projít ostatní viditelné anglické
    zbytky.
11. Student v zápisu nevidí sloupec „Kód výskytu“ (učitel/admin ano); jméno učitele se nemá lámat
    zbytečně (šířky sloupců).

Testy: upravit dotčené E2E, nové na řazení, filtry dopisování, stav okna (koncept → zveřejněno
→ předčasně uzavřít → znovu otevřít), skrytí informační položky přehledu, kód výskytu bez lomítka.
