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
- [ ] F1 Body rozšíření a hranice modulů
- [ ] F2 Administrace se sekcemi a přehled „co udělat“, jednotné nastavení
- [ ] F3 Detail uživatele a hromadné akce
- [ ] F4 Předměty napříč moduly
- [ ] F5 Konfigurovatelné zápisy (publikum, pravidla bloků)
- [ ] F6 Importy s náhledem (uživatelé, úvazky)

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
