# Zadání: předměty, třídy, schvalování studentů, uzavření roku, úvazky, dopisování

Navazuje na verzi 10/2026 (viz `Dokumentace/architektura-moduly.md`). Zpětná kompatibilita
dat se nevyžaduje, ale migrace nesmí na existujících datech spadnout a co jde, přenese
(produkce už může obsahovat první zadaná data).

## A. Jeden „Předmět“ místo „Seminář“ + „Předmět“

Dnes existují dvě tabulky: `Seminar` (modul Semináře; název, kód, popis, sylabus) a `Subject`
(jádro; úvazky, dopisování). Sloučit do jednoho `Subject` v jádru.

- `Subject`: `name`, `code` (jedinečný, **nepovinný**), `description?`, `syllabus?`,
  `grades Int[]` (ročníky, ve kterých se vyučuje, prázdné = všechny; např. matematika 1–4,
  účetnictví 2–4, semináře 4), `isActive`, `createdBy`/`updatedBy`, časy.
- Žádný „typ“ předmětu. **Do zápisu (blok zápisového okna) lze zařadit jakýkoli aktivní
  předmět.** U předmětu se jen zobrazuje odvozený štítek „v zápisu: <název okna>“ podle
  výskytů (`SubjectOccurrence`) v nesmazaných blocích.
- Model `Seminar` zrušit, `SubjectOccurrence.subject` ukazuje na `Subject`. Migrace přenese
  řádky `Seminar` do `Subject` (se zachováním id) a přepojí výskyty.
- Stránka `/subjects` se přejmenuje na **„Předměty“** a přesune do jádra (`modules/core`):
  - nová oprávnění `core.subjects.view` (STUDENT, TEACHER, ADMIN), `core.subjects.edit`
    (TEACHER, ADMIN), `core.subjects.archive` (ADMIN); `seminars.subjects.*` zrušit,
  - položka menu „Předměty“; modul Semináře si v menu nechá jen „Zápisy“,
  - učitel/admin: všechny předměty, filtr ročník / v zápisu / archivované; student: aktivní
    předměty svého ročníku + předměty nabízené v jemu viditelném zápisu,
  - detail: popis, sylabus, ročníky, vyučující (úvazky, viz E), u učitele/admina i zápisy,
    kde je předmět nabízen,
  - formulář předmětu obsahuje i ročníky (zaškrtávátka 1–4).
- Správa předmětů zmizí ze stránky Škola (viz F).
- Dopisování: povolené předměty termínu = všechny aktivní předměty. Vyučující, kterému
  student píše: úvazek pro třídu studenta v aktuálním roce; když není a student je
  zapsaný do výskytu toho předmětu v zápisu, vezme se učitel výskytu.
- Exporty, seed, E2E testy a dokumentace upravit.

## B. Pevné třídy

Dnes je třída kohorta (`entryYear` + písmeno) a ročník se dopočítává. Škola chce **třídy
založit jednou** (1.A … 4.C) a studenty mezi nimi jen přesouvat.

- `ClassGroup`: `grade` (1–4) + `letter`, unikátní dvojice; `entryYear`/`studyYears` pryč.
  Ročník studenta = `classGroup.grade`. Migrace: `grade = startYear aktuálního roku -
  entryYear + 1`; třídy mimo 1–4 smazat (studentům zrušit zařazení) nebo vyřešit rozumně.
  Kolize (dvě kohorty na stejné grade+letter) sloučit.
- `ClassMembership` (historie po letech s uloženým ročníkem) zůstává.
- **Třídy patří k Uživatelům:** na `/users` záložka „Třídy“: seznam tříd s počty studentů,
  rozkliknutí → studenti třídy, přesun studenta do jiné třídy (přes `setStudentClass`,
  důvod MOVED), tlačítko „Založit třídy“ (generátor ročníky × písmena, např. 1–4 × A,B,C),
  smazání prázdné třídy. Seznam uživatelů má sloupec a filtr třídy a hromadnou akci
  „Přesunout do třídy“ (už částečně existuje – sjednotit).
- Cílení zápisových oken na ročníky funguje dál (podle `grade`).

## C. Registrace se třídou a schvalování jedním klikem

- Administrace → nastavení registrace: „Výběr třídy při registraci“: vypnuto / volitelný /
  povinný (SystemSetting, výchozí vypnuto).
- Registrační formulář: výběr třídy („2.A“). Uloží se do nového `User.requestedClassGroupId`.
  Role zůstává výchozí (GUEST), nic dalšího se automaticky nemění.
- Účty založené přes Microsoft 365 (a hosté bez žádosti) při zapnutém nastavení uvidí na
  dashboardu výzvu „Vyberte svou třídu“ (stejné pole). Host může žádost měnit, dokud není
  schválen.
- `/users`, záložka **„Ke schválení“** (s počtem): hosté se žádostí i bez ní; řádek: jméno,
  e-mail, datum registrace, výběr třídy předvyplněný žádostí, tlačítka:
  - **Schválit** (jeden klik): role STUDENT, zařazení do vybrané třídy (`setStudentClass`,
    důvod ASSIGNED), smaže žádost, účet aktivní,
  - menu: „Schválit jako učitele“, „Zamítnout“ (ConfirmAction; deaktivuje účet a smaže
    žádost; trvalé smazání zůstává v běžné správě uživatelů),
  - zaškrtávání + „Schválit vybrané“ (každého do jeho vybrané třídy).
- Dashboard admina: widget „N účtů čeká na schválení“ s odkazem.

## D. Propracovanější uzavření školního roku

Průvodce (`YearClosureWizard`) předělat pro pevné třídy:
- Studenti seskupení po třídách; každý má výběr cíle s výchozí hodnotou
  „postup do (g+1).<stejné písmeno>“ (u 4. ročníku „absolvoval“). Možnosti:
  - postup do libovolné třídy ročníku g+1 (= i změna písmene),
  - opakuje ročník: libovolná třída ročníku g (výchozí stejná),
  - absolvoval (jen poslední ročník) – deaktivace účtu ihned, jako dosud,
  - ukončil studium: důvod (StudyEndReason) + poznámka.
- Hromadně pro celou třídu: „všem: postup do …“, pak jednotlivé výjimky.
- Krok „Souhrn“: počty podle cílových tříd, absolventi, odchody, upozornění (např. prázdný
  cíl). Potvrzení provede vše v jedné transakci, vytvoří nový školní rok, membershipy
  s důvody PROMOTED / REPEATED.
- Úvazky do nového roku, volba: nepřebírat / ponechat u stejných tříd / **jít se třídou**
  (2.A → 3.A; výchozí). Přeskočit úvazky, kde předmět v novém ročníku nemá `grades`, a ty
  ze 4. ročníku. Náhled počtu.
- Hosté a učitelé se nemění.
- Stránka se přesune z `/school/close-year` do `/admin/close-year`.

## E. Úvazky (návrh)

Data beze změny: `TeachingAssignment(teacher, subject, classGroup, schoolYear)`.
Upravují se ze dvou míst nad stejnými daty, vždy pro aktuální školní rok:
- **Detail předmětu → „Vyučující 2026/27“**: mřížka tříd (řádky = ročníky, ve kterých se
  předmět vyučuje, sloupce = písmena). V buňce čipy učitelů (× odebere) a malý výběr
  „+ učitel“. Ukládá se hned. Tlačítko „Stejný učitel pro celý ročník“ u řádku.
- **Uživatelé → u učitele akce „Úvazky“** (dialog): seznam „předmět – třídy“ (čipy tříd,
  × odebere), přidání: výběr předmětu + zaškrtávací mřížka tříd (jen ročníky předmětu).
- Zobrazení pro čtení: v detailu předmětu (všichni), u učitele v seznamu uživatelů počet.

## F. Stránka Škola zrušit

- `/school` a položka menu „Škola“ zmizí.
- Školní rok (zobrazení aktuálního, počáteční nastavení dokud nejsou zařazení studenti)
  a odkaz „Uzavřít školní rok“ → sekce v **Administraci**.
- Třídy → Uživatelé (B), předměty → Předměty (A), úvazky → předmět a učitel (E).

## G. Dopisování – jedna tabulka pro studenta

Místo dvou bloků („Moje zápisy“ + „Vypsané termíny“) jedna tabulka termínů ve stylu zápisu
seminářů:
- Nadcházející nezrušené termíny + termíny, kde je student zapsaný (i zrušené, zvýrazněné).
- Sloupce: termín, učebna, dozor, předměty (zvýraznit předměty jeho ročníku/třídy),
  obsazenost, akce.
- Řádek, kde je zapsaný, je zvýrazněný a ukazuje jeho zvolené předměty (+ vyučujícího)
  a poznámku; akce Upravit / Přepsat / Odhlásit (do uzávěrky; po ní „zapsáno, změny
  uzavřeny“). Ostatní řádky: Zapsat se / plno / po uzávěrce / kolize s jiným zápisem.
- Filtr předmětu + přepínač „jen moje zápisy“. Proběhlé zápisy (s docházkou) jako
  sbalitelný seznam pod tabulkou.

## Obecně

- Dodržet konvence z `Dokumentace/architektura-moduly.md`: `safeAction`/`unwrap`,
  `PageHeader`, `NativeSelect`, `lib/datetime.ts`, oprávnění přes `can`/`requirePermission`,
  `setStudentClass` jako jediný zapisovatel třídy, `force-dynamic` u layoutů modulů.
- Jedna nová migrace (`prisma migrate dev`), žádné úpravy starých migrací.
- Aktualizovat dokumentaci, seed a E2E testy; nové testy: schválení hosta jedním klikem,
  uzavření roku se změnou třídy a opakováním, tabulka dopisování pro studenta, úvazky
  z detailu předmětu.
- Hotovo = `npm run typecheck`, `npm run lint`, `npm run build` a `npm run test:e2e` projdou.
