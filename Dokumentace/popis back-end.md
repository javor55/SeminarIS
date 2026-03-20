# Technická dokumentace Back-endu - Výběr semináře

Tento dokument poskytuje hloubkový technický popis back-endové části systému **Zápis seminářů**. Je určen pro vývojáře a odborné pedagogy ke studiu architektury, datového modelu a implementačních detailů.

---

## 1. Úvod a Technický kontext

Systém je vyvinut jako moderní full-stack webová aplikace využívající framework **Next.js 14** s architekturou **App Router**. 

### Klíčové koncepty:
-   **React Server Components (RSC)**: Většina back-endové logiky pro čtení dat probíhá přímo na serveru v RSC, což eliminuje potřebu klientských `fetch` požadavků na API a zvyšuje bezpečnost i výkon. Data jsou v komponentách dostupná bleskově bez nutnosti `useEffect` na klientu.
-   **Server Actions**: Pro zápis dat (mutace) jsou využity Server Actions. Tyto asynchronní funkce běží výhradně na serveru a jsou volány přímo z klientských komponent. Next.js automaticky řeší bezpečné POST požadavky, CSRF ochranu a serializaci.
-   **Streaming & Suspense**: Data jsou do prohlížeče streamována po částech, což umožňuje okamžité zobrazení statických částí stránky, zatímco na serveru probíhají náročné databázové dotazy (např. agregace obsazenosti).
-   **TypeScript & Type Safety**: Celý projekt využívá strict mode TypeScriptu. Sdílené typy (`lib/types.ts`) zajišťují kontrakt mezi databází (Prisma), serverovou logikou a klientským UI.

---

## 2. Architektura a Struktura

Aplikace dodržuje přísné oddělení odpovědností (Separation of Concerns).

### Adresářová struktura:
-   `app/`: Routování a UI logika (Server i Client components). Obsahuje také API handlery pro specifické případy (např. NextAuth).
-   `lib/`: Jádro back-endu.
    -   `data.ts`: Centrální místo pro veškerý přístup k datům a business logiku (Server Actions).
    -   `prisma.ts`: Singleton instance Prisma Clientu zajišťující efektivní reusing databázových spojení.
    -   `auth.ts`: Konfigurace autentizačního frameworku.
    -   `utils.ts`: Sdílená business logika (např. výpočet stavu zápisu), která běží identicky na serveru i v klientském prohlížeči.
    -   `types.ts`: Centrální definice TypeScriptových rozhraní (Interfaces) zajišťující konzistenci datového kontraktu.
-   `prisma/`: Definice schématu (`schema.prisma`) a migrační skripty.
-   `middleware.ts`: Globální interceptor pro ochranu cest a zpracování požadavků na úrovni edge.

---

## 3. Datový model (Detailní popis)

Databáze PostgreSQL je modelována pro vysokou konzistenci a integritu dat.

### Model: `User`
Ukládá identitu a oprávnění uživatelů.
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `id` | `String (CUID)` | Primární klíč, unikátní i napříč prostředími. |
| `email` | `String` | Unikátní index, slouží pro login. |
| `passwordHash`| `String?` | Hash pomocí `bcryptjs`. `null` pro účty vytvořené bez hesla. |
| `role` | `Enum (Role)` | `GUEST`, `STUDENT`, `TEACHER`, `ADMIN`. |
| `isActive` | `Boolean` | Soft-kill switch pro přístup k účtu. |
| `lastLoginAt` | `DateTime?` | Aktualizováno při každém úspěšném přihlášení. |
| `cohort` | `String?` | Identifikace ročníku (např. "2023"). |

### Model: `EnrollmentWindow` (Zápisové okno)
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `status` | `Enum` | `DRAFT`, `SCHEDULED`, `OPEN`, `CLOSED`. |
| `startsAt/EndsAt` | `DateTime` | Časový rámec, kdy je zápis fyzicky možný (pokud není `DRAFT`). |
| `visibleToStudents` | `Boolean` | Ovlivňuje, zda se okno vůbec zobrazí studentům. |

### Model: `Subject` (Předmět)
Obecná definice kurzu obsahující trvalá data.
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `name` | `String` | Název předmětu. |
| `code` | `String?` | Unikátní identifikátor (např. "MAT1"). |
| `syllabus` | `String` | Formátovaný text (HTML z Tiptap editoru). |
| `isActive` | `Boolean` | Určuje, zda je předmět nabízen pro nové zápisy. |

### Model: `Block` (Zápisový blok)
Logický oddíl v rámci zápisového okna.
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `name` | `String` | Např. "Povinné semináře". |
| `order` | `Int` | Pořadí zobrazení (vynuceno unikátním indexem na úrovni okna). |
| `enrollmentWindowId` | `String` | FK vazba na Zápisové okno. |

### Model: `SubjectOccurrence` (Instance semináře)
Klíčový prvek propojující předmět s blokem a vyučujícím.
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `subjectId` | `String` | FK na obecný Předmět. |
| `blockId` | `String` | FK na konkrétní Blok. |
| `teacherId` | `String?` | Vazba na vyučujícího (`User`). |
| `capacity` | `Int?` | Maximální počet studentů. `null` = neomezeno. |
| `subCode` | `String?` | Rozlišovací kód (např. "Skupina A"). |
| `deletedAt` | `DateTime?` | Implementace **Soft Delete** pro zachování auditní stopy. |

### Model: `StudentEnrollment` (Zápis studenta)
Fyzické propojení studenta s výskytem předmětu.
| Pole | Typ | Popis |
| :--- | :--- | :--- |
| `studentId` | `String` | FK na studenta (`User.id`). |
| `subjectOccurrenceId` | `String` | FK na konkrétní instanci semináře. |

### Mechanismus Soft Delete a Audit Trail
Téměř všechny entity (Block, Occurrence, Enrollment) obsahují pole:
- `createdById`, `updatedById`, `deletedById`: Vazba na `User.id`.
- `createdAt`, `updatedAt`, `deletedAt`: Časové razítka.
Tento systém umožňuje 100% auditovatelnost změn a obnovu omylem smazaných dat.

### Databázová schémata a migrace
Systém využívá **Prisma Migrations** pro verzování schématu. Veškeré změny jsou uloženy v SQL skriptech v adresáři `prisma/migrations`, což zaručuje reprodukovatelnost databáze napříč vývojovými a produkčními prostředími.

---

## 4. Autentizace a Autorizace

Systém využívá **NextAuth.js** s bezstavovou strategií **JWT (JSON Web Tokens)**.

### Middleware (`middleware.ts`)
Ochrana cest probíhá na úrovni middleware, který se spouští před vygenerováním stránky. Tím je zaručeno, že uživatel bez platného tokenu se k chráněnému obsahu vůbec nedostane.

```typescript
export default withAuth(function middleware(req) {
  const token = req.nextauth.token;
  const pathname = req.nextUrl.pathname;

  // Granulární kontrola rolí na úrovni URL
  if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  // ... další kontroly pro /users a /subjects
});
```

### Životní cyklus sezení a Bezpečnostní nuance
Systém sází na bezstavovost (statelessness) pro maximální škálovatelnost. 
- **JWT Persistence**: Po úspěšném přihlášení je uživateli vystaven token s platností (`expiresIn`) definovanou v konfiguraci. 
- **Deaktivace účtu**: Pole `isActive` se kontroluje v momentě přihlášení (`authorize` callback). Tato metoda je zvolena pro minimalizaci zátěže databáze při každém kliknutí, přičemž kritické operace (mutace v `lib/data.ts`) provádějí dodatečné re-validace identity.

### Server Actions Guard
Každá Server Action obsahuje interní kontrolu identity, aby se zabránilo přímému volání akcí (např. přes Postman) nepovolanými uživateli.

```typescript
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") throw new Error("Nedostatečná oprávnění");
}
```

---

## 5. Implementace Business Logiky

### Sdílená logika a UI integrace
Klíčovým architektonickým prvkem je soubor `lib/utils.ts`. Funkce `computeEnrollmentStatus` je využívána:
1.  **Na serveru**: Pro rozhodování o zápisu v Server Actions.
2.  **Na klientu**: Pro dynamické obarvování UI komponent (Shadcn/UI) a zobrazení stavových štítků bez nutnosti re-fetche.

Data z back-endu jsou přímo konzumována komponentami založenými na **TanStack Table**, což umožňuje pokročilé filtrování a řazení přímo nad typovanými objekty z Prismy.

## 6. Příklady implementace Business Logiky

### Transakční zápis studenta (`lib/data.ts`)
Tato část kódu zajišťuje integritu dat při zápisu — využívá úroveň izolace `Serializable`, aby se předešlo zápisu nad rámec kapacity v důsledku souběžných požadavků (Race Conditions).

```typescript
/**
 * Provede zápis studenta na konkrétní seminář (SubjectOccurrence).
 * Využívá SERIALIZABLE transakci pro absolutní konzistenci.
 */
export async function enrollStudent(studentId: string, subjectOccurrenceId: string) {
  const user = await requireAuth(); // Ověření session přes NextAuth
  
  // Bezpečnostní kontrola: student může zapsat pouze sebe
  if (user.role === "STUDENT" && user.id !== studentId) {
    throw new Error("Neoprávněná manipulace s cizím ID");
  }

  const res = await prisma.$transaction(async (tx) => {
    // Načtení dat semináře včetně aktuálních zápisů (pro kontrolu kapacity)
    const targetOcc = await tx.subjectOccurrence.findUnique({
      where: { id: subjectOccurrenceId },
      include: {
        subject: true,
        block: { include: { enrollmentWindow: true } },
        studentEnrollments: { where: { deletedAt: null } }
      }
    });

    if (!targetOcc || targetOcc.deletedAt) throw new Error("Seminář nenalezen.");

    // 1. Validace kapacity (Server-side enforcement)
    if (targetOcc.capacity !== null && targetOcc.studentEnrollments.length >= targetOcc.capacity) {
      throw new Error("Kapacita semináře je již naplněna.");
    }

    // 2. Validace duplicity v rámci bloku
    const alreadyInBlock = await tx.studentEnrollment.findFirst({
      where: {
        studentId,
        deletedAt: null,
        subjectOccurrence: { blockId: targetOcc.blockId }
      }
    });
    if (alreadyInBlock) throw new Error("V tomto bloku již máte zapsaný jiný seminář.");

    // 3. Validace stavu okna (využití serverového času)
    const ew = targetOcc.block.enrollmentWindow;
    const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
    
    if (user.role !== "ADMIN" && computed.is !== "open") {
      throw new Error("Zápisové okno není otevřeno pro vaši roli.");
    }

    // 4. Samotný zápis
    return await tx.studentEnrollment.create({
      data: {
        studentId,
        subjectOccurrenceId,
        createdById: user.id,
      },
    });
  }, { isolationLevel: 'Serializable' });

  // Invalidační signál pro Next.js cache - zajistí okamžitý update UI u všech uživatelů
  revalidatePath("/", "layout");
  return res;
}
```

### Hromadný import uživatelů
Ukázka zpracování velkého množství dat s důrazem na výkon a ošetření chyb.

```typescript
export async function importUsers(data: Array<any>) {
  await requireAdmin(); // Pouze ADMIN může volat tuto akci
  
  let created = 0;
  let updated = 0;

  for (const row of data) {
    const email = row.email?.toLowerCase().trim();
    if (!email) continue;

    // Logic: UPSERT (Update if exists, Create if not)
    const existing = await prisma.user.findUnique({ where: { email } });
    const payload = {
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      role: (row.role as any) || "STUDENT",
      isActive: true,
    };

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: payload });
      updated++;
    } else {
      // Při vytvoření generujeme dočasné bezpečné heslo
      const dummyPassword = Math.random().toString(36);
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      await prisma.user.create({ data: { ...payload, email, passwordHash } });
      created++;
    }
  }
  revalidatePath("/users");
  return { created, updated };
}
```

### Lazy Status Synchronization
Vzhledem k tomu, že Next.js stránky mohou být staticky generovány, back-end implementuje systém "Lazy Sync". Při každém dotazu na seznam zápisů systém zkontroluje aktuální čas a pokud zjistí, že stav v databázi neodpovídá skutečnosti, okamžitě jej zaktualizuje.

```typescript
/**
 * Synchronizuje stav v DB se skutečným časem serveru.
 * Zamezuje situaci, kdy je okno v DB 'OPEN', ale čas již vypršel.
 */
async function syncEnrollmentWindowStatus(ew: EnrollmentWindow) {
  const computed = computeEnrollmentStatus(ew.status, ew.startsAt, ew.endsAt);
  let newDbStatus: string | null = null;

  // Pravidla přechodu stavů
  if (computed.is === "open" && ew.status !== "OPEN") {
    newDbStatus = "OPEN";
  } else if (computed.is === "closed" && ew.status !== "DRAFT" && ew.status !== "CLOSED") {
    newDbStatus = "CLOSED";
  }

  if (newDbStatus) {
    await prisma.enrollmentWindow.update({
      where: { id: ew.id },
      data: { status: newDbStatus },
    });
    return newDbStatus;
  }
  return ew.status;
}
```

### Ošetření chyb a Validace
Systém nepoužívá externí validační knihovny (jako Zod), ale sází na striktní manuální validaci v Server Actions a silné typování.
- **Chyby na serveru**: Jsou zachyceny v `try-catch` bloku a vyhazovány jako `new Error("Zpráva")`.
- **Zpracování na klientu**: Klientské komponenty volají akce v `startTransition` a případné chyby zobrazují uživateli pomocí knihovny `sonner` (Toast notifikace).

### Strategie Caching a Revalidace
Aby systém zajistil aktuálnost dat (např. obsazenost semináře) i při použití statického generování, využívá funkci `revalidatePath`.
- **Invalidační vzor**: Po každém úspěšném zápisu nebo odhlášení je voláno `revalidatePath("/", "layout")`. To způsobí, že Next.js označí všechny aktuálně nacachované stránky za zastaralé a při příštím požadavku je znovu vygeneruje se zapojením aktuálních dat z DB.
- **On-demand updates**: Tento přístup kombinuje výkon statických stránek s reaktivitou dynamických aplikací.

---

## 6. Bezpečnostní opatření

Back-end implementuje několik vrstev ochrany:
1.  **Bcrypt.js**: Hesla jsou saltována a hashována (cost factor 10), nikdy se neukládají v čitelné formě.
2.  **SQL Injection Protection**: Prisma automaticky parametrizuje veškeré SQL dotazy, čímž eliminuje riziko injekce.
3.  **Cross-Site Scripting (XSS)**: Next.js automaticky escapuje veškerý renderovaný obsah.
4.  **Audit Trail**: Každá entita (`Subject`, `Block`, `Occurrence`) sleduje ID uživatele, který ji vytvořil a naposledy upravil. Smazané záznamy zůstávají v DB díky `deletedAt`.
5.  **Důvěryhodný obsah (Syllabus)**: Formátovaný text sylabu je ukládán jako čisté HTML z prověřeného editoru. Rendering na front-endu probíhá v kontrolovaném `prose` kontejneru.

---

## 7. Monitoring a Provozní parametry

Aplikace je navržena pro provoz v bezserverovém (Serverless) prostředí **Vercel**.

-   **Performance Monitoring**: Vercel Speed Insights sbírá metriky o době odezvy Server Actions.
-   **Database Pooling**: Použit serverless-friendly connection management pro zamezení vyčerpání spojení při špičkách.
-   **Static Site Generation (SSG) & Incremental Static Regeneration (ISR)**: Stránky s předměty jsou generovány staticky a aktualizovány "na pozadí", což zajišťuje bleskovou odezvu i při stovkách souběžných uživatelů.

---

## 8. Plán uživatelského testování (QA)

Dokumentace slouží i jako podklad pro testery k ověření hloubkové funkčnosti:

| Test Case | Očekávaný výsledek |
| :--- | :--- |
| **Race Condition** | Dva uživatelé kliknou na poslední volné místo ve stejnou milisekundu. Back-end musí jednoho odmítnout. |
| **Role Escalation** | Student zkusí poslat POST požadavek na akci `deleteUser`. Server musí vrátit `Error 403/Unauthorized`. |
| **Time Travel** | Student zkusí zápis do okna, které je v DB `OPEN`, ale serverový čas je již po `endsAt`. Back-end musí akci zamítnout a přepnout stav okna na `CLOSED`. |
| **Integrity Check** | Pokus o smazání předmětu, který má aktivní výskyty. Systém musí buď provést kaskádové smazání, nebo (dle nastavení) akci zakázat. |

---

## 9. Technické výzvy a jejich řešení

Při návrhu back-endu byly vyřešeny následující netriviální problémy:
1.  **Dramaticky proměnlivý stav okna**: Vyřešeno pomocí *Lazy Status Synchronization*, která eliminuje potřebu cron-jobů nebo externích triggerů.
2.  **Ochrana proti přeplnění**: Vyřešeno pomocí databázových transakcí na úrovni `Serializable`, což je nejpřísnější úroveň izolace v SQL, zaručující korektní výsledky i při masivním souběhu studentů.
3.  **Bezstavová autorizace**: Kombinace JWT v HttpOnly cookies a middleware zajišťuje vysokou bezpečnost bez zatěžování serveru správou session objektů v paměti.

## 10. Závěrečné shrnutí a Zdroje

Z pohledu technické kvality projekt demonstruje pokročilé využití moderních webových standardů. Odpovídá nárokům na robustní školní informační systém s důrazem na integritu dat a bezpečnost.

### Použité zdroje:
-   [Next.js documentation (App Router)](https://nextjs.org/docs)
-   [Prisma ORM documentation](https://www.prisma.io/docs)
-   [NextAuth.js (Auth.js) docs](https://next-auth.js.org/)
-   [PostgreSQL Transaction Isolation Levels](https://www.postgresql.org/docs/current/transaction-iso.html)
