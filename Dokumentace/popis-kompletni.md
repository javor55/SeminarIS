# Komplexní popis systému – Zápis seminářů

Tento dokument poskytuje ucelený technický a funkční popis systému **Zápis seminářů**. Spojuje aspekty uživatelského rozhraní (front-end) i vnitřní logiky (back-end) do jednoho celku určeného pro pedagogy, vývojáře a zadavatele.

**Číslo skupiny / týmu:** [DOPLNIT]

---

## 1. Úvod a motivace

Systém vznikl jako přehledný a interaktivní nástroj pro **organizaci školních seminářů a zápisů studentů**. Cílem bylo eliminovat ruční evidenci v tabulkových procesorech a e-mailovou komunikaci a nahradit ji automatizovaným, transparentním procesem.

### Hlavní cíle systému

- **Studenti**: Intuitivní výběr seminářů s okamžitou zpětnou vazbou o kapacitě.
- **Učitelé**: Přehled o obsazenosti skupin a přístup k seznamům zapsaných studentů.
- **Administrátoři**: Plná správa předmětů, bloků, zápisových oken a uživatelských účtů.
- **Organizace**: Zajištění integrity dat (zamezení over-enrollmentu) a vysoký výkon i při špičkách.

---

## 2. Uživatelské role a oprávnění

Systém rozlišuje čtyři základní úrovně oprávnění, které definují rozsah přístupu k funkcionalitám.

| Role | Popis a oprávnění |
| :--- | :--- |
| **GUEST** | Výchozí role po registraci. Má přístup pouze na dashboard (zobrazení zápisů) bez možnosti se zapisovat. |
| **STUDENT** | Může se zapisovat do otevřených zápisových oken. Omezen na 1 předmět/blok a unikátnost předmětu v rámci okna. |
| **TEACHER** | Spravuje sylaby předmětů, vidí seznamy studentů a přehled uživatelů (read-only). Nemůže se zapisovat. |
| **ADMIN** | Plná kontrola nad systémem: uživatelé, role, předměty, bloky, zápisová okna, exporty dat. |

### Navigace podle role

Aplikace zobrazuje v horní navigační liště pouze sekce přístupné pro danou roli:

| Role | Dostupné sekce |
| :--- | :--- |
| **ADMIN** | Dashboard, Zápisy, Předměty, Uživatelé, Nastavení |
| **TEACHER** | Dashboard, Zápisy, Předměty, Uživatelé |
| **STUDENT** | Dashboard |
| **GUEST** | Dashboard |

### Klíčové scénáře

1. **Student**: Registrace → Schválení adminem (přiřazení role STUDENT) → Přihlášení → Výběr semináře v otevřeném zápisovém okně → Potvrzení zápisu.
2. **Admin**: Vytvoření zápisového okna → Přidání bloků → Přiřazení výskytů předmětů → Nastavení časového rozvrhu → Export výsledků po uzavření.

---

## 3. Technická architektura

Systém je postaven jako moderní full-stack webová aplikace na frameworku **Next.js 14** s App Routerem.

### Architektonický model

Aplikace využívá hybridní model, kde většina logiky probíhá na straně serveru (React Server Components), což zajišťuje bezpečnost a bleskový start.

```
┌──────────────────────────────────────────────┐
│               Klient (Browser)               │
│  React Pages (App Router) │ shadcn/ui  │ useAuth() Context │
└────────────────────┬─────────────────────────┘
                     │ Server Actions / fetch
┌────────────────────▼─────────────────────────┐
│               Server (Next.js)               │
│  middleware.ts  │  lib/data.ts  │ lib/auth.ts│
│  (Auth guard)   │  (Server Actions) │ NextAuth│
│                       │ Prisma Client         │
│               ┌───────▼───────┐              │
│               │  PostgreSQL   │              │
│               └───────────────┘              │
└──────────────────────────────────────────────┘
```

### Klíčové technologické pilíře

- **React Server Components (RSC)**: Zobrazení dat bez nutnosti API volání z prohlížeče.
- **Server Actions**: Bezpečné mutace dat přímo na serveru s built-in CSRF ochranou.
- **TypeScript**: Striktní typování napříč celým zásobníkem.
- **Lazy synchronizace stavu**: Stav zápisových oken se automaticky synchronizuje se serverovým časem při každém načtení dat.

---

## 4. Datový model

Databáze PostgreSQL je spravována přes Prisma ORM. Schéma je verzováno v souboru `prisma/schema.prisma`.

### Výčtové typy

```prisma
enum Role   { GUEST  STUDENT  TEACHER  ADMIN }
enum Status { DRAFT  SCHEDULED  OPEN  CLOSED }
```

### Entita: `User` (Uživatel)

Uchovává identitu, oprávnění a historii přihlašování všech uživatelů.

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String (CUID)` | Primární klíč |
| `firstName` | `String` | Křestní jméno |
| `lastName` | `String` | Příjmení |
| `email` | `String @unique` | Přihlašovací e-mail |
| `passwordHash` | `String?` | Hash hesla (bcrypt). `null` u importovaných účtů |
| `role` | `Role` | Oprávnění uživatele (výchozí: `GUEST`) |
| `isActive` | `Boolean` | Soft-kill přepínač přístupu (výchozí: `true`) |
| `lastLoginAt` | `DateTime?` | Automaticky aktualizováno při přihlášení |
| `cohort` | `String?` | Ročník studia (např. „2023/2024") |
| `createdAt` | `DateTime` | Datum vytvoření |
| `updatedAt` | `DateTime` | Datum poslední změny |

### Entita: `EnrollmentWindow` (Zápisové okno)

Definuje časový rámec, ve kterém probíhá výběr seminářů.

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String` | Primární klíč |
| `name` | `String` | Název (např. „Zápis LS 2025") |
| `description` | `String?` | Volitelný popis |
| `status` | `Status` | Stav okna (výchozí: `DRAFT`) |
| `startsAt` | `DateTime` | Začátek zápisového období |
| `endsAt` | `DateTime` | Konec zápisového období |
| `visibleToStudents` | `Boolean` | Viditelnost pro studenty (výchozí: `false`) |
| `createdById` | `String` | FK → User (audit) |

**Stavy zápisového okna:**

| Stav | Popis |
| :--- | :--- |
| `DRAFT` | Pracovní návrh. Nikdy se nepřepíná automaticky. |
| `SCHEDULED` | Naplánováno. Automaticky přejde na `OPEN` po `startsAt`. |
| `OPEN` | Aktivní. Studenti se mohou zapisovat. Automaticky přejde na `CLOSED` po `endsAt`. |
| `CLOSED` | Uzavřeno. Zápisy jsou pouze ke čtení. |

Přechody mezi stavy jsou řízeny **lazy synchronizací**: při každém načtení dat se porovná DB stav s aktuálním serverovým časem a v případě nesouladu se stav okamžitě aktualizuje v databázi.

### Entita: `Block` (Zápisový blok)

Logická skupina instancí seminářů v rámci jednoho zápisového okna (např. „Povinné" vs. „Volitelné").

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String` | Primární klíč |
| `name` | `String` | Název bloku |
| `order` | `Int` | Pořadí zobrazení. Unikátní v rámci okna. |
| `description` | `String?` | Volitelný popis |
| `enrollmentWindowId` | `String` | FK → EnrollmentWindow (onDelete: Cascade) |
| `createdById` | `String` | FK → User (audit) |
| `deletedAt` | `DateTime?` | Datum soft delete |
| `deletedById` | `String?` | FK → User (audit mazání) |

### Entita: `Subject` (Předmět)

Trvalá katalogová definice kurzu. Nezávislá na konkrétním zápisu.

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String` | Primární klíč |
| `name` | `String` | Název předmětu |
| `code` | `String?` | Unikátní kód (např. „MAT1"). Slouží ke kontrole duplicity v zápisu. |
| `description` | `String?` | Krátký popis |
| `syllabus` | `String` | Detailní sylabus v HTML formátu (generován Tiptap editorem) |
| `isActive` | `Boolean` | Archivační přepínač |

### Entita: `SubjectOccurrence` (Instance semináře)

Konkrétní výskyt předmětu v daném bloku. Propojuje předmět, blok a vyučujícího.

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String` | Primární klíč |
| `subjectId` | `String` | FK → Subject (onDelete: Cascade) |
| `blockId` | `String` | FK → Block (onDelete: Cascade) |
| `teacherId` | `String?` | FK → User (volitelný) |
| `subCode` | `String?` | Kód skupiny (např. „A", „B") |
| `capacity` | `Int?` | Max. počet studentů. `null` = neomezeno. |
| `deletedAt` | `DateTime?` | Datum soft delete |

### Entita: `StudentEnrollment` (Zápis studenta)

Vazební tabulka propojující studenta s konkrétní instancí semináře.

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String` | Primární klíč |
| `studentId` | `String` | FK → User |
| `subjectOccurrenceId` | `String` | FK → SubjectOccurrence (onDelete: Cascade) |
| `createdById` | `String` | FK → User (kdo zápis provedl – student nebo admin) |
| `deletedAt` | `DateTime?` | Datum odhlášení (soft delete) |
| `deletedById` | `String?` | FK → User (kdo odhlásil) |

### Entita: `SystemSetting` (Systémové nastavení)

Klíč-hodnota tabulka pro globální konfiguraci (bez nutnosti restartu aplikace).

| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `key` | `String @id` | Unikátní klíč (např. `current_cohort`) |
| `value` | `String` | Hodnota nastavení |

### Schéma vztahů

```
User ──< Subject           (vytvořil, upravil)
User ──< SubjectOccurrence (učitel, vytvořil, upravil, smazal)
User ──< StudentEnrollment (student, vytvořil, smazal)
EnrollmentWindow ──< Block ──< SubjectOccurrence ──< StudentEnrollment
Subject ──< SubjectOccurrence
```

### Aplikační pravidla integrity

1. Student může mít v rámci jednoho **bloku** pouze **jeden aktivní zápis**.
2. Student se **nemůže zapsat na stejný předmět (dle kódu) ve více blocích** jednoho zápisového okna.
3. Odhlášení nebo přepsání je možné pouze ve stavu `OPEN`.
4. Všechny kontroly při zápisu (kapacita, duplicita v bloku, duplicita předmětu, stav okna) probíhají v rámci **serializovatelné databázové transakce**.
5. Validace stavu zápisového okna probíhá striktně na základě **serverového času** – klientský čas nemá vliv.

---

## 5. Bezpečnost a autentizace

Aplikace implementuje vícevrstvou obranu:

### Vrstva 1 – Middleware (`middleware.ts`)

Spouští se před vykreslením jakékoliv chráněné stránky na CDN Edge serveru. Ověřuje přítomnost platného JWT tokenu. Nepřihlášené požadavky jsou přesměrovány na `/login`.

```typescript
// Role-based routing v middleware
if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
if (pathname.startsWith("/users") && token?.role !== "ADMIN" && token?.role !== "TEACHER") {
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
```

Chráněné cesty: `/dashboard`, `/admin`, `/users`, `/subjects`, `/enrollments`, `/profile`, `/settings`.

### Vrstva 2 – Server Action Guards (`lib/data.ts`)

Každá Server Action obsahuje interní autorizační kontrolu nezávislou na frontendu.

```typescript
async function requireAuth()        // Jakýkoli přihlášený uživatel
async function requirePrivileged()  // ADMIN nebo TEACHER
async function requireAdmin()       // Výhradně ADMIN
```

### Vrstva 3 – UI vrstva (React komponenty)

Tlačítka a akce jsou podmíněně skryta nebo deaktivována dle role. Tato vrstva slouží pouze jako UX ochrana – bezpečnost je vždy vynucena na serveru.

### Autentizace – NextAuth.js

- **Provider**: `CredentialsProvider` (e-mail + heslo).
- **Strategie session**: JWT (bezstavové tokeny uložené v httpOnly cookie).
- **Hashování hesel**: bcryptjs se salt faktorem 10.
- **Session data v tokenu**: `id`, `role`, `firstName`, `lastName`, `isActive`.
- **Poslední přihlášení**: Automaticky aktualizováno v `User.lastLoginAt` při každém přihlášení.

### Ochrana dat

- **SQL Injection**: Prisma automaticky parametrizuje veškeré SQL dotazy.
- **XSS**: Next.js escapuje veškerý renderovaný JSX obsah.
- **CSRF**: Server Actions jsou chráněny vestavěným mechanismem Next.js (SameSite cookies + origin checking).

---

## 6. Struktura stránek (Site Map)

Aplikace používá Next.js App Router. Nepřihlášený uživatel vidí pouze veřejnou úvodní stránku a formuláře pro přihlášení/registraci.

```
/app
├── (auth)/
│   ├── login/page.tsx          # Přihlašovací formulář
│   └── register/page.tsx       # Registrační formulář
│
├── api/auth/
│   ├── [...nextauth]/route.ts  # NextAuth.js API handler
│   └── register/route.ts       # Registrační API endpoint
│
├── dashboard/page.tsx           # Hlavní stránka pro přihlášené (výběr zápisu)
│
├── subjects/
│   ├── page.tsx                 # Seznam všech předmětů
│   └── [id]/
│       ├── page.tsx             # Detail předmětu
│       └── edit/page.tsx        # Editace předmětu
│
├── enrollments/
│   ├── page.tsx                 # Přehled zápisových oken
│   └── [id]/page.tsx            # Detail zápisového okna
│
├── users/page.tsx               # Přehled uživatelů (ADMIN: správa, TEACHER: jen čtení)
│
├── profile/page.tsx             # Profil a změna hesla
├── settings/page.tsx            # Nastavení systému (pouze ADMIN)
│
├── layout.tsx                   # Klientský layout (AuthProvider + AppShell + AppTopbar)
├── globals.css                  # Globální styly
└── page.tsx                     # Veřejná úvodní stránka

/middleware.ts                   # Serverová ochrana rout
```

---

## 7. Popis stránek a funkcionalit

### `/` – Úvodní stránka (Landing page)

Vstupní stránka pro nepřihlášeného uživatele. Poskytuje dvě hlavní akce: přihlášení nebo registraci. Přihlášený uživatel je přesměrován na dashboard.

### `/login` – Přihlášení

Formulář s poli **E-mail** a **Heslo**. Po úspěšném přihlášení je uživatel přesměrován na `/dashboard`. Chybné údaje zobrazí chybovou hlášku.

### `/register` – Registrace

Registrační formulář. Nově vytvořený účet má automaticky roli **GUEST** a musí být schválen (aktivován) administrátorem.

### `/dashboard` – Hlavní stránka

Stránka je **Server Component**. Funkce `findDashboardEnrollment()` vybere nejvhodnější zápisové okno podle stavu (`OPEN` → `SCHEDULED` → `DRAFT` → `CLOSED`) a zobrazí ho pomocí sdílené komponenty `EnrollmentView`.

Dashboard vždy zobrazuje **jedno vybrané zápisové okno**, nikoliv jejich seznam.

#### Komponenta `EnrollmentHeader`

Zobrazuje základní informace o zápisovém okně:

- Název, datum začátku a konce, stav (`DRAFT`, `SCHEDULED`, `OPEN`, `CLOSED`).
- Tlačítko **„Upravit zápis"** (ADMIN/TEACHER) – otevírá dialog `EditEnrollmentDialog`.

#### Komponenta `EnrollmentBlocks` a `EnrollmentBlockCard`

Pod hlavičkou se zobrazuje mřížka bloků. Každý blok je karta obsahující:

- Název bloku.
- Tabulku výskytů předmětů (`SubjectOccurrence`).
- Akce podle role.

**Tabulka výskytů – sloupce:**

| Sloupec | Popis |
| :--- | :--- |
| **Předmět** | Název předmětu (klik vede na `/subjects/[id]`) |
| **Učitel** | Jméno vyučujícího |
| **Obsazenost** | Např. `7/30` nebo `2/∞` |
| **Akce** | STUDENT: Zapsat/Odhlásit; ostatní role: disabled |

#### Chování STUDENT

Student může zapsat se nebo odhlásit, pokud:

- zápisové okno má stav **OPEN**,
- v daném bloku nemá jiný aktivní zápis,
- není zapsán na stejný předmět (dle kódu) v jiném bloku okna.

#### Chování TEACHER a ADMIN

- Vidí jméno učitele a aktuální obsazenost.
- Kliknutím na číslo obsazenosti se otevře dialog `OccurrencesStudentsDialog` se seznamem zapsaných studentů.
- Tlačítka pro zápis jsou **neaktivní** (`disabled`).
- ADMIN navíc může otevřít dialog pro úpravu výskytu.

### `/subjects` – Seznam předmětů

Dostupné pro role TEACHER a ADMIN. Stránka obsahuje:

- komponentu `DataTable` se seznamem předmětů,
- fulltext vyhledávání a filtrování,
- tlačítko pro vytvoření nového předmětu (ADMIN/TEACHER).

### `/subjects/[id]` – Detail předmětu

Dostupné pro všechny přihlášené role. Zobrazuje:

- Název, kód, krátký popis (`description`), syllabus (HTML z Tiptap editoru).
- Tabulku všech výskytů daného předmětu napříč zápisovými okny a bloky.

**Sloupce tabulky výskytů na detailu předmětu:**

| Sloupec | Popis |
| :--- | :--- |
| **Zápis** | Název `EnrollmentWindow` |
| **Blok** | Název `Block` |
| **Skupina** | Kód skupiny (`subCode`) |
| **Vyučující** | Jméno učitele |
| **Kapacita** | Max. počet studentů |
| **Obsazenost** | Aktuální počet zapsaných |

Role TEACHER/ADMIN mají v pravé horní části tlačítko **„Upravit"**, které vede na `/subjects/[id]/edit`.

### `/subjects/[id]/edit` – Editace předmětu

Dostupná pro role TEACHER a ADMIN. Editační formulář obsahuje:

- `Input` – název předmětu (`name`)
- `Input` – kód předmětu (`code`)
- `Textarea` – krátký popis (`description`)
- **Rich Text Editor (Tiptap)** – detailní sylabus (`syllabus`) s podporou formátování (nadpisy, tučné, kurzíva, seznamy)

Akce: **Uložit** (uloží a přesměruje na detail), **Zrušit** (přesměruje bez uložení).

### `/enrollments` – Přehled zápisových oken

Dostupné pro role ADMIN a TEACHER. Zobrazuje tabulku zápisových oken.

**Statistiky v tabulce:**

- název a stav zápisu, viditelnost pro studenty,
- termín začátku a konce,
- počet bloků a počet výskytů předmětů v blocích,
- počet unikátních zapsaných studentů,
- počet studentů, kteří mají zápis kompletní (zapsáni ve všech blocích).

**Filtry:** Stav (DRAFT/SCHEDULED/OPEN/CLOSED), Viditelnost, Začátek, Konec.

**Tlačítko „Vytvořit nový zápis"** – zobrazuje se pouze pro ADMIN; otevírá dialog pro zadání názvu, popisu, stavu, časového rozmezí a viditelnosti.

Ve sloupci **Akce** má ADMIN k dispozici tlačítko **„Upravit zápis"** (otevírá dialog pro úpravu). TEACHER toto tlačítko nevidí.

### `/enrollments/[id]` – Detail zápisového okna

Stránka zobrazuje detail jednoho zápisového okna. Znovu využívá **stejné komponenty jako dashboard** (`EnrollmentHeader`, `EnrollmentBlocks`, `EnrollmentBlockCard`). Dostupná pro ADMIN a TEACHER.

### `/users` – Přehled uživatelů

Dostupné pro ADMIN (plný přístup) a TEACHER (jen čtení).

**Přístupová práva:**

- **ADMIN**: může měnit role, aktivaci, resetovat hesla, importovat uživatele z CSV, provádět hromadné akce.
- **TEACHER**: vidí seznam uživatelů a jejich zápisy, ale nemůže měnit role, resetovat hesla, importovat ani provádět hromadné akce.

**Filtry:** Fulltext v jméně a e-mailu, filtr podle role, stavu, datumu vytvoření, datumu posledního přihlášení.

**Sloupce tabulky:**

| Sloupec | Popis |
| :--- | :--- |
| **Jméno** | Kombinace jména a příjmení |
| **E-mail** | E-mail uživatele |
| **Role** | Barevný Badge s hodnotou role |
| **Stav** | Badge „Aktivní" / „Neaktivní" |
| **Vytvořen** | Datum vytvoření uživatele |
| **Poslední přihlášení** | Datum posledního přihlášení |

**Hromadné akce** (pouze ADMIN): Změna role, Aktivovat vybrané, Deaktivovat vybrané.

**Akce v řádku** (ADMIN): Kontextové menu pro změnu role a přepínač aktivace/deaktivace. Vše je řešeno inline v tabulce bez zvláštní detailní stránky.

### `/profile` – Profil uživatele

Stránka dostupná pro všechny přihlášené uživatele. Umožňuje zobrazení základních informací o účtu a změnu hesla.

### `/settings` – Nastavení systému

Dostupné **pouze pro ADMIN**. Stránka je rozdělena do záložek (`Tabs`):

- **Záložka „Obecné"**:
  - Karta **„Role"**: výběr výchozí role pro nově schválené uživatele (`STUDENT` nebo `TEACHER`).
  - Karta **„Registrace"**: nastavení povolených e-mailových domén (omezení registrace).
- **Záložka „Texty"**:
  - Karta **„Text pro GUEST"**: text zobrazený uživateli s rolí GUEST na dashboardu.
  - Karta **„Text pro 'Žádný zápis'"**: text zobrazený, pokud není aktivní žádné zápisové okno.
- **Záložka „Pokročilé"**: rezervována pro budoucí použití.

---

## 8. Implementační detaily

### Transakční integrita zápisů – `enrollStudent()`

Klíčová funkce systému. Každý pokus o zápis musí projít čtyřmi validacemi **uvnitř jedné atomické transakce** (`isolationLevel: 'Serializable'`):

1. **Kapacita**: Počet aktivních zápisů musí být nižší než `capacity`.
2. **Duplicita v bloku**: Student nesmí mít v daném bloku jiný aktivní zápis.
3. **Duplicita předmětu**: Student nesmí mít zapsán předmět se stejným kódem v jiném bloku téhož okna.
4. **Stav okna**: Zápisové okno musí mít stav `OPEN` (ověřeno serverovým časem). Admin tuto kontrolu obchází.

Serializovatelná izolace zamezuje **race conditions**: dvěma souběžným zápisům na poslední volné místo.

Po úspěšném zápisu je volán `revalidatePath("/", "layout")` – okamžitá invalidace Next.js cache pro všechny uživatele.

### Lazy synchronizace stavu zápisových oken

Stav zápisového okna se aktualizuje **lazy způsobem** – bez cron-jobu. Při každém relevantním čtení dat (`getEnrollmentWindowsWithDetails`, `getEnrollmentWindowByIdWithBlocks`, atd.) se interně volá `syncEnrollmentWindowStatus()`, která porovná DB stav s výsledkem `computeEnrollmentStatus()` (z `lib/utils.ts`).

Přechody:
- `SCHEDULED` + čas po `startsAt` → zapíše `OPEN` do DB
- `OPEN` + čas po `endsAt` → zapíše `CLOSED` do DB
- `DRAFT` se nikdy nepřepíná automaticky

### Import uživatelů – `importUsers()`

Admin může importovat uživatele z CSV. Funkce implementuje logiku UPSERT (update pokud existuje, create pokud ne). Chyba v jednom řádku nepřeruší celý import. Výsledkem je report `{ created, updated, errors }`.

### Singleton Prisma Client – `lib/prisma.ts`

V serverless prostředí (Vercel) je Prisma Client udržován jako singleton na globálním objektu Node.js, aby nedocházelo k vyčerpání connection poolu při hot-reloadech v dev prostředí.

---

## 9. Technologický stack

| Technologie | Verze | Účel |
| :--- | :--- | :--- |
| **Next.js** | ^14.2 | Jádro aplikace (App Router, RSC, Server Actions) |
| **React** | 18.3.1 | UI knihovna |
| **TypeScript** | ^5.6 | Striktní typový systém |
| **Prisma** | ^6.19 | ORM pro PostgreSQL |
| **PostgreSQL** | — | Relační databáze |
| **NextAuth.js** | ^4.24 | Autentizace (JWT, Credentials) |
| **bcryptjs** | ^3.0 | Hashování hesel (salt factor 10) |
| **shadcn/ui** | — | Komponentová knihovna (Radix UI primitiva) |
| **TailwindCSS** | ^3.4 | CSS framework |
| **TanStack Table** | ^8.21 | Headless tabulka (client-side filtrování) |
| **Tiptap** | ^3.10 | Rich-text editor pro sylabus |
| **Sonner** | ^2.0 | Toast notifikace |
| **date-fns** | ^4.1 | Manipulace s datumy |
| **Vercel Speed Insights** | ^2.0 | Monitoring výkonu v reálném čase |

### Klíčové soubory projektu

| Soubor | Účel |
| :--- | :--- |
| `middleware.ts` | Serverová ochrana rout (JWT ověření, role-based routing) |
| `lib/auth.ts` | Konfigurace NextAuth.js (providers, callbacks, events) |
| `lib/data.ts` | Všechny Server Actions – CRUD operace, autorizace, validace |
| `lib/prisma.ts` | Singleton instance Prisma Client |
| `lib/utils.ts` | Utility funkce (`cn`, `computeEnrollmentStatus`) |
| `lib/types.ts` | TypeScript typy pro celou aplikaci |
| `prisma/schema.prisma` | Definice databázového schématu |
| `components/app-topbar.tsx` | Navigační lišta s role-based odkazy |
| `components/app-shell.tsx` | Layout wrapper (topbar + obsah) |
| `components/auth/auth-provider.tsx` | React context pro autentizaci (`useAuth()`) |

---

## 10. Testování

### Manuální testovací scénáře

| # | Název testu | Kroky | Očekávaný výsledek |
| :-- | :--- | :--- | :--- |
| T-01 | **Registrace a schválení** | Registrace nového uživatele, přihlášení. | Uživatel je v roli `GUEST` a nemůže se zapisovat. Po schválení adminem získá roli `STUDENT`. |
| T-02 | **Přihlášení – chybné heslo** | Zadání neexistujícího e-mailu nebo chybného hesla. | Formulář zobrazí chybovou hlášku, přihlášení selže. |
| T-03 | **Deaktivace účtu** | Admin deaktivuje aktivního uživatele. | Uživatel se po příštím přihlášení nedostane do systému. |
| T-04 | **Zápis na seminář** | Student klikne na „Zapsat se" v otevřeném okně. | Zápis proběhne, obsazenost se aktualizuje, tlačítko se změní na „Odepsat". |
| T-05 | **Přeplnění kapacity** | Dva uživatelé se pokouší zapsat na poslední místo ve stejný okamžik. | Jeden uspěje, druhý obdrží chybovou zprávu o naplněné kapacitě. |
| T-06 | **Duplicita v bloku** | Student se pokusí zapsat druhý seminář ve stejném bloku. | Akce selže s hláškou „V tomto bloku již máte zapsaný jiný seminář." |
| T-07 | **Uzavřené okno** | Student se pokusí o zápis po uplynutí `endsAt`. | Server odmítne zápis. Stav okna se automaticky přepne na `CLOSED`. |
| T-08 | **Neoprávněný přístup** | Student naviguje na `/settings`. | Middleware přesměruje na `/dashboard`. |
| T-09 | **Resetování hesla** | Admin resetuje heslo jiného uživatele. | Uživatel obdrží nové heslo a může se přihlásit. |
| T-10 | **Export zápisů** | Admin otevře uzavřené okno a exportuje data do CSV. | Soubor CSV obsahuje správná data studentů a jejich zápisů. |

---

## 11. Monitoring a kvalita

### Monitoring

- **Vercel Speed Insights**: Monitoruje klíčové webové metriky v reálném čase u skutečných uživatelů (FCP, LCP, CLS).
- **Prisma Query Logging**: V dev prostředí loguje všechny SQL dotazy do konzole pro identifikaci pomalých dotazů.
- **Vercel Function Logs**: Každé serverové volání je automaticky logováno v dashboardu Vercel.

### Lighthouse Report (produkční audit – `https://seminar-is.vercel.app`)

| Kategorie | Skóre |
| :--- | :--- |
| **Performance** | **100 / 100** |
| **Accessibility** | **95 / 100** |
| **Best Practices** | **100 / 100** |
| **SEO** | **100 / 100** |

Klíčové metriky výkonu: FCP 0.2 s, LCP 0.5 s, TBT 0 ms, CLS 0.

### ESLint a typová bezpečnost

Projekt využívá ESLint (přes `next lint`) a TypeScript v režimu `strict`. ESLint analýza odhalila:

- Použití `any` v některých UI komponentách (snižuje typovou bezpečnost).
- Nepoužité proměnné a mrtvý kód.
- Podmíněné volání React Hooks v cell rendererech tabulek (doporučení: extrakt do mini-komponent).

---

## 12. Identifikované nedostatky a doporučení

- **Validace vstupů**: Projekt nepoužívá validační knihovnu (jako Zod). Vstupy jsou ověřovány manuálně.
- **Session invalidace**: Při deaktivaci účtu zůstane existující JWT token platný do vypršení. Doporučení: přejít na databázové session (NextAuth DB adapter).
- **Typování (`any`)**: Použití `any` v některých komponentách snižuje typovou bezpečnost.

### Budoucí příležitosti

- Notifikace (e-mail) při otevření nebo uzavření zápisového okna.
- Import/export ve formátu XLSX.
- Administrátorský dashboard se statistikami (obsazenost v čase, trendy).
- Migrace na NextAuth s databázovými session pro okamžitou invalidaci po deaktivaci účtu.

---

## 13. Tým a kompetence

| Člen | Role / Kompetence | Strávený čas |
| :--- | :--- | :--- |
| [DOPLNIT] | [DOPLNIT] | [DOPLNIT] hodiny |
| [DOPLNIT] | [DOPLNIT] | [DOPLNIT] hodiny |

---

## 14. Závěr

Systém „Zápis seminářů" byl úspěšně implementován a nasazen jako plně funkční školní informační systém. Všechny klíčové cíle byly splněny:

- ✅ **Datová integrita**: Serializovatelné transakce zabraňují přeplnění kapacity i při souběžném přístupu.
- ✅ **Bezpečnost**: Vícevrstvá ochrana (middleware, server guards, bcrypt, Prisma) bez known vulnerabilities.
- ✅ **Výkon**: Lighthouse skóre 100/100 Performance díky RSC, paralelnímu načítání a inteligentní cache invalidaci.
- ✅ **Správa dat**: Soft delete, audit trail a Prisma Migrations zajišťují plnou auditovatelnost a reprodukovatelnost.
- ✅ **Konfigurovatelnost**: `SystemSetting` tabulka umožňuje správu klíčových parametrů bez zásahu do kódu.

---

## 15. Zdroje

- [Next.js App Router – dokumentace](https://nextjs.org/docs/app)
- [Prisma ORM – kompletní reference](https://www.prisma.io/docs)
- [NextAuth.js v4 – dokumentace](https://next-auth.js.org/)
- [PostgreSQL Transaction Isolation Levels](https://www.postgresql.org/docs/current/transaction-iso.html)
- [shadcn/ui – komponentová knihovna](https://ui.shadcn.com)
- [Tiptap – Rich Text Editor](https://tiptap.dev/docs)
- [Vercel Speed Insights](https://vercel.com/docs/speed-insights)
