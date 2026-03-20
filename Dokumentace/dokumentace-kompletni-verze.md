# Dokumentace informačního systému: Zápis seminářů

Tento dokument představuje kompletní technickou a uživatelskou dokumentaci systému **Zápis seminářů**. Obsahuje podrobný popis funkčního chování, datové architektury, bezpečnostních mechanismů a implementačních detailů. Dokument slouží jako zadávací i předávací zpráva pro odborné pedagogy a vývojáře.

---

## 1. Úvod

Tento dokument popisuje komplexní chování a vnitřní strukturu systému **Zápis seminářů**.  
Cílem systému je umožnit studentům přihlásit se na nabízené semináře (předměty) v rámci definovaného zápisu, který spravuje administrátor, a to vše v moderním, bezpečném a vysoce výkonném webovém rozhraní.

**Číslo skupiny:** [DOPLNIT]

---

## 2. Motivace a Cíle

### Motivace
Tento systém vznikl jako jednoduchý, přehledný a interaktivní nástroj pro **organizaci školních seminářů a zápisů studentů**. Je navržen tak, aby pokryl všechny klíčové potřeby konkrétní školy, kde se plánuje systém nasadit, ale zároveň zůstal dostatečně lehký, intuitivní a snadno upravitelný.

Systém eliminuje ruční evidenci, zdlouhavou komunikaci e-mailem nebo tabulkovými procesory a přináší **automatizaci a pořádek**.

### Hlavní cíle
Cílem systému je vytvořit **jednotné místo**, kde:
-   **Studenti** mohou snadno vybírat semináře podle svých preferencí s okamžitou kontrolou kapacity.
-   **Učitelé** mají přehled o svých skupinách a mohou vidět zapsané studenty v reálném čase.
-   **Administrátoři** mohou centrálně spravovat předměty, bloky, zápisová období a uživatele.
-   **Celý proces** zápisu je jasně strukturovaný, přehledný a transparentní díky automatizovaným pravidlům.

---

## 3. Uživatelské role a Přístupy

Systém rozlišuje čtyři základní role, které mají definovaný přístup pouze ke své části systému.

### Guest (`GUEST`)
-   Výchozí role po registraci čekající na schválení administrátorem.
-   Navigace zobrazuje pouze **přehled zápisů**.
-   GUEST se nemůže zapisovat ani upravovat žádná data.

### Student (`STUDENT`)
-   Vidí **dashboard** s dostupnými zápisovými obdobími.
-   Pokud je zápis ve stavu **OPEN**, může se zapisovat na výskyty předmětů nebo se odhlašovat.
-   Vidí aktuální obsazenost (např. `7/30`) a detaily předmětů včetně sylabu.

### Teacher (`TEACHER`)
-   Má přístup k sekcím **Předměty** a **Uživatelé** (u uživatelů pouze pro čtení).
-   Může vytvářet a upravovat **předměty** a jejich sylaby.
-   Vidí seznamy zapsaných studentů u jednotlivých seminářů.
-   Nemůže měnit role uživatelů ani spravovat zápisová okna.

### Admin (`ADMIN`)
-   Má plná oprávnění v celém systému.
-   Spravuje role uživatelů, jejich aktivaci a resety hesel.
-   Vytváří a konfiguruje **zápisová okna, bloky a výskyty**.
-   Spouští a ukončuje zápisy (změna stavu na OPEN/CLOSED).
-   Provádí hromadné importy a exporty dat.

---

## 4. Technická Architektura

Systém je postaven jako moderní full-stack webová aplikace využívající framework **Next.js 14** s architekturou **App Router**.

### Schéma architektury
```
┌─────────────────────────────────────────────────────┐
│                    Klient (Browser)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ React Pages │  │  shadcn/ui   │  │  useAuth() │  │
│  │  (App Router│  │  Components  │  │  Context   │  │
│  └──────┬──────┘  └──────────────┘  └────────────┘  │
└─────────┼───────────────────────────────────────────┘
          │ Server Actions / Client Calls
┌─────────┼───────────────────────────────────────────┐
│         ▼          Server (Next.js)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ middleware  │  │  lib/data.ts │  │ lib/auth.ts│  │
│  │   .ts       │→ │ Server       │  │ NextAuth   │  │
│  │ (Auth guard)│  │ Actions      │  │ Config     │  │
│  └─────────────┘  └──────┬───────┘  └────────────┘  │
│                          │ Prisma Client             │
│                   ┌──────▼───────┐                   │
│                   │  PostgreSQL  │                   │
│                   │  (Prisma DB) │                   │
│                   └──────────────┘                   │
└─────────────────────────────────────────────────────┘
```

### Klíčové technologické pilíře:
-   **React Server Components (RSC)**: Většina logiky probíhá na serveru, což eliminuje klientské fetch požadavky a zvyšuje bezpečnost.
-   **Server Actions**: Zajišťují mutace dat (zápis, úpravy) přímo na serveru s automatickou CSRF ochranou.
-   **Streaming**: Umožňuje postupné načítání stránek, takže uživatel vidí obsah okamžitě, zatímco náročné operace dobíhají na pozadí.
-   **Type Safety**: Striktní TypeScript napříč celým stackem zajišťuje konzistenci datového kontraktu.

---

## 5. Bezpečnost a Autentizace

Aplikace implementuje bezpečnost ve **třech vrstvách**:

1.  **Middleware layer (`middleware.ts`)**: Běží na edge serveru. Ověřuje JWT token a provádí Role-based routing (např. nepustí studenta do `/admin`).
2.  **Server Logic layer (`lib/data.ts`)**: Každá Server Action re-validuje oprávnění uživatele (např. `requireAdmin()`).
3.  **UI layer**: Podmíněné vykreslování prvků (schovávání tlačítek), které slouží pro UX, nikoliv jako primární zabezpečení.

### Autentizace:
-   **NextAuth.js** s `CredentialsProvider`.
-   **Strategie**: Bezstavové JWT tokeny uložené v `httpOnly` cookies.
-   **Hashování**: Hesla jsou hashována pomocí **bcryptjs** (salt factor 10).

---

## 6. Datový model (Entity a vztahy)

Databáze PostgreSQL je spravována přes **Prisma ORM**.

### Klíčové modely:

#### Uživatel (`User`)
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `string` | Unikátní identifikátor (CUID) |
| `firstName` | `string` | Jméno |
| `lastName` | `string` | Příjmení |
| `email` | `string` | Školní e-mail (unikátní index) |
| `role` | `Enum` | GUEST, STUDENT, TEACHER, ADMIN |
| `isActive` | `boolean` | Indikuje, zda má uživatel přístup do systému |
| `cohort` | `string?` | Ročník (např. "2024") |

#### Zápisové okno (`EnrollmentWindow`)
Představuje časové období výběru seminářů.
-   **Stavy**: `DRAFT`, `SCHEDULED`, `OPEN`, `CLOSED`.
-   **Lazy Sync**: Systém při každém načtení porovná stav s aktuálním serverovým časem a automaticky přepne např. ze `SCHEDULED` na `OPEN`.

#### Blok (`Block`)
Logická skupina předmětů v rámci zápisu (např. "Blok A - Humanitní").
-   Student si v každém bloku může zapsat **právě jeden** seminář.

#### Předmět (`Subject`) a Instance (`SubjectOccurrence`)
-   **Subject**: Obecná definice (název, kód, sylabus v HTML).
-   **Occurrence**: Konkrétní skupina v bloku s vyučujícím, kódem skupiny (např. "A") a **kapacitou**.

#### Zápis studenta (`StudentEnrollment`)
Vazba studenta na konkrétní `SubjectOccurrence`.
-   Všechny mutace probíhají v **SERIALIZABLE transakci**, což zaručuje, že nedojde k přeplnění kapacity při souběžných požadavcích.

---

## 7. Uživatelské rozhraní (Front-end detail)

### Wireframes a vizuální koncept
Aplikace využívá **shadcn/ui** (New York style) s barevnou paletou **Slate**.

1.  **Welcome & Login**: Minimalistické rozhraní pro vstup do systému.
2.  **Dashboard**: Hlavní pracovní plocha studenta. Zobrazuje karty bloků s tabulkami seminářů.
3.  **List Views**: Jednotné tabulky pro správu dat (Předměty, Zápisy, Uživatelé) s podporou client-side filtrování přes **TanStack Table**.

### Site Map (Strom stránek)
```bash
/app
├── (auth)/login, register   # Přihlášení a registrace
├── dashboard/               # Hlavní stránka (zápis studenta)
├── subjects/                # Seznam a detail předmětů (editace pro Teacher/Admin)
├── enrollments/             # Správa zápisových oken (pro Admin/Teacher)
├── users/                   # Správa uživatelů (pro Admin/Teacher)
├── settings/                # Globální nastavení systému (pouze Admin)
└── profile/                 # Uživatelský profil
```

---

## 8. Implementační detaily (Back-end logic)

### Transakční integrita (Ukázka kódu)
```typescript
// Výstřižek z lib/data.ts
export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  // 1. Ověření autorizace
  const user = await requireAuth();
  
  // 2. Start Serializable transakce
  return await prisma.$transaction(async (tx) => {
    const occ = await tx.subjectOccurrence.findUnique({ ... });
    
    // Validace kapacity, bloku a stavu okna...
    if (occ.studentEnrollments.length >= occ.capacity) {
      throw new Error("Kapacita naplněna");
    }
    
    // Provedení zápisu
    return await tx.studentEnrollment.create({ ... });
  }, { isolationLevel: 'Serializable' });
}
```

### Soft Delete a Audit Trail
Entity podporují smazání bez fyzického odstranění z disku (`deletedAt`), což umožňuje administrátorům dohledat historii nebo obnovit omylem smazaná data.

---

## 9. Zajištění kvality a Analýza

### Lighthouse Report (Audit výkonu)
Audit webu `https://seminar-is.vercel.app` prokázal špičkovou kvalitu:
-   **Performance**: 100/100 (FCP 0.2s, LCP 0.5s).
-   **Best Practices**: 100/100 (HTTPS, moderní API).
-   **SEO**: 100/100.
-   **Accessibility**: 95/100.

### ESLint (Statická analýza)
Projekt prochází pravidelnou kontrolou pravidel:
-   Vynucení typové bezpečnosti (eliminace `any`).
-   Kontrola životního cyklu React Hooks.
-   Odstranění nepoužívaného kódu.

---

## 10. Testování a Monitoring

### QA Checklist (Uživatelské testování)
-   [ ] **Registrace**: Ověření vzniku účtu v roli GUEST a nutnost schválení.
-   [ ] **Zápis**: Pokus o zapsání do plného semináře (musí vyvolat chybu).
-   [ ] **Duplicita**: Pokus o zápis dvou seminářů do jednoho bloku.
-   [ ] **Oprávnění**: Test přístupu studenta do `/admin` (musí dojít k redirectu).

### Monitoring
-   **Vercel Speed Insights**: Sledování odezvy aplikací v reálném čase.
-   **Logování**: Sledování databázových transakcí a chybových stavů na serveru.

---

## 11. Tým a Kompetence

-   **Skupina / Tým číslo**: [DOPLNIT]
-   **Členové a kompetence**: [DOPLNIT]
-   **Celkový strávený čas**: [DOPLNIT]

---

## 12. Závěr a Zdroje

Systém "Zápis seminářů" je robustní, bezpečné a vysoce optimalizované řešení splňující nároky na moderní školní informační systém. Dokumentace pokrývá všechny aspekty od návrhu UI až po nízkoúrovňové databázové transakce.

### Zdroje
-   [Next.js documentation](https://nextjs.org/docs)
-   [Prisma ORM Guide](https://www.prisma.io/docs)
-   [NextAuth.js (Auth.js)](https://next-auth.js.org/)
-   [shadcn/ui components](https://ui.shadcn.com)
