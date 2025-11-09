# Výběr semináře

Tento dokument popisuje funkční chování systému **Zápis seminářů**.  
Cílem je umožnit studentům přihlásit se na nabízené semináře (předměty) v rámci definovaného zápisu, který spravuje administrátor.

---

## Přihlášení a role

1. Po otevření aplikace se uživatel musí **přihlásit nebo registrovat**.  
   Bez přihlášení nemá přístup k žádným datům systému.  
   Na stránce registrace je upozornění, že registrace je možná pouze se **školním e-mailem**.
2. Po registraci má uživatel vždy výchozí roli **GUEST**.
3. **Admin** spravuje seznam uživatelů, jejich aktivaci a přiřazování rolí (`Role` = GUEST, STUDENT, TEACHER, ADMIN).
4. Uživatel může být aktivní nebo zablokovaný (`isActive`).
5. Každá role má definovaný přístup pouze ke své části systému.

### Popis rolí

#### Guest (`GUEST`)

- Výchozí role po registraci.
- Nevidí žádná data.
- Zobrazuje se mu pouze informace, že čeká na schválení správcem.

#### Student (`STUDENT`)

- Vidí přehled dostupných zápisů (`EnrollmentWindow`), které mají `visibleToStudents = true` a `status` ≠ `DRAFT`.
- Pokud je zápis ve stavu **OPEN**, může se **zapisovat a odhlašovat** z výskytů předmětů (`SubjectOccurrence`).
- V každém **bloku** (`Block`) může mít **nejvýše jeden aktivní zápis** (`StudentEnrollment` bez `deletedAt`).
- Pokud je předmět (`Subject`) dostupný ve více blocích, může být zapsán pouze do jednoho z nich.
- Může zobrazit detail předmětu s popisem (`syllabus`).
- Vidí obsazenost výskytů (např. „7/30“).

#### Teacher (`TEACHER`)

- Může vytvářet a upravovat **předměty** (`Subject`).
- Vidí existující **zápisy** (`EnrollmentWindow`) a jejich bloky, ale **nemůže se přihlašovat**.
- Vidí seznam studentů zapsaných na výskyty, kde je uveden jako vyučující (`teacherId` = jeho `User.id`).

#### Admin (`ADMIN`)

- Má přístup ke všem částem systému.
- Může spravovat role a aktivaci uživatelů.
- Může vytvářet, upravovat a mazat **předměty**, **bloky**, **výskyty** i **zápisy**.
- Může **spouštět a ukončovat zápisy** (mění `Status` na OPEN nebo CLOSED).
- Může **zapisovat studenty ručně**, i pokud je kapacita plná, nebo je ze zápisu odstranit.
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
- Student vidí zápis pouze tehdy, pokud:
  - má roli **STUDENT**,
  - `visibleToStudents = true`,
  - a `status` není `DRAFT`.

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

Toto zadání popisuje strukturu a funkčnost front-endové části aplikace postavené na Next.js (App Router) a shadcn/ui.

---

### 1. Strom stránek (Site Map)

Aplikace bude využívat chráněnou "Route Group" `(app)` pro všechny přihlášené uživatele. Hlavní layout `(app)/layout.tsx` načte roli uživatele a podle ní zobrazí správnou navigaci (topbar).

```bash
/app
├── (auth)/                  # Skupina pro přihlášení/registraci
│   ├── login/
│   │   └── page.tsx         # Přihlašovací formulář
│   └── register/
│       └── page.tsx         # Registrační formulář
│
├── (app)/                   # CHRÁNĚNÁ skupina pro všechny přihlášené
│   │
│   ├── layout.tsx           # Hlavní layout (načte roli, zobrazí správný sidebar)
│   │
│   ├── dashboard/           # HLAVNÍ STRÁNKA
│   │   └── page.tsx
│   │
│   ├── subjects/            # Stránka "Předměty"
│   │   ├── page.tsx         # Seznam všech předmětů
│   │   └── [id]/            # Dynamická routa pro konkrétní předmět
│   │       ├── page.tsx     # Detail předmětu
│   │       └── edit/        # Editace
│   │           └── page.tsx 
│   │
│   ├── enrollments/         # Stránka "Zápisy"
│   │   ├── page.tsx         # Seznam všech zápisů
│   │   └── [id]/            # Dynamická routa pro konkrétní zápis
│   │       └── page.tsx     # Detail a editace Zápisu
│   │
│   ├── users/               # Stránka "Uživatelé" (jen Admin)
│   │   └── page.tsx
│   │
│   └── settings/            # NOVÁ STRÁNKA: Nastavení (jen Admin)
│       └── page.tsx
│
└── page.tsx                 # Kořenová stránka (přesměruje na /login)

```

### 2. Navigace (Top Bar Layout)

Tato sekce popisuje hlavní layout a navigaci v `(app)/layout.tsx`. Místo postranního panelu (sidebar) bude použita horní lišta (Top Bar).

- **Komponenta:** `(app)/layout.tsx`
- **Funkce:** Na serveru zjistí roli přihlášeného uživatele.
- **Struktura Top Baru:**
  - Vlevo: Logo/Název aplikace.
  - Uprostřed: Dynamická navigační tlačítka (podle role).
  - Vpravo: Dropdown menu pro uživatele (zobrazení e-mailu, odkaz na `/settings` (pro admina), a tlačítko "Odhlásit").

#### Navigační odkazy (podle role)

Komponenta Top Baru zobrazí následující odkazy v závislosti na roli uživatele:

- **Role: ADMIN**
  - `Dashboard` (vede na `/dashboard`)
  - `Zápisy` (vede na `/enrollments`)
  - `Předměty` (vede na `/subjects`)
  - `Uživatelé` (vede na `/users`)
  - `Nastavení` (vede na `/settings`)

- **Role: TEACHER**
  - `Dashboard` (vede na `/dashboard`)
  - `Zápisy` (vede na `/enrollments`)
  - `Předměty` (vede na `/subjects`)

- **Role: STUDENT**
  - `Dashboard` (vede na `/dashboard`)

- **Role: GUEST**
  - Nejsou zobrazena žádná navigační tlačítka. Top Bar zobrazí pouze logo a "Odhlásit".

### 3. Zadání pro programátora (Popis stránek)

#### 🏠 /dashboard

Toto je hlavní stránka po přihlášení pro všechny role. Komponenta (`page.tsx`) na serveru zjistí roli uživatele a zobrazí jeden z následujících pohledů:

##### Varianta A: Role GUEST

- **Obsah:** Zobrazí se pouze komponenta `Card` uprostřed stránky.
- **Text:** Obsah této karty je spravovatelný administrátorem (např. na stránce `/admin/settings`). Výchozí text: "Váš účet čeká na schválení administrátorem. Nemáte přístup do systému."

##### Varianta B: Role STUDENT, TEACHER, ADMIN

Na serveru se načtou všechny `EnrollmentWindow`, které jsou pro studenty viditelné (`visibleToStudents = true` a `status` není `DRAFT`).

- **Případ 1: Není nalezen žádný viditelný zápis.**
  - Zobrazí se `Card` uprostřed stránky. Její text je spravovatelný adminem. Výchozí text: "Aktuálně není otevřený ani naplánovaný žádný zápis."

- **Případ 2: Je nalezen 1 a více viditelných zápisů.**
  - **Přepínač zápisů:** Pokud je nalezeno více zápisů, zobrazí se nahoře `Select` ("Zobrazit zápis: [možnosti]"), aby si uživatel mohl vybrat, který zápis prohlíží.
  - Následující sekce se vztahují k **vybranému** zápisu.

###### 1. Globální informace o zápisu

Nad přehledem bloků se zobrazí sekce s globálními informacemi o tomto zápisu:

- **Tlačítko pro Admina:**
  - **Pohled (ADMIN):** Zobrazí se `Button` ("Spravovat zápis"), který přesměruje na `/enrollments/[id]`.
  - **Pohled (Ostatní):** Tlačítko se nezobrazí.
- **Karta Odpočtu:**
  - Zobrazí se `Card`, která ukazuje stav zápisu (`status`).
  - Pokud je `status = SCHEDULED`, zobrazí odpočet "Otevírá za: [ČAS]".
  - Pokud je `status = OPEN`, zobrazí odpočet "Zavírá za: [ČAS]".
  - Toto musí být klientská komponenta (kvůli aktualizaci času).
- **Karta Popisu (Pokyny):**
  - Pokud má `EnrollmentWindow.description` (popis) nějaký obsah, zobrazí se `Card` s tímto popisem.
  - `CardHeader`: "Pokyny a informace k zápisu".
  - `CardContent`: Obsah `EnrollmentWindow.description`.

###### 2. Přehled bloků

Pod globálními informacemi se zobrazí samotný obsah zápisu.

- **Layout:** Mřížka (`grid grid-cols-1 lg:grid-cols-3 gap-4`) zobrazující komponenty `Card` vedle sebe. Každá karta reprezentuje jeden **Blok** (`Block`) ze zápisu.
- **Komponenta `Card` (Blok):**
  - `CardHeader`: Obsahuje `CardTitle` (název bloku, např. "Blok 1 – povinné").
  - **Zpětná vazba (STUDENT):** Pokud je student zapsán na předmět v tomto bloku, `Card` má vizuální zvýraznění (např. zelený okraj).
  - `CardContent`: Obsahuje komponentu `Table` (jednoduchou, ne `DataTable`) se seznamem výskytů předmětů (`SubjectOccurrence`).
- **Tabulka v kartě bloku:**
  - **Zpětná vazba (STUDENT):** Řádek `TableRow`, kde je student zapsán, je vizuálně zvýrazněn.
  - **Sloupec "Předmět":** Název předmětu.
    - **Akce:** Kliknutím na název se uživatel přesměruje na `/subjects/[id]`.
  - **Sloupec "Vyučující":** Jméno učitele.
  - **Sloupec "Obsazenost":** Zobrazuje text (např. "7/30" nebo "5/∞").
    - **Akce (TEACHER, ADMIN):** Po kliknutí se otevře `Dialog` (`shadcn/ui`) se seznamem zapsaných studentů (celý prvek `Badge` je interaktivní).
    - **Akce (STUDENT):** Pouze text, neinteraktivní `Badge`.
  - **Sloupec "Akce":**
    - **Pohled (STUDENT):**
      - Pokud je zapsán: Zobrazí `Button` ("Odhlásit", varianta `destructive`).
      - Pokud není zapsán: Zobrazí `Button` ("Zapsat").
      - Tlačítka jsou aktivní pouze pokud je `EnrollmentWindow.status = OPEN` a student splňuje pravidla.
    - **Pohled (TEACHER, ADMIN):** Zobrazí se `Button` (např. "Zapsat"), ale je **neaktivní** (`disabled`).

#### 📚 /subjects

Stránka je dostupná pro role **TEACHER** a **ADMIN**.

- **Komponenty:** Hlavní komponentou je `DataTable` (`shadcn/ui`) zobrazující seznam předmětů (`Subject`) s integrovanou **server-side paginací** (stránkováním).
- **Načtení dat:**
  - Načítá se vždy jen jedna stránka dat (např. 20 předmětů) dle aktuální stránky, nastaveného řazení a filtru.
- **Ovládací prvky nad tabulkou:**
  - `Input` pro **globální filtrování** (hledá v `name` a `code`).
  - `Dropdown Menu` ("Zobrazit sloupce") s `Checkboxy` pro zapnutí/vypnutí viditelnosti sloupců (např. "Kód", "Poslední úprava").
  - `Button` ("Nový předmět").
- **Funkce tabulky:**
  - Zobrazuje sloupce: `Název`, `Kód`, `Poslední úprava` (kdo), `Poslední úprava` (kdy).
  - **Řazení:** Všechny viditelné sloupce jsou interaktivní a umožňují server-side řazení (vzestupně/sestupně).
- **Akce "Nový předmět":**
  - Tlačítko `Button` ("Nový předmět") nad tabulkou. Po kliknutí se (pomocí Server Action) vytvoří nový prázdný předmět a uživatel je přesměrován na `/subjects/[id]/edit` pro jeho úpravu.
- **Akce (Řádek tabulky):**
  - Kliknutím na **název předmětu** se uživatel přesměruje na `/subjects/[id]` (stránka zobrazení).
  - Na konci každého řádku je `Dropdown Menu` (`...`) s akcemi:
    - "Upravit" (přesměruje rovnou na `/subjects/[id]/edit`)
    - "Smazat" (otevře `AlertDialog` pro potvrzení; tlačítko je `disabled`, pokud je předmět použit ve `SubjectOccurrence`)

#### 📖 /subjects/[id] (a editace)

Stránka má dva režimy: **zobrazení** (pro všechny) a **editace** (pro učitele/admina). Oprávnění k úpravám mají role **TEACHER** a **ADMIN** pro **všechny** předměty v systému.

##### `/subjects/[id]/page.tsx` (Režim zobrazení)

- **Obsah:** Zobrazí detail předmětu (`Subject`) rozdělený do několika sekcí (`Card`).
- **Karta 1: Detail předmětu:**
  - Zobrazí název, kód a `syllabus`.
  - **Důležité:** Obsah `syllabus` se zde musí vykreslit jako formátovaný HTML obsah (nikoliv jako čistý text), aby se zobrazilo formátování zadané v Rich Text Editoru.
- **Karta 2: Výskyty předmětu:**
  - Zobrazí `DataTable` se seznamem všech `SubjectOccurrence`, kde je tento předmět použit.
  - Sloupce tabulky: "Zápis", "Blok", "Vyučující", "Kapacita".
- **Metadata (Audit):**
  - Na stránce je viditelný text "Vytvořil: [Jméno] dne [Datum]" a "Poslední úprava: [Jméno] dne [Datum]".
- **Akce (TEACHER, ADMIN):**
  - V rohu stránky je `Button` ("Upravit"), který přesměruje na `/subjects/[id]/edit`.
- **Akce (STUDENT, GUEST):**
  - Tlačítko "Upravit" se nezobrazí.

##### `/subjects/[id]/edit/page.tsx` (Režim editace)

- **Obsah:** Formulář pro editaci předmětu. Přístupné pouze pro **TEACHER** a **ADMIN**.
- **Komponenty:** `Form` (`react-hook-form` + `shadcn/ui`) s poli:
  - `Input` (pro `name`).
  - `Input` (pro `code`).
  - **Rich Text Editor (RTE):** Pro pole `syllabus`. Musí umožňovat základní formátování (Tiptap).
- **Akce (Tlačítka):**
  - `Button` ("Uložit"): Použije Server Action k aktualizaci databáze.
  - `Button` ("Zrušit", varianta `outline`): Přesměruje zpět na `/subjects/[id]` beze změn.
  - `Button` ("Smazat předmět", varianta `destructive`):
    - Zobrazí potvrzovací `AlertDialog`.
    - Tlačítko je **neaktivní (`disabled`)**, pokud je předmět použit v jakémkoliv `SubjectOccurrence`. Tooltip u tlačítka vysvětlí proč.
- **Metadata (Audit):**
  - Na stránce je viditelný text "Vytvořil:..." a "Poslední úprava:...".

#### ⚙️ /enrollments

Stránka je dostupná pro role **TEACHER** a **ADMIN**. Na začátku `page.tsx` je nutné ověřit, zda má uživatel jednu z těchto rolí, jinak `redirect`.

- **Práva (ADMIN):** Plný přístup. Může vytvářet, upravovat a mazat zápisy. Všechny interaktivní prvky jsou aktivní.
- **Práva (TEACHER):** Pouze ke čtení. Všechny manipulační prvky (`Button`, `Select`, `Switch`) jsou neaktivní (`disabled`) nebo skryté.

- **Komponenty:** `DataTable` (`shadcn/ui`) se seznamem všech zápisů (`EnrollmentWindow`).
- **Ovládací prvky nad tabulkou:**
  - **Pohled (ADMIN):**
    - `Button` ("Nový zápis").
  - **Pohled (ADMIN + TEACHER):**
    - `Input` pro filtrování podle názvu.
    - `Select` (nebo `DropdownMenu` s checkboxy) pro filtrování podle `Stavu` (Draft, Open, Closed atd.).
- **Funkce tabulky:**
  - Zobrazuje sloupce: `Název`, `Stav`, `Viditelný pro studenty`, `Začátek` (`startsAt`), `Konec` (`endsAt`), `Počet bloků`, `Počet zapsaných` (celkový počet unikátních studentů v zápisu).
  - **Inline editace (pouze ADMIN):**
    - Sloupec `Stav` je implementován jako `Select` (`shadcn/ui`). Při změně okamžitě uloží nový stav (pomocí Server Action).
    - Sloupec `Viditelný pro studenty` je implementován jako `Switch` (`shadcn/ui`). Při změně okamžitě uloží stav.
  - **Pohled (TEACHER):**
    - Učitel vidí `Stav` jako `Badge` a `Viditelný` jako `Checkbox` (pouze k čtení), nebo jsou komponenty `Select` a `Switch` zobrazené, ale `disabled`.
- **Akce "Nový zápis" (Admin):**
  - Po kliknutí na `Button` ("Nový zápis") se (pomocí Server Action) vytvoří nový prázdný `EnrollmentWindow` s výchozími hodnotami.
  - Uživatel je okamžitě přesměrován na `/enrollments/[nové_id]`, kde zápis rovnou edituje.
- **Akce (Řádek tabulky):**
  - Na konci každého řádku je `Dropdown Menu` (`...`) s akcemi:
  - **Pohled (ADMIN):**
    - "Upravit" (přesměruje na `/enrollments/[id]`)
    - "Duplikovat" (Vytvoří kopii zápisu i s jeho bloky, ale bez studentů; s potvrzením)
    - "Smazat" (Soft delete, s potvrzovacím `AlertDialog`)
  - **Pohled (TEACHER):**
    - "Zobrazit" (přesměruje na `/enrollments/[id]`)

#### 🛠️ /enrollments/[id]

Stránka je dostupná pro role **TEACHER** a **ADMIN** a zobrazuje **dva zcela odlišné pohledy** v závislosti na roli.

##### Pohled (ADMIN)

Admin vidí plně interaktivní "velín" pro správu konkrétního zápisu.

- **Obsah:** Stránka je rozdělena na dvě části.
- **Část 1: Formulář nastavení zápisu**
  - Nahoře je formulář (`Form`) pro editaci parametrů `EnrollmentWindow`.
  - **Komponenty:**
    - `Input` (pro `name`).
    - `Textarea` (pro `description`).
    - `Date and Time Picker` (`shadcn/ui` kombinace `Calendar` a inputů) pro `startsAt` a `endsAt`.
    - `Switch` (pro `visibleToStudents`).
  - **Akce:** Tlačítko `Button` ("Uložit nastavení zápisu").
- **Část 2: Správce bloků (Aktivní Dashboard)**
  - **Layout:** Mřížka (`grid grid-cols-1 lg:grid-cols-3 gap-4`).
  - **Akce (Layout):** `Button` ("Nový blok") nad mřížkou, který okamžitě (přes Server Action) přidá novou `Card` (blok) do mřížky.
- **Komponenta `Card` (Blok):**
  - **`CardHeader`:** Obsahuje `CardTitle` (název bloku) a `Dropdown Menu` (`...`) s akcemi:
    - **"Upravit"**: Otevře `Dialog` pro přejmenování bloku.
    - **"Posunout nahoru" / "Posunout dolů"**: Akce (Server Action) pro jednoduchou změnu `Block.order` a prohození bloků.
    - **"Smazat"**: Zobrazí `AlertDialog`. Tlačítko je `disabled`, pokud blok obsahuje `SubjectOccurrence`.
  - **`CardContent`:**
    - `Button` ("Přidat výskyt předmětu") nad tabulkou.
    - Jednoduchá `Table` se seznamem výskytů (`SubjectOccurrence`) v tomto bloku.
- **Dialog "Přidat/Upravit výskyt" (Plnohodnotný):**
  - Otevře `Dialog` s formulářem, který obsahuje: `Select` (pro `Subject`), `Select` (pro `Teacher`), `Input` (pro `subCode` - např. "A", "B"), `Input type="number"` (pro `capacity`).
- **Tabulka výskytů v bloku:**
  - **Sloupce:** "Předmět", "Vyučující", "Kód" (zobrazí např. `[code]/[subcode]`), "Obsazenost", "Akce".
  - **Sloupec "Akce" (ADMIN):**
    - `Dropdown Menu` (`...`) s akcemi "Upravit" (otevře dialog) a "Smazat" (zobrazí `AlertDialog`, je `disabled` pokud jsou na výskytu zapsaní studenti).

##### Pohled (TEACHER)

Učitel vidí zjednodušenou "read-only" verzi, která **znovu používá komponenty z dashboardu**.

- **Obsah:** Stránka je rozdělena na dvě části.
- **Část 1: Informace o zápisu**
  - Zobrazí se `Card` s detaily `EnrollmentWindow` (název, popis, data). Vše je pouze text, žádný formulář.
- **Část 2: Přehled bloků (Dashboard Pohled)**
  - Místo interaktivního správce bloků se zde **zobrazí ta samá komponenta (nebo sada komponent) jako na `/dashboard`**.
  - Tím je zajištěno, že učitel vidí bloky a výskyty přesně tak, jak je zvyklý, včetně své jediné povolené interakce: **kliknutí na "Obsazenost"** pro zobrazení seznamu studentů.

#### 👥 /users

Stránka je dostupná **pouze pro ADMINA**. Na začátku `page.tsx` je nutné ověřit roli, jinak `redirect`.

- **Navigace (Tabs):**
  - Stránka je rozdělena pomocí `Tabs` (`shadcn/ui`) na:
    - **Tab 1: "Všichni uživatelé"** (zobrazí všechny, kromě GUESTů)
    - **Tab 2: "Čekající na schválení (GUEST)"** (zobrazí *pouze* uživatele s rolí `GUEST`)
- **Komponenty:**
  - V každém tabu je `DataTable` se seznamem uživatelů, s plnou **server-side paginací** a **řazením**.
- **Ovládací prvky nad tabulkou:**
  - `Input` pro filtrování (podle jména, e-mailu).
  - `Select` pro filtrování podle role (relevantní hlavně v tabu "Všichni uživatelé").
- **Funkce tabulky:**
  - Zobrazuje sloupce: `Jméno`, `E-mail`, `Role`, `Stav`, `Poslední přihlášení`.
  - **Sloupec `Role`:** Zobrazen jako `Badge` (`shadcn/ui`) pro vizuální rozlišení.
  - **Sloupec `Stav`:** Zobrazen jako `Badge` ("Aktivní" / "Blokovaný") podle `isActive`.
  - Tabulka má `Checkbox` na začátku každého řádku pro výběr.
  - V hlavičce tabulky je `Checkbox` ("Onačit vše").
- **Hromadné akce:**
  - Pokud je alespoň jeden uživatel označen, zobrazí se nad tabulkou panel.
  - **Panel obsahuje:**
    - `Select` pro změnu role.
    - `Button` ("Aktivovat označené").
    - `Button` ("Blokovat označené").
    - `Button` ("Uložit změny"), který provede všechny hromadné akce.
- **Akce (Řádek):**
  - V každém řádku `Dropdown Menu` (`...`) s akcemi:
    - "Upravit roli"
    - "Aktivovat/Blokovat účet"
    - (Volitelně: "Zobrazit detail" - pokud by existovala detailní stránka uživatele)

#### ⚙️ /settings

Stránka je dostupná **pouze pro ADMINA**. Na začátku `page.tsx` je nutné ověřit roli, jinak `redirect`.

- **Obsah:** Stránka obsahuje globální nastavení aplikace. Pro přehlednost a budoucí rozšíření je strukturovaná pomocí `Tabs` (`shadcn/ui`).
- **Akce (Ukládání):** Každá `Card` má v `CardFooter` své vlastní tlačítko `Button` ("Uložit").
  - Tlačítko je `disabled`, dokud uživatel neprovede změnu v dané kartě.
  - Po úspěšném uložení (přes Server Action) se zobrazí `Toast` notifikace "Nastavení uloženo".
- **Komponenty:**
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
