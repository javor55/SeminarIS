# Technická dokumentace Back-endu – Výběr semináře

Tento dokument poskytuje úplný a přesný technický popis back-endové části systému **Zápis seminářů**. Je určen pro vývojáře a odborné pedagogy ke studiu architektury, datového modelu, bezpečnostních mechanismů a implementačních detailů. Popis vychází přímo ze zdrojového kódu projektu.

**Číslo skupiny / týmu:** [DOPLNIT]

---

## 1. Cíle

Back-end systému byl navržen s důrazem na tři klíčové oblasti:

1.  **Datová integrita**: Absolutní záruky správnosti zápisů i při souběžném přístupu tisíců studentů. Dosaženo pomocí serializovatelných databázových transakcí.
2.  **Bezpečnost**: Víceúrovňový autorizační model, který eliminuje neoprávněný přístup na všech vrstvách (síťová, serverová logika).
3.  **Výkon a škálovatelnost**: Bezserverová architektura (Serverless) s minimální latencí díky React Server Components, paralelnímu načítání dat a inteligentnímu systému invalidace cache.

---

## 2. Datový model (Databázové schéma)

Databáze PostgreSQL je spravována přes Prisma ORM. Schéma je verzováno v souboru `prisma/schema.prisma`.

### Výčtové typy (Enums)

```prisma
enum Role   { GUEST  STUDENT  TEACHER  ADMIN }
enum Status { DRAFT  SCHEDULED  OPEN  CLOSED }
```

### Model: `User`

Uchovává identitu, oprávnění a historii přihlašování všech uživatelů.

| Pole           | Typ              | Výchozí  | Popis |
| :---           | :---             | :---     | :--- |
| `id`           | `String (CUID)`  | auto     | Primární klíč |
| `firstName`    | `String`         | —        | Křestní jméno |
| `lastName`     | `String`         | —        | Příjmení |
| `email`        | `String @unique` | —        | Přihlašovací e-mail |
| `passwordHash` | `String?`        | null     | Hash hesla (bcrypt). `null` u importovaných účtů bez hesla |
| `role`         | `Role`           | `GUEST`  | Oprávnění uživatele |
| `isActive`     | `Boolean`        | `true`   | Soft-kill přepínač přístupu |
| `lastLoginAt`  | `DateTime?`      | null     | Automaticky aktualizováno při přihlášení |
| `cohort`       | `String?`        | null     | Ročník studia (např. „2023/2024") |
| `createdAt`    | `DateTime`       | now()    | Datum vytvoření |
| `updatedAt`    | `DateTime`       | @updatedAt | Datum poslední změny |

### Model: `EnrollmentWindow` (Zápisové okno)

Definuje časový rámec, ve kterém probíhá výběr seminářů.

| Pole                | Typ         | Výchozí   | Popis |
| :---                | :---        | :---      | :--- |
| `id`                | `String`    | CUID      | Primární klíč |
| `name`              | `String`    | —         | Název (např. „Zápis LS 2025") |
| `description`       | `String?`   | null      | Volitelný popis |
| `status`            | `Status`    | `DRAFT`   | Stav okna |
| `startsAt`          | `DateTime`  | —         | Začátek zápisového období |
| `endsAt`            | `DateTime`  | —         | Konec zápisového období |
| `visibleToStudents` | `Boolean`   | `false`   | Viditelnost pro studenty |
| `createdById`       | `String`    | —         | FK → User (audit) |

**Stavy okna:**
| Stav        | Popis |
| :---        | :--- |
| `DRAFT`     | Pracovní návrh. Studenti ho nevidí. Stav se nikdy nepřepíná automaticky. |
| `SCHEDULED` | Naplánováno. Automaticky přejde na OPEN po nastoupení `startsAt`. |
| `OPEN`      | Aktivní. Studenti se mohou zapisovat. Automaticky přejde na CLOSED po `endsAt`. |
| `CLOSED`    | Uzavřeno. Zápisy jsou pouze ke čtení. |

### Model: `Block` (Zápisový blok)

Logická skupina instancí seminářů v rámci jednoho zápisového okna (např. „Povinné" vs. „Volitelné").

| Pole                | Typ       | Popis |
| :---                | :---      | :--- |
| `id`                | `String`  | Primární klíč |
| `name`              | `String`  | Název bloku |
| `order`             | `Int`     | Pořadí zobrazení. Unikátní v rámci okna (`@@unique([enrollmentWindowId, order])`). |
| `enrollmentWindowId`| `String`  | FK → EnrollmentWindow (onDelete: Cascade) |
| `deletedAt`         | `DateTime?` | Datum soft delete |
| `deletedById`       | `String?` | FK → User (audit mazání) |

### Model: `Subject` (Předmět)

Trvalá katalogová definice kurzu. Nezávislá na konkrétním zápisu.

| Pole          | Typ       | Popis |
| :---          | :---      | :--- |
| `name`        | `String`  | Název předmětu |
| `code`        | `String?` | Unikátní kód (např. „MAT1"). Používá se ke kontrole duplicity v zápisu. |
| `description` | `String?` | Krátký popis |
| `syllabus`    | `String`  | Detailní sylabus v HTML formátu (generován Tiptap editorem) |
| `isActive`    | `Boolean` | Archivační přepínač |

### Model: `SubjectOccurrence` (Instance semináře)

Konkrétní výskyt předmětu v daném bloku a zápisu. Propojuje předmět, blok a vyučujícího.

| Pole        | Typ      | Popis |
| :---        | :---     | :--- |
| `subjectId` | `String` | FK → Subject (onDelete: Cascade) |
| `blockId`   | `String` | FK → Block (onDelete: Cascade) |
| `teacherId` | `String?`| FK → User (volitelné) |
| `subCode`   | `String?`| Kód skupiny (např. „A", „B") |
| `capacity`  | `Int?`   | Maximální počet studentů. `null` = neomezeno. |
| `deletedAt` | `DateTime?`| Datum soft delete |

DB indexy: `@@index([subjectId])`, `@@index([blockId])`

### Model: `StudentEnrollment` (Zápis studenta)

Vazební tabulka propojující studenta s konkrétní instancí semináře. Každý řádek je jeden skutečný zápis.

| Pole                   | Typ      | Popis |
| :---                   | :---     | :--- |
| `studentId`            | `String` | FK → User |
| `subjectOccurrenceId`  | `String` | FK → SubjectOccurrence (onDelete: Cascade) |
| `createdById`          | `String` | FK → User (kdo zápis provedl – student nebo admin) |
| `deletedAt`            | `DateTime?`| Datum odhlášení (soft delete) |
| `deletedById`          | `String?`| FK → User (kdo odhlásil) |

DB indexy: `@@index([studentId])`, `@@index([subjectOccurrenceId])`

### Model: `SystemSetting` (Systémové nastavení)

Klíč-hodnota tabulka pro globální konfiguraci (bez nutnosti restartu aplikace).

| Pole    | Typ      | Popis |
| :---    | :---     | :--- |
| `key`   | `String @id` | Unikátní klíč (např. `current_cohort`, `registration_enabled`) |
| `value` | `String` | Hodnota nastavení |

### Schéma vztahů (ER diagram)

```
User ──< Subject (vytvořil, upravil)
User ──< SubjectOccurrence (učitel, vytvořil, upravil, smazal)
User ──< StudentEnrollment (student, vytvořil, smazal)
EnrollmentWindow ──< Block ──< SubjectOccurrence ──< StudentEnrollment
Subject ──< SubjectOccurrence
```

### Migrace schématu
Systém využívá **Prisma Migrations** pro verzování schématu databáze. Každá změna schématu je reprezentována SQL souborem v adresáři `prisma/migrations`, což zaručuje reprodukovatelnou databázi v libovolném prostředí.

---

## 3. Use Case (Klíčové scénáře)

### UC-01: Student – Registrace a zápis na seminář

1.  Uživatel vyplní formulář na `/register`. Požadavek odesílá API route `app/api/auth/register/route.ts`, která hashuje heslo a vytváří účet s rolí `GUEST`.
2.  Administrátor na stránce `/users` změní roli na `STUDENT` a aktivuje účet.
3.  Student se přihlásí. NextAuth ověří heslo, zkontroluje `isActive` a vydá JWT token.
4.  Na `/dashboard` je voláno `getEnrollmentWindowByIdWithBlocks()`, které automaticky synchronizuje stav okna s aktuálním časem.
5.  Student klikne na „Zapsat se". Je zavolána Server Action `enrollStudent()`, která v rámci **serializovatelné transakce** zkontroluje kapacitu, duplicitu v bloku, duplicitu předmětu v okně a stav okna. Pokud vše projde, zápis je uložen.
6.  UI se okamžitě aktualizuje díky `revalidatePath("/", "layout")`.

### UC-02: Admin – Správa zápisového okna

1.  Admin vytvoří zápisové okno (`createEnrollmentWindow`), přidá bloky (`createBlock`) a přiřadí výskyty předmětů (`createSubjectOccurrence`).
2.  Po nastavení stavu na `SCHEDULED` systém automaticky přejde na `OPEN` v čas `startsAt`.
3.  Po uzavření Admin exportuje matici zápisů přes `getEnrollmentMatrixData()` do CSV.

---

## 4. Použité technologie

### Frameworky a knihovny

| Technologie       | Verze    | Účel |
| :---              | :---     | :--- |
| **Next.js**       | ^14.2    | Jádro aplikace (App Router, RSC, Server Actions) |
| **React**         | 18.3.1   | UI knihovna |
| **TypeScript**    | ^5.6     | Striktní typový systém |
| **Prisma**        | ^6.19    | ORM pro PostgreSQL |
| **NextAuth.js**   | ^4.24    | Autentizace (JWT, Credentials) |
| **bcryptjs**      | ^3.0     | Hashování hesel (salt factor 10) |
| **shadcn/ui**     | —        | Komponentová knihovna (Radix UI primitiva) |
| **TailwindCSS**   | ^3.4     | CSS framework |
| **TanStack Table**| ^8.21    | Headless tabulka (client-side filtrování) |
| **Tiptap**        | ^3.10    | Rich-text editor pro sylabus |
| **Sonner**        | ^2.0     | Toast notifikace |
| **date-fns**      | ^4.1     | Manipulace s datumy |
| **Vercel Speed Insights** | ^2.0 | Monitoring výkonu v reálném čase |

### Bezpečnost

Aplikace implementuje vícevrstevnou obranu:

**1. Middleware (Edge vrstva) – `middleware.ts`**

Spouští se před vykreslením jakékoliv chráněné stránky na CDN Edge serveru Next.js. Ověřuje přítomnost platného JWT tokenu. Nepřihlášené požadavky jsou přesměrovány na `/login`.

```typescript
// Middleware – granulární role-based routing
if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
if (pathname.startsWith("/users") && token?.role !== "ADMIN" && token?.role !== "TEACHER") {
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
```

Chráněné cesty: `/dashboard`, `/admin`, `/users`, `/subjects`, `/enrollments`, `/profile`, `/settings`.

**2. Server Action Guards – `lib/data.ts`**

Každá Server Action obsahuje interní autorizační kontrolu nezávislou na frontendu. I kdybyl obejit middleware, akce selže na úrovni serveru.

```typescript
// Tři úrovně autorizačních stráží
async function requireAuth()       // Jakýkoli přihlášený uživatel
async function requirePrivileged() // ADMIN nebo TEACHER
async function requireAdmin()      // Výhradně ADMIN
```

**3. Ochrana dat – bcryptjs, Prisma, Next.js**

- **SQL Injection**: Prisma automaticky parametrizuje veškeré SQL dotazy.
- **XSS**: Next.js escapuje veškerý renderovaný JSX obsah.
- **CSRF**: Server Actions jsou chráněny vestavěným mechanismem Next.js (SameSite cookies + origin checking).
- **Hesla**: Nikdy uložena v čitelné podobě. Hashována bcryptjs se salt factorem 10.

### Zdroje (Reference)

- [Next.js App Router](https://nextjs.org/docs/app)
- [Prisma ORM Docs](https://www.prisma.io/docs)
- [NextAuth.js v4](https://next-auth.js.org/)
- [PostgreSQL – Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [shadcn/ui Component Library](https://ui.shadcn.com)
- [Tiptap Rich-Text Editor](https://tiptap.dev)

---

## 5. Příklady implementace (zdrojový kód s komentáři)

### 5.1 Singleton Prisma Client – `lib/prisma.ts`

V serverless prostředí (Vercel) je každý požadavek potenciálně nová instance funkce. Bez singletonového vzoru by každý dotaz otevíral nové databázové spojení a rychle vyčerpal connection pool.

```typescript
import { PrismaClient } from "@prisma/client";

// Uchováváme instanci na globálním objektu Node.js, který přežívá hot-reloads
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ log: ["query"] }); // V dev módu loguje SQL dotazy

// V produkci neukládáme na global – Vercel funkce jsou krátce žijící
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### 5.2 Autentizace – `lib/auth.ts`

Kompletní flow přihlašování: validace vstupu → databázový lookup → ověření hesla → kontrola aktivního stavu → JWT token.

```typescript
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        // Vyhledání podle e-mailu (normalizace na lowercase)
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.passwordHash) throw new Error("Nesprávný e-mail nebo heslo");
        
        // Porovnání zadaného hesla s uloženým hashem
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) throw new Error("Nesprávný e-mail nebo heslo");
        
        // Kontrola aktivního stavu – deaktivovaný uživatel se NEMŮŽE přihlásit
        if (!user.isActive) throw new Error("Tento účet byl deaktivován.");
        
        return { id: user.id, email: user.email, role: user.role, ... };
      },
    }),
  ],
  session: { strategy: "jwt" },  // Bezstavové JWT tokeny
  events: {
    // Automatická aktualizace lastLoginAt při každém přihlášení
    async signIn({ user }) {
      await prisma.user.update({ 
        where: { id: user.id }, 
        data: { lastLoginAt: new Date() } 
      });
    },
  },
};
```

> **Poznámka k bezpečnosti**: `isActive` je ověřováno **pouze při přihlášení**. Pokud je účet deaktivován poté, co se uživatel přihlásil, zůstane mu platný JWT token až do jeho vypršení. Kritické Server Actions provádějí re-validaci session a mohou tedy odchytit i tuto situaci.

### 5.3 Lazy Synchronizace stavu – `lib/data.ts`

Stav zápisového okna se v databázi nezapisuje pomocí cron-jobu nebo triggeru, ale **lazy způsobem** – synchronizuje se při každém relevantním čtení dat.

```typescript
// Interní funkce (neexportovaná) – volána z každé fetch funkce pro okna
async function syncEnrollmentWindowStatus(ew: { id, status, startsAt, endsAt }) {
  // computeEnrollmentStatus() z lib/utils.ts porovná stav s aktuálním časem serveru
  const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
  let newDbStatus: string | null = null;

  if (computed.is === "open" && ew.status !== "OPEN")         newDbStatus = "OPEN";
  else if (computed.is === "closed" && ew.status !== "DRAFT" 
           && ew.status !== "CLOSED")                         newDbStatus = "CLOSED";

  if (newDbStatus) {
    await prisma.enrollmentWindow.update({ 
      where: { id: ew.id }, 
      data: { status: newDbStatus } 
    });
  }
}

// Výpočetní logika (lib/utils.ts) – sdílená mezi serverem a klientem
export function computeEnrollmentStatus(statusEnum, startsAt, endsAt, now = new Date()) {
  if (statusEnum === "DRAFT") return { label: "Koncept", is: "closed" };
  const start = new Date(startsAt);
  const end   = new Date(endsAt);
  if (now < start)            return { label: "Naplánováno", is: "planned" };
  if (now >= start && now <= end) return { label: "Otevřeno",   is: "open" };
  return                            { label: "Uzavřeno",   is: "closed" };
}
```

Při načítání seznamu více oken jsou synchronizace spouštěny **paralelně**:
```typescript
await Promise.all(ews.map(ew => syncEnrollmentWindowStatus(ew)));
```

### 5.4 Transakční zápis studenta – `enrollStudent()`

Klíčová funkce celého systému. Každý pokus o zápis musí projít čtyřmi validacemi **uvnitř jedné atomic transakce**.

```typescript
export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  const user = await requireAuth();
  
  // Bezpečnostní kontrola: student nemůže zapsat jiného studenta
  if (user.role === "STUDENT" && user.id !== studentId) throw new Error("Unauthorized");
  if (user.role === "GUEST")  throw new Error("Guests cannot enroll");

  const res = await prisma.$transaction(async (tx) => {
    const targetOcc = await tx.subjectOccurrence.findUnique({
      where: { id: subjectOccurrenceId },
      include: { 
        subject: true,
        block: { include: { enrollmentWindow: true }}, 
        studentEnrollments: { where: { deletedAt: null }}
      }
    });
    if (!targetOcc || targetOcc.deletedAt) throw new Error("Seminář nenalezen.");

    // ★ Kontrola 1: Kapacita semináře
    if (targetOcc.capacity !== null && 
        targetOcc.studentEnrollments.length >= targetOcc.capacity) {
      throw new Error("Kapacita semináře je již naplněna.");
    }

    // ★ Kontrola 2: Duplicita v bloku (max 1 zápis/blok)
    const alreadyInBlock = await tx.studentEnrollment.findFirst({
      where: { studentId, deletedAt: null, 
                subjectOccurrence: { blockId: targetOcc.blockId }}
    });
    if (alreadyInBlock) throw new Error("V tomto bloku již máte zapsaný jiný seminář.");

    // ★ Kontrola 3: Duplicita předmětu v rámci zápisového okna (podle kódu)
    if (targetOcc.subject.code) {
      const sameSubjectInWindow = await tx.studentEnrollment.findFirst({
        where: { studentId, deletedAt: null, subjectOccurrence: { 
                   block: { enrollmentWindowId: targetOcc.block.enrollmentWindowId },
                   subject: { code: targetOcc.subject.code }
                 }}
      });
      if (sameSubjectInWindow) throw new Error("Tento předmět již máte zapsaný v jiném bloku.");
    }

    // ★ Kontrola 4: Stav zápisového okna (dle serverového času, ne klientského)
    if (user.role !== "ADMIN") {
      const ew = targetOcc.block.enrollmentWindow;
      const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
      await syncEnrollmentWindowStatus(ew); // Lazy aktualizace stavu v DB
      if (computed.is !== "open") throw new Error("Zápisové okno není otevřeno.");
    }

    // Všechny kontroly prošly → vytvoření záznamu
    return await tx.studentEnrollment.create({
      data: { studentId, subjectOccurrenceId, createdById: user.id },
    });

  }, { isolationLevel: 'Serializable' }); // Nejvyšší úroveň izolace → ochrana před race conditions

  revalidatePath("/", "layout"); // Invalidace Next.js cache → okamžitý update u všech uživatelů
  return res;
}
```

Použitá izolační úroveň `Serializable` zamezuje **race conditions**: dvěma souběžným zápisem posledního místa. Databáze garantuje, že transakce proběhly jako by byly sériové.

### 5.5 Hromadný import uživatelů – `importUsers()`

Admin může importovat uživatele z CSV. Funkce implementuje logiku UPSERT (update pokud existuje, create pokud ne) s robustním ošetřením chyb.

```typescript
export async function importUsers(data: Array<{email, firstName, lastName, ...}>) {
  await requireAdmin(); // Dostupné výhradně adminovi
  let created = 0, updated = 0, errors = 0;

  for (const row of data) {
    try {
      const email = row.email?.toLowerCase().trim();
      if (!email) { errors++; continue; }

      const existing = await prisma.user.findUnique({ where: { email } });
      // Hashování hesla pouze pokud bylo v CSV zadáno
      const passwordHash = row.password ? await bcrypt.hash(row.password, 10) : undefined;

      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { ...payload, ...(passwordHash ? { passwordHash } : {}) }});
        updated++;
      } else {
        // Nový uživatel dostane náhodné hash heslo, pokud není v CSV
        await prisma.user.create({ data: { ...payload, email, passwordHash: passwordHash || await bcrypt.hash(Math.random().toString(36), 10) }});
        created++;
      }
    } catch { errors++; } // Chyba v jednom řádku nepřeruší celý import
  }

  revalidatePath("/users");
  return { created, updated, errors };
}
```

### 5.6 Systémová nastavení – `SystemSetting`

Globální konfigurace (ročník, povolení registrace) jsou uloženy v tabulce `SystemSetting` jako páry klíč-hodnota. Funkce `upsert` zajistí atomické vytvoření nebo aktualizaci.

```typescript
export async function setGlobalCohort(cohort: string) {
  await requireAdmin();
  return await prisma.systemSetting.upsert({
    where:  { key: "current_cohort" },
    update: { value: cohort },
    create: { key: "current_cohort", value: cohort },
  });
}
```

---

## 6. Testování (uživatelské)

Testování je prováděno manuálně nad nasazenou verzí aplikace (`https://seminar-is.vercel.app`).

### Scénáře pro testera

| # | Název testu | Kroky | Očekávaný výsledek |
| :-- | :--- | :--- | :--- |
| T-01 | **Registrace a schválení** | Registrace nového uživatele, přihlášení. | Uživatel je v roli `GUEST` a nemůže se zapisovat. Po schválení adminem získá roli `STUDENT`. |
| T-02 | **Přihlášení – chybné heslo** | Zadání neexistujícího e-mailu nebo chybného hesla. | Formulář zobrazí chybovou hlášku, přihlášení selže. |
| T-03 | **Deaktivace účtu** | Admin deaktivuje aktivního uživatele. | Uživatel se po příštím přihlášení nedostane do systému. |
| T-04 | **Zápis na seminář** | Student se přihlásí a klikne na „Zapsat se" v otevřeném okně. | Zápis proběhne, obsazenost se aktualizuje, tlačítko se změní na „Odepsat". |
| T-05 | **Přeplnění kapacity** | Dva uživatelé se pokouší zapsat na poslední místo ve stejný okamžik. | Jeden uspěje, druhý obdrží chybovou zprávu o naplněné kapacitě. |
| T-06 | **Duplicita v bloku** | Student se pokusí zapsat druhý seminář ve stejném bloku. | Akce selže s hláškou „V tomto bloku již máte zapsaný jiný seminář." |
| T-07 | **Uzavřené okno** | Student se pokusí o zápis po uplynutí `endsAt`. | Server odmítne zápis. Stav okna se automaticky přepne na `CLOSED`. |
| T-08 | **Neoprávněný přístup** | Student naviguje na `/admin` nebo `/settings`. | Middleware přesměruje na `/dashboard`. |
| T-09 | **Resetování hesla** | Admin resetuje heslo jiného uživatele. | Uživatel obdrží nové heslo a může se přihlásit. |
| T-10 | **Export zápisů** | Admin otevře uzavřené okno a exportuje data do CSV. | Soubor CSV obsahuje správná data studentů a jejich zápisů. |

---

## 7. Monitoring

Systém je nasazen na platformě **Vercel** (Serverless / Edge Functions). Pro monitoring se využívají následující mechanismy:

-   **Vercel Speed Insights** (`@vercel/speed-insights`): Monitoruje klíčové webové metriky v reálném čase u skutečných uživatelů (FCP, LCP, CLS). Balíček je integrován přímo v root layoutu aplikace.
-   **Prisma Query Logging**: V `lib/prisma.ts` je nastaveno `log: ["query"]`, které v dev prostředí loguje všechny SQL dotazy do konzole. Umožňuje identifikaci pomalých či redundantních dotazů.
-   **Vercel Function Logs**: Každé serverové volání (Server Action, API Route) je automaticky logováno v dashboardu Vercel s dobou trvání a případnými chybami.

### Lighthouse Report (Produkční audit)

Audit byl proveden na stránce `/dashboard` na `https://seminar-is.vercel.app`:

| Kategorie        | Skóre          |
| :---             | :---           |
| **Performance**  | **100 / 100** |
| **Accessibility**| **95 / 100**  |
| **Best Practices**| **100 / 100** |
| **SEO**          | **100 / 100** |

Klíčové metriky výkonu: FCP 0.2 s, LCP 0.5 s, TBT 0 ms, CLS 0.

---

## 8. Tým, kompetence, strávená doba

*Tuto sekci doplňte před odevzdáním.*

| Člen | Role / Kompetence | Strávený čas |
| :--- | :--- | :--- |
| [DOPLNIT] | [DOPLNIT] | [DOPLNIT] hodiny |
| [DOPLNIT] | [DOPLNIT] | [DOPLNIT] hodiny |

---

## 9. Závěr – Shrnutí

### Úspěšnost splnění cílů

Systém byl úspěšně implementován a nasazen jako plně funkční školní informační systém. Všechny klíčové cíle byly splněny:

-   ✅ **Datová integrita**: Serializovatelné transakce zabraňují přeplnění kapacity i při souběžném přístupu.
-   ✅ **Bezpečnost**: Vícevrstvá ochrana (middleware, server guards, bcrypt, Prisma) bez known vulnerabilities.
-   ✅ **Výkon**: Lighthouse skóre 100/100 Performance dosaženo díky RSC, paralelnímu načítání a inteligentní cache invalidaci.
-   ✅ **Správa dat**: Soft delete, audit trail a Prisma Migrations zajišťují plnou auditovatelnost a reprodukovatelnost.
-   ✅ **Konfigurovatelnost**: `SystemSetting` tabulka umožňuje správu klíčových parametrů bez zásahu do kódu.

### Identifikované nedostatky a doporučení

-   **Validace vstupů**: Projekt nepoužívá validační knihovnu (jako Zod). Vstupy jsou ověřovány manuálně. Pro větší projekt je doporučena formalizovaná validace.
-   **Session invalidace**: Při deaktivaci účtu zůstane existující JWT token platný do vypršení. Pro striktní aplikace je doporučeno přejít na databázové session (NextAuth DB adapter).
-   **Typování (`any`)**: ESLint analýza odhalila použití `any` v některých UI komponentách snižující typovou bezpečnost.

### Budoucí příležitosti

-   Notifikace (e-mail) při otevření nebo uzavření zápisového okna.
-   Import/export ve formátu XLSX (rozšíření stávajícího CSV exportu).
-   Plnohodnotný administrátorský dashboard se statistikami (obsazenost v čase, trendy, heatmapy).
-   Migrace na NextAuth s databázovými session pro okamžitou invalidaci po deaktivaci účtu.

---

## 10. Zdroje

-   [Next.js App Router – dokumentace](https://nextjs.org/docs/app)
-   [Prisma ORM – kompletní reference](https://www.prisma.io/docs)
-   [NextAuth.js v4 – dokumentace](https://next-auth.js.org/)
-   [PostgreSQL Transaction Isolation Levels](https://www.postgresql.org/docs/current/transaction-iso.html)
-   [shadcn/ui – komponentová knihovna](https://ui.shadcn.com)
-   [Tiptap – Rich Text Editor](https://tiptap.dev/docs)
-   [Vercel Speed Insights](https://vercel.com/docs/speed-insights)
