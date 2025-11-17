# Výběr semináře

Tento dokument popisuje funkční chování systému **Zápis seminářů**.  
Cílem je umožnit studentům přihlásit se na nabízené semináře (předměty) v rámci definovaného zápisu, který spravuje administrátor.

## Motivace

Tento systém vznikl jako jednoduchý, přehledný a interaktivní nástroj pro **organizaci školních seminářů a zápisů studentů**.  
Je navržen tak, aby pokryl všechny klíčové potřeby konkrétná školy kde se planuje systém nasadit, ale zároveň zůstal dostatečně lehký, intuitivní a snadno upravitelný.

### 🎯 hlavní cíle

Cílem systému je vytvořit **jednotné místo**, kde:

- studenti mohou snadno **vybírat semináře** podle svých preferencí  
- učitelé mají přehled o svých skupinách a mohou vidět zapsané studenty  
- administrátoři mohou **spravovat předměty, bloky, zápisová období a uživatele**  
- celý proces zápisu je jasně strukturovaný, přehledný a transparentní

Systém tak eliminuje ruční evidenci, zdlouhavou komunikaci e-mailem nebo tabulkovými procesory a přináší **automatizaci a pořádek**.

## Přihlášení a role

1. Po otevření aplikace se uživatel musí **přihlásit nebo registrovat**.  
   Nepřihlášený uživatel vidí pouze veřejnou úvodní stránku s tlačítky *Přihlásit se* a *Vytvořit účet*.
2. Po registraci má uživatel vždy výchozí roli **GUEST**.
3. **Admin** spravuje seznam uživatelů, jejich aktivaci a přiřazování rolí (`Role` = GUEST, STUDENT, TEACHER, ADMIN).
4. Uživatel může být aktivní nebo zablokovaný (`isActive`).
5. Každá role má definovaný přístup pouze ke své části systému.

### Popis rolí

#### Guest (`GUEST`)

- Výchozí role po registraci.
- Navigace pro GUEST zobrazuje pouze **přehled zápisů**.
- GUEST se nemůže zapisovat ani upravovat data.

#### Student (`STUDENT`)

- Vidí **dashboard** s dostupnými zápisovými obdobími (`EnrollmentWindow`).
- Pokud má zápis stav **OPEN**, může:
  - **zapsat se** na výskyt předmětu (`SubjectOccurrence`),
  - **odhlásit se** ze svého zápisu.
- Omezení implementovaná v UI:
  - v rámci jednoho **bloku** (`Block`) může mít student **nejvýše jeden aktivní zápis**,  
  - pokud je stejný předmět (`Subject`) nabízen ve více blocích, může být zapsán pouze do jednoho z nich.
- Vidí obsazenost výskytů (např. `7/30`).
- Může zobrazit detail předmětu a jeho syllabus.

#### Teacher (`TEACHER`)

- Má přístup k sekci **Předměty**.
- Může vytvářet a upravovat **předměty** (`Subject`).
- Vidí zápisy (`EnrollmentWindow`) a jejich bloky, ale **nemůže se zapisovat**.
- Vidí obsazenost výskytů (např. `7/30`) a může otevřít dialog se seznamem zapsaných studentů.

#### Admin (`ADMIN`)

- Vidí v navigaci všechny sekce aplikace:
  - **Dashboard**
  - **Zápisy**
  - **Předměty**
  - **Uživatelé**
  - **Nastavení** (základní informace)
- Může spravovat role a aktivaci uživatelů.
- Může vytvářet, upravovat **předměty**, **bloky**, **výskyty** i **zápisy**.
- Může **spouštět a ukončovat zápisy** (mění `Status` na OPEN nebo CLOSED).
- Může **zapisovat studenty ručně**, nebo je ze zápisu odstranit.
- Může dělat **exporty dat** ze všech seznamů.
- Má přístup k auditním údajům (`createdById`, `updatedById`, `deletedById`).

---

## Entity a datové typy

### Datové typy

#### Uživatel (`User`)

Reprezentuje uživatele systému (student, učitel, admin nebo guest).

| Název | Typ | Popis |
|-------|-----|-------|
| `id` | `string` | Jedinečný identifikátor uživatele |
| `firstName` | `string` | Křestní jméno |
| `lastName` | `string` | Příjmení |
| `email` | `string` | E-mailová adresa (musí být školní) |
| `passwordHash` | `string \| null` | Hash hesla (může být `null`, pokud používá SSO nebo nebylo nastaveno) |
| `role` | `Role` | Role uživatele |
| `isActive` | `boolean` | Indikuje, zda je účet aktivní |
| `lastLoginAt` | `Date?` | Datum posledního přihlášení |
| `createdAt` | `Date` | Datum vytvoření záznamu |
| `updatedAt` | `Date` | Datum poslední aktualizace |

| Role | Popis |
|----------|--------|
| `GUEST`   | nově registrovaný uživatel čekající na schválení |
| `STUDENT` | student, který se zapisuje na předměty |
| `TEACHER` | vyučující, který spravuje předměty a vidí své studenty |
| `ADMIN`   | správce systému s plnými oprávněními |

#### Zápis (`EnrollmentWindow`)

- Zápis představuje **časové období**, během kterého mohou studenti vybírat předměty.  
- Každý zápis obsahuje:
  - název, popis a stav (`Status`),
  - časové rozmezí (`startsAt` → `endsAt`),
  - viditelnost pro studenty (`visibleToStudents`),
  - seznam bloků (`Block`).

| Název | Typ | Popis |
|-------|-----|-------|
| `id` | `string` | Jedinečný identifikátor zápisu |
| `name` | `string` | Název zápisu (např. „Zápis LS 2025“) |
| `description` | `string?` | Volitelný popis nebo poznámka |
| `status` | `Status` | Stav zápisu (DRAFT, SCHEDULED, OPEN, CLOSED) |
| `startsAt` | `Date` | Datum a čas začátku zápisu |
| `endsAt` | `Date` | Datum a čas ukončení zápisu |
| `visibleToStudents` | `boolean` | Určuje, zda zápis vidí studenti |
| `createdById` | `string` | ID uživatele, který zápis vytvořil |
| `updatedById` | `string?` | ID uživatele, který zápis naposledy upravil |
| `createdAt` | `Date` | Datum vytvoření záznamu |
| `updatedAt` | `Date` | Datum poslední aktualizace |

| Status | Popis |
|----------|--------|
| `DRAFT`      | návrh zápisu, zatím neaktivní |
| `SCHEDULED`  | naplánovaný zápis, čeká na začátek |
| `OPEN`       | zápis je aktivní, studenti se mohou zapisovat |
| `CLOSED`     | zápis je uzavřený, pouze k nahlédnutí |

#### Bloky (`Block`)

- Blok představuje **logickou skupinu výskytů předmětů** v rámci jednoho zápisu.  
  Například: *Blok 1 – povinné*, *Blok 2 – volitelné*.
- Každý blok:
  - patří právě jednomu zápisu (`enrollmentWindowId`),
  - má pořadí (`order`), které určuje jeho pozici ve výpisu,
  - může mít popis (`description`),
  - může být smazán (soft delete).
- Student se musí zapsat **právě na jeden výskyt** (`SubjectOccurrence`) v každém bloku.
- Bloky jsou zobrazovány studentům podle pořadí.

| Název | Typ | Popis |
|-------|-----|-------|
| `id` | `string` | Jedinečný identifikátor bloku |
| `name` | `string` | Název bloku (např. „Blok 1 – povinné“) |
| `order` | `number` | Pořadí bloku ve výpisu |
| `description` | `string?` | Volitelný popis |
| `enrollmentWindowId` | `string` | ID zápisu, do kterého blok patří |
| `createdById` | `string` | ID uživatele, který blok vytvořil |
| `updatedById` | `string?` | ID uživatele, který blok naposledy upravil |
| `createdAt` | `Date` | Datum vytvoření záznamu |
| `updatedAt` | `Date` | Datum poslední aktualizace |
| `deletedAt` | `Date?` | Datum smazání (soft delete) |
| `deletedById` | `string?` | ID uživatele, který blok smazal |

#### Předměty (`Subject`) a výskyty (`SubjectOccurrence`)

##### Předmět (`Subject`)

je obecná definice kurzu — obsahuje název, sylabus a autora.

| Název | Typ | Popis |
|-------|-----|-------|
| `id` | `string` | Jedinečný identifikátor předmětu |
| `name` | `string` | Název předmětu |
| `code` | `string?` | Volitelný kód předmětu (např. INF101) |
| `syllabus` | `string` | Popis obsahu a cílů předmětu |
| `createdById` | `string` | ID uživatele, který předmět vytvořil |
| `updatedById` | `string?` | ID uživatele, který předmět naposledy upravil |
| `createdAt` | `Date` | Datum vytvoření záznamu |
| `updatedAt` | `Date` | Datum poslední aktualizace |

##### Výskyt (`SubjectOccurrence`)

představuje konkrétní instanci předmětu v určitém bloku:

- Každý výskyt má svého učitele (`teacherId`), kapacitu a kód skupiny (např. „A“, „B“, „C“).
- Pokud je `capacity = null`, zápis je **neomezený**.
- V jednom bloku může být více výskytů stejného předmětu s různými učiteli nebo kódy skupin.
- Admin může výskyty vytvářet, upravovat i mazat během otevřeného zápisu.

| Název | Typ | Popis |
|-------|-----|-------|
| `id` | `string` | Jedinečný identifikátor výskytu |
| `subjectId` | `string` | ID původního předmětu |
| `blockId` | `string` | ID bloku, do kterého výskyt patří |
| `teacherId` | `string` | ID učitele, který výskyt vyučuje |
| `subCode` | `string?` | Kód skupiny (např. „A“, „B“, „C“) |
| `capacity` | `number \| null` | Maximální počet studentů (null = neomezená kapacita) |
| `createdById` | `string` | ID uživatele, který výskyt vytvořil |
| `updatedById` | `string?` | ID uživatele, který výskyt upravil |
| `createdAt` | `Date` | Datum vytvoření |
| `updatedAt` | `Date` | Datum poslední aktualizace |
| `deletedAt` | `Date?` | Datum smazání (soft delete) |
| `deletedById` | `string?` | ID uživatele, který výskyt smazal |

#### Zápis studenta (`StudentEnrollment`)

- Student se zapisuje na konkrétní **výskyt předmětu** (`SubjectOccurrence`).
- Každý zápis obsahuje informaci o tom, kdo ho vytvořil (`createdById`) a kdy (`createdAt`).
- Odhlášení (soft delete) je možné pouze, pokud je zápis (`EnrollmentWindow`) ve stavu **OPEN**.
- Po ukončení zápisu (`Status = CLOSED`) může student pouze prohlížet své zapsané předměty.

| Název | Typ | Popis |
|-------|-----|-------|
| `id` | `string` | Jedinečný identifikátor zápisu |
| `studentId` | `string` | ID studenta (User.id) |
| `subjectOccurrenceId` | `string` | ID výskytu předmětu, na který je zapsán |
| `createdById` | `string` | ID uživatele, který zápis vytvořil |
| `updatedById` | `string?` | ID uživatele, který zápis upravil |
| `createdAt` | `Date` | Datum vytvoření |
| `updatedAt` | `Date` | Datum poslední aktualizace |
| `deletedAt` | `Date?` | Datum smazání (pokud se student odhlásil) |
| `deletedById` | `string?` | ID uživatele, který zápis odstranil |

### Aplikační pravidla

1. Student může mít v rámci jednoho **bloku** pouze **jeden aktivní zápis**.
2. Student se **nemůže zapsat na stejný předmět ve více blocích jednoho zápisu**.
3. Odhlášení nebo přepsání je možné pouze ve stavu `OPEN`.

#### Shrnutí vztahů

- `User` 1–N `Subject` (vytvořil)
- `User` 1–N `SubjectOccurrence` (učí)
- `User` 1–N `StudentEnrollment` (studenti se zapisují)
- `EnrollmentWindow` 1–N `Block`
- `Block` 1–N `SubjectOccurrence`
- `Subject` 1–N `SubjectOccurrence`
- `SubjectOccurrence` 1–N `StudentEnrollment`

## Front end

Toto zadání popisuje strukturu a funkčnost front-endové části aplikace postavené na Next.js a shadcn/ui.

---

### 1. Strom stránek (Site Map)

Aplikace používá standardní adresářovou strukturu Next.js App Routeru.

Přihlášený uživatel vidí navigaci dle své role (ADMIN / TEACHER / STUDENT / GUEST).  
Nepřihlášený uživatel vidí pouze veřejnou úvodní stránku a formuláře pro přihlášení/registraci.

```bash
/app
├── (auth)/                  
│   ├── login/
│   │   └── page.tsx         # Přihlašovací formulář
│   └── register/
│       └── page.tsx         # Registrační formulář
│
├── dashboard/
│   └── page.tsx             # Hlavní stránka pro přihlášené (výběr zápisu)
│
├── subjects/                
│   ├── page.tsx             # Seznam všech předmětů
│   └── [id]/                # Dynamická routa pro konkrétní předmět
│       ├── page.tsx         # Detail předmětu
│       └── edit/
│           └── page.tsx     # Editace předmětu
│
├── enrollments/
│   ├── page.tsx             # Přehled všech zápisů
│   └── [id]/
│       └── page.tsx         # Detail zápisu (používá EnrollmentView stejně jako dashboard)
│
├── users/
│   └── page.tsx             # Přehled uživatelů (přístup omezen dle role přes UI)
│
├── settings/
│   └── page.tsx             # Základní informace o uživateli a placeholder pro nastavení
│
├── layout.tsx               # Klientský layout (AuthProvider + AppShell + AppTopbar)
├── globals.css              # Globální styly
└── page.tsx                 # Veřejná úvodní stránka (Landing page)

```

### 2. Navigace (Top Bar Layout)

Aplikace používá horní navigační lištu (**Top Bar**), která se zobrazuje na všech stránkách pro přihlášené uživatele.  
Veřejné stránky (`/`, `/login`, `/register`) navigaci nenačítají.

- **Komponenta:** `AppShell` (client) a `AppTopbar`
- **Soubor:** `components/app-shell.tsx` a `components/app-topbar.tsx`
- **Struktura Top Baru:**
  1. **Vlevo – Logo / Název aplikace**
  2. **Uprostřed – Navigační odkazy (liší se podle role)**
  3. **Vpravo – Uživatelské menu**

#### Navigační odkazy (podle role)

Komponenta Top Baru zobrazí následující odkazy v závislosti na roli uživatele:

- **Role: `ADMIN`**
  - `Dashboard` → `/dashboard`
  - `Zápisy` → `/enrollments`
  - `Předměty` → `/subjects`
  - `Uživatelé` → `/users`
  - `Nastavení` → `/settings`

- **Role: `TEACHER`**
  - `Dashboard` → `/dashboard`
  - `Zápisy` → `/enrollments`
  - `Předměty` → `/subjects`

- **Role: `STUDENT`**
  - `Dashboard` → `/dashboard`

- **Role: `GUEST`**
  - `Dashboard` → `/dashboard`

### 3. Zadání pro programátora (Popis stránek)

#### /dashboard

Tato stránka je hlavní vstupní stránkou po přihlášení.  

- `/dashboard/page.tsx` je **client komponenta**
- získá přihlášeného uživatele pomocí `useAuth()`
- vybere **jeden** vhodný zápis pomocí funkce `findDashboardEnrollment(...)`
- zobrazí obsah pomocí sdílené komponenty `EnrollmentView`
- Dashboard vždy zobrazí **jeden vybraný zápis**, nikoliv selektor zápisů.

##### Chování podle role

Implementace je zjednodušená — dashboard používá **stejný Layout a stejnou komponentu pro všechny role** (ADMIN, TEACHER, STUDENT, GUEST).

Rozdíly jsou pouze v tom, co jednotlivé role mohou **vidět** nebo **klikat**, ne v samotném layoutu.

Pro všechny  role dashboard funguje stejně:

1. Funkce `findDashboardEnrollment` vybere nejvhodnější zápis podle stavu (OPEN → SCHEDULED → DRAFT → CLOSED).

2. Pokud zápis existuje, zobrazí se.
3. Pokud zápis neexistuje, zobrazí se jednoduchá hláška: "Momentálně zde není žádné aktivní ani naplánované zápisové období."

---

###### Globální informace o zápisu (EnrollmentHeader)

Komponenta `EnrollmentHeader` zobrazuje:

- Název zápisu
- Datum začátku a konce
- Stav zápisu (`DRAFT`, `SCHEDULED`, `OPEN`, `CLOSED`)
- Tlačítko „Upravit zápis“ pro ADMIN/TEACHER  
  (otevírá dialog `EditEnrollmentDialog`)

###### Přehled bloků (EnrollmentBlocks)

Pod hlavičkou se zobrazuje mřížka bloků pomocí `EnrollmentBlocks` v layoutu podle velikosti displeje. Každý blok je potom reprezentován komponentou `EnrollmentBlockCard`.

EnrollmentBlockCard obsahuje:

- název bloku
- vizuální zvýraznění vybraného výskytu (pro STUDENT)
- tabulku výskytů předmětů (SubjectOccurrence)
- akce podle role uživatele

###### Chování STUDENT

Student může:

- vidět obsazenost výskytů (např. `5/30` nebo `2/∞`),
- zapsat se nebo odhlásit, pokud:
  - zápis má stav **OPEN**,
  - není již zapsán v jiném výskytu téhož bloku,
  - není zapsán na stejný předmět v jiném bloku.

###### Chování TEACHER a ADMIN

- Vidí všechny výskyty předmětů v daném bloku.
- Vidí jméno učitele a aktuální obsazenost.
- Kliknutím na obsazenost se otevře `OccurrencesStudentsDialog`.
- Tlačítka pro zápis jsou **neaktivní** (`disabled`).

ADMIN navíc může otevřít dialog pro úpravu výskytu.

###### Tabulka výskytů — sloupce

| Sloupec      | Popis                                                        |
|--------------|--------------------------------------------------------------|
| **Předmět**  | Název předmětu (klik vede na `/subjects/[id]`)               |
| **Učitel**   | Jméno vyučujícího                                            |
| **Obsazenost** | Např. `7/30` (pro TEACHER/ADMIN interaktivní)               |
| **Akce**     | STUDENT: Zapsat/Odhlásit, ostatní role: disabled tlačítka    |

Tabulka je založena na komponentě `DataTable` s vlastním setem sloupců.

#### /subjects/[id] — Detail a editace předmětu

Stránka předmětu má dva režimy:

1. **Zobrazení detailu** — dostupné pro všechny přihlášené role  
2. **Editace** — dostupná pro role **TEACHER** a **ADMIN**

Následující popis odpovídá skutečné implementaci.

---

##### `/subjects/[id]/page.tsx` — Režim zobrazení

Stránka zobrazuje kompletní informace o vybraném předmětu (`Subject`) ve více sekcích.

Zobrazované údaje:

- Název předmětu
- Kód předmětu
- Krátký popis (`description`)
- Syllabus (`syllabus`)
- Výskyty předmětu (`SubjectOccurrence`)

Pod základními informacemi je tabulka všech výskytů daného předmětu napříč zápisy a bloky.

Tabulka zobrazuje sloupce:

- **Zápis** (název `EnrollmentWindow`)
- **Blok** (název `Block`)
- **Skupina** (subCode)
- **Vyučující**
- **Kapacita**
- **Obsazenost**

Tabulka je postavená pomocí komponenty `DataTable`.

---

Role TEACHER/ADMIN mají v pravé horní části tlačítko **„Upravit“**, které vede na `/subjects/[id]/edit`.

##### `/subjects/[id]/edit/page.tsx` — Režim editace

Stránka umožňuje upravit základní informace o předmětu.  
Je dostupná pro role **TEACHER** a **ADMIN**.

Editační formulář obsahuje:

- `Input` — název předmětu (`name`)
- `Input` — kód předmětu (`code`)
- `Textarea` — krátký popis (`description`)
- **Rich Text Editor (Tiptap)** — detailní popis (`syllabus`)
  - podpora formátování (nadpisy, tučné, kurzíva, seznamy)

###### Akce tlačítek

Stránka obsahuje následující akce:

- **Uložit**  
  - Aktualizuje hodnoty předmětu v paměti
  - Zobrazí toast o úspěšném uložení
  - Přesměruje zpět na detail (`/subjects/[id]`)

- **Zrušit**  
  - Přesměruje zpět bez uložení

- **Smazat předmět**  
  - V aktuální verzi není implementováno (tlačítko se nezobrazuje)
  
---

#### ⚙️ /enrollments

Stránka **/enrollments** slouží k přehledu zápisových období (`EnrollmentWindow`).  
Je určena pro role **ADMIN** a **TEACHER**, které ji mají dostupnou v navigaci.

---

##### Funkce stránky

Stránka zobrazuje tabulku zápisů s informacemi o:

- názvu a stavu zápisu,
- viditelnosti pro studenty,
- termínu začátku a konce,
- počtu bloků a počtu předmětů v blocích,
- počtu zapsaných studentů,
- počtu studentů, kteří mají zápis kompletně vyplněný (mají zapsaný předmět ve všech blocích).

Používá se komponenta `DataTable` s vyhledáváním, filtrováním a tříděním na straně klienta.

---

##### Ovládací prvky

V horní části stránky jsou:

- **Nadpis a popis:**
  - `Zápisová období`
  - krátký popis („Přehled všech zápisů, bloků a počtu unikátních studentů.“)

- **Tlačítko „Vytvořit nový zápis“**  
  - zobrazuje se pouze pro roli **ADMIN**  
  - otevře dialog pro zadání názvu, popisu, stavu, časového rozmezí a viditelnosti zápisu

Pod hlavičkou je komponenta `DataTable` s těmito funkcemi:

- **Vyhledávání:**
  - `searchPlaceholder="Hledat podle názvu."`
  - fulltext vyhledává v názvu zápisu

- **Filtry:**
  - **Select „Stav“**  
    - hodnoty: Koncept (`DRAFT`), Naplánováno (`SCHEDULED`), Otevřeno (`OPEN`), Uzavřeno (`CLOSED`)
  - **Select „Viditelnost“**  
    - „Viditelné studentům“ (`visibleToStudents = true`)  
    - „Skryté studentům“ (`visibleToStudents = false`)
  - **Datumové filtry:**
    - `Začátek` – filtr podle `startsAt`
    - `Konec` – filtr podle `endsAt`

---

##### Sloupce tabulky

Tabulka obsahuje následující sloupce:

| Sloupec | Popis |
|---------|-------|
| **Název** | Název zápisu. Kliknutím na název se otevře stránka `/enrollments/[id]`. Pod názvem může být zobrazen krátký popis. |
| **Stav** | Zobrazen jako barevný `Badge` (Koncept, Naplánováno, Otevřeno, Uzavřeno). |
| **Viditelné pro studenty** | Hodnota „Ano/Ne“ zobrazená jako `Badge`. |
| **Začátek** | Datum a čas začátku zápisu (`startsAt`). |
| **Konec** | Datum a čas konce zápisu (`endsAt`). |
| **Bloky (předměty)** | Seznam bloků s počtem výskytů v každém bloku (např. „Blok 1 [3]“). |
| **Zapsaní studenti** | Počet unikátních studentů zapsaných v rámci zápisu. |
| **Kompletně zapsaní** | Počet studentů, kteří mají zapsán předmět ve všech blocích daného zápisu. |
| **Akce** | Kontextové tlačítko pro úpravu (podle role). |

---

##### Práva a akce podle role

###### Role ADMIN

- Vidí všechna zápisová období v tabulce.
- V hlavičce má k dispozici tlačítko **„Vytvořit nový zápis“**, které:
  - otevře dialog pro vytvoření zápisu,
  - umožní nastavit název, popis, stav, časové rozmezí a viditelnost.

- Ve sloupci **Akce** má k dispozici tlačítko:

  - **„Upravit zápis“**  
    - otevře dialog pro úpravu vybraného zápisu  
    - po uložení se dialog zavře a stránka se obnoví

###### Role TEACHER

- Vidí stejnou tabulku zápisů jako ADMIN (včetně filtrů a statistik).
- **Nevidí** tlačítko „Vytvořit nový zápis“.
- Ve sloupci **Akce** se tlačítko „Upravit zápis“ nezobrazuje.

#### 🛠️ /enrollments/[id]

Stránka **/enrollments/[id]** zobrazuje detail jednoho zápisového období (`EnrollmentWindow`). Stránka znovu využívá **stejné komponenty jako dashboard**.

Je dostupná pro role, které mají odkaz v navigaci ( **ADMIN** a **TEACHER**).

#### 👥 /users

Stránka **/users** slouží k přehledu a správě uživatelů.  

##### Obsah stránky

Stránka `/users` obsahuje:

- nadpis a stručný popis,
- komponentu `DataTable` se seznamem uživatelů,
- nástroje pro vyhledávání, filtrování a hromadné akce,
- akční menu pro úpravu jednoho konkrétního uživatele.

##### Načítání dat

- Načítají se **všichni uživatelé** z aktuálního datasetu.
- Vyhledávání, filtrování, třídění a výběr probíhá **na klientu** (bez serverových volání).

##### Ovládací prvky

Nad tabulkou jsou dostupné tyto prvky:

- **Fulltext vyhledávání** v `firstName`, `lastName`, `email`.
- **Filtry** podle role, stavu, datumu vytvoření nebo datumu posledního přihlášení

##### Sloupce tabulky

Tabulka obsahuje následující sloupce:

| Sloupec | Popis |
|---------|--------|
| **Jméno** | Kombinace jména a příjmení |
| **E-mail** | E-mail uživatele |
| **Role** | Barevný Badge s hodnotou role |
| **Stav** | Badge „Aktivní“ / „Neaktivní“ |
| **Vytvořen** | Datum vytvoření uživatele |
| **Poslední přihlášení** | Datum posledního přihlášení |

##### Hromadné akce

Tabulka nabízí vedle filtrů i možnost hromadných změn, kdy se akce provedou nad všemi aktuálně vyfitrovanými záznamy.

- **Změna role** — dropdown pro výběr nové role
- **Aktivovat vybrané**
- **Deaktivovat vybrané**

##### Akce v řádku

V každém řádku je kontextové menu (`DropdownMenu`) pro změnu role a přepínač pro aktivování/deaktivovaní uživatelů:

Detaily uživatele se nezobrazují na vlastní stránce — vše je řešeno přímo v tabulce pomocí inline akcí a hromadného panelu.

#### ⚙️ /settings

Stránka je dostupná **pouze pro ADMINA**. Na začátku `page.tsx` je nutné ověřit roli, jinak `redirect`. AKtuálně jsou všechny nastavení napevno v kódu, ale při nasazení by byly jednotlivé zadávací pole pro texty níže.

**Komponenty:**

- **`<Tabs>`:** Hlavní navigace stránky.
  - **Tab 1: "Obecné"**
    - **Karta "Role":**
      - `CardHeader`: "Výchozí role uživatelů"
      - `CardContent`: Obsahuje `Select` s popiskem "Role pro nově schválené uživatele".
      - Možnosti: `STUDENT`, `TEACHER`. (Určuje, jakou roli získá `GUEST` poté, co ho admin "schválí" na stránce `/users`).
      - `CardFooter`: `Button` ("Uložit").
    - **Karta "Registrace":**
      - `CardHeader`: "Omezení registrace"
      - `CardContent`: `Input` s popiskem "Povolené e-mailové domény (oddělte čárkou)".
      - `CardDescription`: "Např: `@skola.cz`. Pokud je prázdné, registrace je povolena pro jakýkoliv e-mail."
      - `CardFooter`: `Button` ("Uložit").
  - **Tab 2: "Texty"**
    - **Karta "Text pro GUEST":**
      - `CardHeader`: "Text na Dashboardu (Role GUEST)"
      - `CardContent`: Obsahuje `Textarea` pro úpravu textu, který vidí uživatel s rolí `GUEST`.
      - `CardFooter`: `Button` ("Uložit").
    - **Karta "Text pro 'Žádný zápis'":**
      - `CardHeader`: "Text na Dashboardu (Žádný zápis)"
      - `CardContent`: Obsahuje `Textarea` pro úpravu textu, který vidí přihlášený uživatel, pokud není aktivní žádný `EnrollmentWindow`.
      - `CardFooter`: `Button` ("Uložit").
  - **Tab 3: "Pokročilé" (Prázdná pro budoucí použití)**
