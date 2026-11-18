# Plán: modul Události – tickety k postupné implementaci

Zadání a rozhodnutí: `Dokumentace/zadani/2026-11-udalosti-registrace.md` (sekce 14 má přednost).
Každý ticket je **samostatný PR**, který se mergne do `main` dřív, než začne další. Tickety jsou
psané tak, aby je zvládl i levnější model: obsahují přesné soubory, kroky a kritéria hotovo.

## Jak pokračovat po přerušení
1. V tabulce Stav najdi první ticket, který není `[x]`.
2. Zkontroluj větev `claude/adoring-turing-j6cece` a otevřené PR. Pokud má ticket rozpracované
   commity nebo PR, dokonči je. Jinak větev srovnej s `origin/main`.
3. Předej ticket agentovi: celé znění ticketu + „Společná pravidla“ níže. Výsledek zkontroluj,
   pushni, vytvoř PR, počkej na zelené CI, mergni.
4. V tabulce ticket označ `[x]` s číslem PR.

## Stav
Vlna A – základ (bez veřejné části):
- [x] U1 Bezpečné HTML a stránka „Zpracování osobních údajů“ (PR #22)
- [x] U2 Datový model a kostra modulu `events` (PR #22)
- [x] U3 Seznam událostí a základní nastavení události (PR #23)
- [x] U4 Obrázky (nahrání, ořez, uložení v DB) a popis v editoru (PR #23)

Vlna B – termíny a formulář:
- [x] U5 Termíny (položky), generátor, pravidla registrace (PR #24)
- [x] U6 Formulář účastníka (pevná a vlastní pole) (PR #24)

Vlna C – veřejná registrace:
- [x] U7 Veřejná stránka události (zobrazení, bez odeslání) (PR #25)
- [x] U8 Ochrana proti robotům (proof-of-work, honeypot, limity) (PR #25)
- [x] U9 Odeslání registrace, potvrzení na obrazovce a e-mailem (PR #26)

Vlna D – po registraci:
- [x] U10 Správa registrace účastníkem (odkaz, kód + e-mail, změna, zrušení, `.ics`) (PR #27)
- [x] U11 Nástroje organizátora (seznam, ruční úpravy, odebrání, přesun, export, QR odkazu) (PR #28)
- [x] U12 E-maily modulu v Upozorněních, statistika odeslaných e-mailů, hromadný e-mail

Vlna E – provoz a doplňky:
- [x] U13 Denní úlohy (připomínka, smazání údajů po 90 dnech), přehled, úkoly, ukázková data (PR #29)
- [ ] U14 Čekací listina, prezence (i s QR), duplikace události

Velikost: U1, U2, U8 a U13 jsou malé až střední, ostatní střední. Jedna session zvládne
zhruba 1–2 tickety včetně E2E.

---

## Společná pravidla (platí pro každý ticket)
- **Repo:** `/home/user/SeminarIS`, větev `claude/adoring-turing-j6cece`. Nepushuj a nedělej PR,
  to udělá koordinátor. Commit zprávy česky, zakončené řádky `Co-Authored-By` a `Claude-Session`
  podle zadání koordinátora. `tsconfig.tsbuildinfo` nikdy necommituj.
- **Před začátkem si přečti:**
  - `Dokumentace/architektura-moduly.md` (moduly, body rozšíření, konvence, sekce Mobil a F12–F15),
  - zadání `2026-11-udalosti-registrace.md`,
  - jako vzor modul `modules/makeup`: `manifest.ts`, `server.tsx`, `actions/*`, `components/*`,
    `notifications.ts`, `demo-data.ts`.
- **Konvence:**
  - serverové akce přes `safeAction` / `unwrap` (`lib/safe-action.ts`),
  - oprávnění `requirePermission` / `can`, stránky `requirePagePermission`,
  - každá změna dat zapisuje `audit(tx, user, …)` (`lib/audit.ts`) ve stejné transakci,
  - režim „zobrazit jako“ je jen pro čtení (`assertNotImpersonating`),
  - data a časy přes `lib/datetime.ts`, jména přes `formatName` (`lib/names.ts`), skloňování `lib/plural.ts`,
  - UI komponenty z `components/ui` (Button, Badge, Card, Checkbox, Chip, NativeSelect,
    `mobile-card.tsx`, `meter.tsx`, `stat-tile.tsx`), `PageHeader`, sémantické barvy,
    žádné `alert` / `confirm`,
  - všechny texty česky.
- **Hranice modulu:** jádro (`modules/core`, `lib`, `app` mimo `app/akce` a stránky modulu)
  neimportuje z `modules/events`. Napojení jde jen přes body rozšíření v `modules/server-types.ts`
  a `modules/core/extensions.ts`. Kontrolu dělá `npm run lint` a `npm run test:contract`.
- **Migrace:** nejvýš jedna na ticket. Musí se dát aplikovat na prázdnou DB i na DB s daty.
  Vytvoř ji přes `npx prisma migrate dev --name <nazev>` proti lokální DB.
- **Nic stávajícího nesmí zmizet.** Stávající E2E se upravují, nemažou.
- **Testy:** každý ticket přidá vlastní E2E soubor `e2e/3x-events-*.spec.ts` a stránky přidá
  do `e2e/24-layout.spec.ts` (390×844 i 1280×800). Nejdřív pouštěj jen dotčené soubory,
  celou sadu jednou na konci.
- **Lokální DB:** Postgres cluster 16/main, DB `seminaris_test`. Stav ověř `pg_lsclusters`,
  případně ho spusť. E2E pouštěj s proměnnými jako v `.github/workflows` (včetně `EMAIL_FROM`).
  Server zabíjej `pkill -f "[n]ext-server"`; `pkill -f "next start"` zabije vlastní shell.
- **Hotovo =** `npx tsc --noEmit`, `npm run lint`, `npm run test:contract`, `npm run build`
  a celé `npx playwright test` projdou. Ticket je v tomto souboru označený `[x]`
  a dokumentace je aktualizovaná. Na konci vrať krátký report: soubory, výsledky kontrol,
  co zůstalo.

---

## U1 Bezpečné HTML a stránka „Zpracování osobních údajů“
**Cíl:** připravit dvě věci, které veřejná část potřebuje. Je to malý ticket a nesahá na modul events.

**Udělej:**
1. Přidej závislost `sanitize-html` (+ `@types/sanitize-html`). Vytvoř `lib/html.ts` s funkcí
   `sanitizeRichHtml(html: string): string`:
   - whitelist tagů: `p, br, strong, b, em, i, u, s, h2, h3, h4, ul, ol, li, blockquote, a, img, hr, span`;
   - atributy: `a[href|target|rel]`, `img[src|alt|width|height]`;
   - `href` jen `http`, `https`, `mailto`, `tel`;
   - `img src` jen relativní cesty začínající `/api/` nebo `https:`;
   - u všech odkazů vynutit `rel="noopener noreferrer"`.
2. Použij ji u sylabu předmětů. Při uložení: najdi v `modules/core/actions` místo, kde se ukládá
   `syllabus`. Při zobrazení: `modules/core/components/subjects/SubjectOverviewTab.tsx`, kde je
   `dangerouslySetInnerHTML`.
3. Unit test bez DB: `scripts/html-test.ts` se spustí přes `node --experimental-strip-types`,
   stejně jako `scripts/contract-test.ts`. Přidej npm skript `test:html` a zařaď ho do CI vedle
   `test:contract`. Ověří, že se odstraní `<script>`, `onerror=`, `javascript:` odkazy a `<iframe>`.
4. Nastavení a stránka:
   - V `modules/core/manifest.ts` přidej nastavení `privacy.text` (dlouhý text, výchozí obecná
     šablona s doplňovacími místy [NÁZEV ŠKOLY], [KONTAKT NA POVĚŘENCE]) a `privacy.controller`
     (název správce).
   - Veřejná stránka `app/ochrana-udaju/page.tsx` je dostupná bez přihlášení. Do `matcher`
     v `middleware.ts` přidej výjimku pro `ochrana-udaju`. Stránka zobrazí text nastavení
     a výčet cookies: jen nezbytné (přihlášení, „zobrazit jako“), Vercel Analytics je bez cookies.
   - Odkaz na stránku dej na přihlašovací a registrační stránku.
5. **Nedělej:** cookie lištu (podle rozhodnutí není potřeba).

**Hotovo když:** sylabus s `<script>` se uloží bez skriptu, `/ochrana-udaju` se otevře
bez přihlášení a `test:html` prochází v CI.

## U2 Datový model a kostra modulu `events`
**Cíl:** schéma a prázdný modul, který jde zapnout a vypnout. Zatím bez UI funkcí.

**Udělej:**
1. Do `prisma/schema.prisma` přidej:
   - `enum EventStatus { DRAFT PUBLISHED CLOSED ARCHIVED }`
   - `enum EventVisibility { PUBLIC USERS }`
   - `enum EventConfirmChannel { EMAIL_AND_SCREEN SCREEN_ONLY EMAIL_ONLY }`
   - `enum EventFieldType { TEXT TEXTAREA SELECT CHECKBOX }`
   - `enum EventFieldMode { REQUIRED OPTIONAL HIDDEN }`
   - `enum EventRegistrationStatus { PENDING CONFIRMED CANCELLED WAITLIST }`
   - `model Event`:
     - `id`, `slug @unique`, `title`, `subtitle?`, `place?`, `contact?`,
     - `descriptionHtml @default("")`, `imageId?`, `imageAlt?`,
     - `status @default(DRAFT)`, `visibility @default(PUBLIC)`,
     - `registrationOpensAt?`, `registrationClosesAt?`,
     - `maxItemsPerRegistration Int @default(1)`, `allowGuests Boolean @default(false)`,
       `maxGuests Int @default(0)`,
     - `changeDeadlineMinutes Int @default(1440)`, `maxRegistrationsPerEmail Int @default(1)`,
     - `confirmChannel @default(EMAIL_AND_SCREEN)`,
     - `confirmationText?`, `consentText?`,
     - `createdById`, `createdAt`, `updatedAt`, `archivedAt?`, `purgedAt?`.
   - `model EventOrganizer`: `eventId`, `userId`, `@@id([eventId, userId])`.
   - `model EventAudience`: stejný tvar jako `EnrollmentWindowAudience` (GRADE / CLASS / USER /
     EXCLUDE_USER), jen pro `visibility = USERS`.
   - `model EventImage`: `id`, `data Bytes`, `mime`, `width`, `height`, `size`, `createdById`, `createdAt`.
   - `model EventItem`: `id`, `eventId`, `label?`, `startsAt?`, `endsAt?`, `capacity Int?`
     (null = bez omezení), `note?`, `order Int`, `cancelledAt?`.
   - `model EventField`: `id`, `eventId`, `key` (pevná pole: `name`, `phone`, `guests`, `note`,
     `school`, `grade`; vlastní pole: `custom_<n>`), `type`, `label`, `mode`, `options String[]`,
     `order`, `builtin Boolean`.
   - `model EventRegistration`:
     - `id`, `eventId`, `email`, `name?`, `guests Int @default(0)`, `answers Json`,
     - `status`, `tokenHash @unique`, `code` (`@@unique([eventId, code])`),
     - `consentAt`, `userId?`, `attendedAt?`,
     - `createdAt`, `updatedAt`, `cancelledAt?`,
     - `@@index([eventId, email])`.
   - `model EventRegistrationItem`: `registrationId`, `itemId`, `@@id([registrationId, itemId])`,
     `@@index([itemId])`.
   - `model EventRateLimit`: `key`, `windowStart`, `count`, `@@id([key, windowStart])`.
   - Relace s `onDelete: Cascade` tam, kde dávají smysl (položky, pole a registrace patří události).
2. Migrace `events_init`.
3. Modul `modules/events`:
   - `manifest.ts` podle vzoru makeup:
     - `id: "events"`, název „Události“,
     - oprávnění `events.view` [TEACHER, ADMIN], `events.manage.own` [TEACHER, ADMIN],
       `events.manage.all` [ADMIN],
     - navigace „Události“ → `/events` (oprávnění `events.view`),
     - sekce administrace „Události“ → `/events/settings` (`group: "modules"`).
   - `server.tsx`: prázdná implementace `ModuleServer`.
   - Registrace v `modules/registry.ts` a `modules/server-registry.ts`.
4. Stránka `app/events/page.tsx`: `PageHeader` „Události“ a prázdný stav „Zatím žádné události“.
5. Pomocník `modules/events/access.ts`: `canManageEvent(user, event)` vrátí true pro
   `events.manage.all`, pro autora a pro spoluorganizátora. Bude se používat v dalších ticketech.

**Hotovo když:** migrace projde na prázdné DB, modul jde vypnout v Administrace → Moduly,
učitel i admin vidí položku Události a student ne. E2E ověří viditelnost navigace podle role.

## U3 Seznam událostí a základní nastavení události
**Cíl:** organizátor založí a upraví událost (bez obrázku, termínů a formuláře).

**Udělej:**
1. `modules/events/actions/events.ts`: `createEvent`, `updateEvent`, `setEventStatus`,
   `deleteEvent` (jen DRAFT bez registrací), `setOrganizers`. Každá akce kontroluje
   `canManageEvent` a zapisuje audit.
   - Slug: z názvu bez diakritiky a mezer, malými písmeny. Musí být unikátní; při kolizi
     přidej `-2`, `-3`. Volba „náhodný odkaz“ vygeneruje 10 znaků z `[a-z0-9]`.
2. `/events`: seznam karet událostí (na mobilu `MobileCard`). Každá karta ukazuje:
   - název, pilulku stavu (Koncept / Zveřejněno / Registrace uzavřena / Archiv),
   - období registrace, počet registrací (zatím 0),
   - tlačítka Upravit a Kopírovat odkaz.
   Učitel vidí jen svoje a ty, kde je spoluorganizátor; admin vidí všechny. Filtr podle stavu.
3. `/events/new` a `/events/[id]`: detail se záložkami Nastavení / Termíny / Formulář /
   Registrace. Termíny, Formulář a Registrace zatím jen jako zástupný text.
4. Záložka Nastavení obsahuje:
   - název, podtitulek, místo, kontakt, odkaz (slug, přepínač náhodný odkaz),
   - období registrace,
   - viditelnost; publikum pro USERS převezmi z komponenty publika u zápisových oken,
   - pravidla (max. termínů na registraci, doprovod a max. počet osob, uzávěrka změn
     pro účastníka, max. registrací na e-mail),
   - potvrzení registrace (`confirmChannel`, 3 volby s vysvětlením),
   - text potvrzení, text souhlasu,
   - spoluorganizátoři (výběr učitelů).
5. Stav události: tlačítka Zveřejnit / Uzavřít registraci / Archivovat / Vrátit do konceptu.
   Pilulka stavu je jako u zápisových oken.

**Hotovo když:** učitel založí událost, uloží nastavení, zveřejní ji a admin ji vidí.
Učitel B cizí událost nevidí, dokud není spoluorganizátor. E2E: založení, úprava, oprávnění,
kolize slugu.

## U4 Obrázky (nahrání, ořez, uložení v DB) a popis v editoru
**Cíl:** příjemné nahrávání titulního obrázku a rich text popis.

**Udělej:**
1. Komponenta `components/ui/image-upload.tsx` (obecná, bez závislosti na events):
   - přetažení souboru nebo výběr, náhled;
   - ořez 16:9 tažením a zoomem; použij malou knihovnu `react-easy-crop`;
   - zmenšení v prohlížeči přes `canvas` na max. 1600 px šířky, export `image/webp`,
     kvalita 0.82; když je soubor větší než 400 kB, zkus kvalitu 0.7;
   - pole pro alternativní text;
   - stavy nahrávání a chyby česky („Soubor není obrázek“, „Obrázek je příliš velký“, max. 10 MB vstup).
2. Route `app/api/events/images/route.ts` (POST):
   - jen pro přihlášené s `events.manage.own`;
   - kontrola typu (`image/webp`, `image/jpeg`, `image/png`) a velikosti (≤ 600 kB po zmenšení);
   - uloží do `EventImage`.
   Route `app/api/events/images/[id]/route.ts` (GET):
   - veřejná (přidat výjimku do `middleware`);
   - hlavičky `Cache-Control: public, max-age=31536000, immutable` a `Content-Type`.
3. V Nastavení události přibude sekce „Titulní obrázek“ (upload + alt text) a „Popis“
   (`components/editor/TiptapEditor.tsx`). Do editoru přidej vkládání obrázku přes stejnou
   upload route, bez ořezu, jen se zmenšením. HTML při uložení prožeň `sanitizeRichHtml` z U1.
4. Smazání: obrázek, na který už nic neodkazuje, smaže denní úloha (U13). Tady jen zapiš TODO
   do plánu.

**Hotovo když:** organizátor nahraje fotku z telefonu (velkou JPEG), ořízne ji a ta se uloží
jako WebP do 600 kB. Popis s obrázkem a odkazem se uloží a `<script>` se odfiltruje.
E2E nahraje testovací obrázek z `e2e/fixtures/`.

## U5 Termíny (položky), generátor, pravidla registrace
**Cíl:** záložka Termíny.

**Udělej:**
1. Akce `modules/events/actions/items.ts`:
   - `createItem`, `updateItem`, `cancelItem`, `restoreItem`, `deleteItem` (jen bez registrací),
     `reorderItems`;
   - `generateItems({ date, from, to, stepMinutes, durationMinutes, capacity })` vytvoří řadu
     termínů a odmítne více než 100 najednou.
2. UI záložky Termíny:
   - seznam seskupený po dnech;
   - položky bez času jsou ve skupině „Bez času“;
   - u každé položky čas nebo název, kapacita, poznámka, obsazenost (`meter.tsx`, zatím 0)
     a akce Upravit / Zrušit / Smazat;
   - tlačítka „Přidat termín“ a „Vygenerovat řadu“ (dialog s náhledem, kolik termínů vznikne);
   - na mobilu karty.
3. Popisek položky: když má čas, zobrazí se „po 12. 1. 9:00–9:30“; jinak `label`.
   Funkce `itemLabel(item)` v `modules/events/format.ts` (použije se i ve veřejné části).

**Hotovo když:** generátor 9:00–12:00 po 30 min vytvoří 6 termínů s kapacitou 20, jde je
upravit a zrušit. E2E pokryje generátor, úpravu i zrušení.

## U6 Formulář účastníka (pevná a vlastní pole)
**Cíl:** záložka Formulář.

**Udělej:**
1. Při vytvoření události (doplň do `createEvent` z U3) založ pevná pole s výchozím režimem:
   - `name` (Jméno a příjmení) REQUIRED,
   - `phone` OPTIONAL,
   - `note` (Poznámka) OPTIONAL,
   - `school` (Současná škola) HIDDEN,
   - `grade` (Ročník) HIDDEN,
   - `guests` (Počet osob) se řídí `allowGuests`.

   E-mail **není** v `EventField`. Je vždy povinný a vždy první ve formuláři.
2. Záložka Formulář:
   - u pevných polí přepínač Povinné / Volitelné / Skryté;
   - vlastní pole: přidat (typ, popisek, u výběru možnosti), upravit, smazat, posunout nahoru a dolů;
   - vpravo nebo dole živý náhled formuláře;
   - pole souhlasu je vždy poslední a nejde ho skrýt; text je z nastavení a obsahuje odkaz
     na `/ochrana-udaju`.
3. Validace odpovědí `modules/events/form.ts`: čistá funkce `validateAnswers(fields, input)`,
   která vrátí `{ ok, errors }`. Hlídá povinná pole, formát e-mailu, délky (text 200,
   dlouhý text 2000) a možnosti výběru. Napiš pro ni test do `scripts/events-form-test.ts`
   a npm skript `test:events`, přidaný do CI.

**Hotovo když:** náhled odpovídá nastavení a `test:events` prochází v CI.

## U7 Veřejná stránka události (zobrazení, bez odeslání)
**Cíl:** `/akce/[slug]` vypadá hotově, jen tlačítko Registrovat zatím nic neodešle.

**Udělej:**
1. Stránky `app/akce/[slug]/page.tsx` a `layout.tsx`:
   - vlastní jednoduchý layout bez navigace aplikace: název školy nahoře, patička s odkazem
     na `/ochrana-udaju`;
   - `metadata.robots = { index: false }`;
   - Open Graph obsahuje název, podtitulek a obrázek;
   - výjimka `akce` v `middleware`.
2. Obsah stránky:
   - titulní obrázek (16:9, `alt`), název, podtitulek, místo, kontakt;
   - popis (`sanitizeRichHtml` i při zobrazení);
   - blok registrace podle stavu:
     - DRAFT: jen organizátor s náhledem `?nahled=1` a pruhem „Náhled – událost není zveřejněná“;
     - před otevřením: „Registrace se otevře …“;
     - uzavřeno nebo po termínu: „Registrace skončila“;
     - otevřeno: výběr termínů a formulář.
3. **Výběr termínů:**
   - seznam po dnech, řádek s časem vlevo a volnými místy a tlačítkem Vybrat vpravo
     (stejný kompaktní styl jako zápis studenta, F14);
   - plné termíny jsou zašedlé dole;
   - když jde vybrat víc termínů, místo tlačítek zaškrtávátka;
   - volná místa se počítají včetně doprovodu.
4. Formulář vykreslí pole podle `EventField` a e-mail nahoře. Validace na klientu použije
   `validateAnswers` z U6.
5. **Viditelnost USERS:** nepřihlášený uvidí „Registrace je jen pro přihlášené“ a tlačítko
   Přihlásit (s návratem zpět). Přihlášenému mimo publikum se zobrazí „Tato událost pro vás
   není určena“. Přihlášenému se předvyplní jméno a e-mail.
   - **Role (rozhodnutí majitele):** událost `USERS` může být pro libovolné role. `Event.audienceRoles Role[]`
     (výchozí `[STUDENT]`, migrace `events_audience_roles`); v Nastavení zaškrtávátka Studenti / Učitelé /
     Administrátoři. Výběr ročníků, tříd a jmenovitě (vynechaní) se ukáže jen při zaškrtnutých Studentech
     a zužuje jen studenty; učitelé a admini, jsou-li zaškrtnutí, smějí vždy. Host (neschválený účet) nikdy.
     Rozhoduje čistá funkce `canUserRegister` (`modules/events/audience-roles.ts`, test v `test:events`);
     stejnou použije serverová akce v U9.

**Hotovo když:** stránka funguje bez přihlášení na telefonu i počítači a nepřetéká. Na stavy
DRAFT / před otevřením / otevřeno / uzavřeno a viditelnost USERS je E2E.

## U8 Ochrana proti robotům (proof-of-work, honeypot, limity)
**Cíl:** vlastní ochrana bez externí služby, připravená pro U9.

**Udělej:**
1. `lib/antibot.ts` (obecné, může ho později použít i registrace účtů):
   - `createChallenge()` vrátí `{ algorithm: "SHA-256", salt, challenge, maxnumber, signature, expiresAt }`.
     Postup je kompatibilní s ALTCHA:
     - `challenge = sha256(salt + secretNumber)`, kde `secretNumber` je náhodné číslo v rozsahu
       `0..maxnumber` a `maxnumber` je 100 000;
     - `signature = HMAC-SHA256(challenge, key)`;
     - klíč se vygeneruje při prvním použití (`crypto.randomBytes(32)`) a uloží do `SystemSetting`
       `antibot.key`;
     - platnost výzvy je 10 minut.
   - `verifySolution(payload)` ověří podpis, expiraci a `sha256(salt + number) === challenge`.
     Zároveň výzvu jednorázově spotřebuje: uloží hash do `EventRateLimit` s klíčem `pow:<hash>`,
     takže stejné řešení nejde použít dvakrát.
   - `checkRateLimit(key, limit, windowSeconds)` nad `EventRateLimit` (upsert a inkrement,
     staré záznamy maže U13).
2. Route `app/api/antibot/challenge/route.ts` (GET, veřejná) vrací výzvu.
3. Klientská komponenta `components/antibot-field.tsx`:
   - po zobrazení formuláře stáhne výzvu a ve **Web Workeru** hledá `number`
     (`crypto.subtle.digest`);
   - výsledek uloží do skrytého pole;
   - ukazuje malý stav „Ověřuji, že nejste robot…“ a pak „✓ Ověřeno“;
   - tlačítko odeslání je do té doby neaktivní (běžně trvá do 1–2 s).
4. **Honeypot:** skryté pole `website` (CSS mimo obrazovku, `tabIndex=-1`, `autocomplete=off`).
   Když je vyplněné, server vrátí falešný úspěch, ale nic neuloží.
5. **Minimální doba:** formulář nese podepsaný čas zobrazení. Odeslání dřív než za 3 s se odmítne.
6. **Testovací režim:** při `ANTIBOT_TEST_MODE=1` (jen E2E a CI) přijme server řešení `"test"`.
   Do `.github/workflows` a E2E konfigurace přidej proměnnou.
7. Skript `scripts/antibot-test.ts` ověří správné řešení, špatné řešení, prošlou výzvu
   a opakované použití. Zařaď ho do `test:events`.

**Hotovo když:** testy prochází a výzva se v prohlížeči vyřeší pod 2 s
(ověř Playwrightem bez test módu).

## U9 Odeslání registrace, potvrzení na obrazovce a e-mailem
**Poznámky z U7/U8 (pro U9):** (a) odeslání volá `checkSubmission` z `lib/antibot.ts` (`solution` = pole `altcha`,
`honeypot` = pole `website`, `renderToken` = pole `renderToken`; výsledek `honeypot` = falešný úspěch bez zápisu); (b) kontrola
„smí se registrovat“ = `canUserRegister` (`modules/events/audience-roles.ts`) + `loadStudentAudienceInfo` (`public-data.ts`);
(c) obsazenost včetně doprovodu: `loadTakenByItem` (uvnitř transakce počítej znovu); (d) `PublicRegistration` po validaci jen
zobrazí `submit-pending`, tam napoj odeslání; (e) limity: `checkRateLimit(key, limit, windowSeconds, tx)`.
**Poznámky z U6 (zapracovat):** (a) ověř povinný souhlas na serveru (`validateAnswers` ho zatím
nekontroluje); (b) pevné pole „Jméno“ může být skryté – registrace i přehledy musí fungovat bez jména
(zobrazit e-mail); (c) klíč vlastního pole `custom_<n>` se po smazání může znovu použít – jakmile má pole
odpovědi, mazání zakaž (nabídni „skrýt“), aby se staré odpovědi nepřiřadily novému poli.
**Cíl:** funkční registrace.

**Udělej:**
1. Veřejná serverová akce `modules/events/actions/public.ts` → `registerForEvent(slug, input)`.
   Bez `requirePermission`; viditelnost USERS kontroluje session. Postup:
   1. ověř antibot (U8), honeypot a minimální dobu;
   2. rate limit: IP (z hlavičky `x-forwarded-for`, uložená jen jako SHA-256 hash) max. 10 registrací
      za hodinu, e-mail podle `maxRegistrationsPerEmail`;
   3. `validateAnswers` (U6);
   4. v serializable transakci (vzor `serializable()` z `modules/seminars/actions/enrollment.ts`)
      zkontroluj stav a období, počet vybraných položek, kapacitu (součet `1 + guests` potvrzených
      registrací na položce) a zrušené položky;
   5. vytvoř `EventRegistration` (CONFIRMED):
      - `token`: 32 bajtů, base64url; ukládá se jen `tokenHash` (SHA-256);
      - `code`: 7 znaků z abecedy bez záměnných znaků (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
        ve tvaru `XXX-XXXX`, unikátní v rámci události;
      - `consentAt = now`;
   6. audit (aktér „veřejnost“; doplň do `lib/audit.ts` podporu aktéra bez účtu, pokud chybí).
2. Stránka po registraci `/akce/[slug]/hotovo?t=<token>` (token je jen v URL, nikde se neukládá):
   - souhrn (termíny, údaje), **odkaz na správu** a **kód**;
   - tlačítka Zkopírovat odkaz, Stáhnout potvrzení (`.txt` s odkazem, kódem a termíny)
     a Přidat do kalendáře (`.ics`; vygeneruje ho funkce z U10, tady jen odkaz);
   - u `SCREEN_ONLY` výrazné upozornění „Uložte si odkaz nebo kód – e-mailem nepřijde“.
3. **E-mail:**
   - nová událost `events.registration.confirmed` v `lib/email/events.ts` (`module: "events"`;
     rozšiř typ `module`);
   - proměnné: jméno, název akce, termíny, odkaz, kód, místo;
   - odešle se podle `confirmChannel` přes stávající odesílání s limity;
   - když se e-mail neodešle (limit nebo chyba), registrace zůstane platná a stránka „hotovo“
     ukáže odkaz a kód (při `EMAIL_ONLY` taky); organizátor uvidí varování v detailu události.

**Hotovo když:** E2E pokryje úspěšnou registraci (e-mail v `EmailLog` při `EMAIL_TRANSPORT=log`),
plný termín, druhou registraci stejného e-mailu nad limit, honeypot, `SCREEN_ONLY`
(žádný e-mail, kód na obrazovce) a souběh dvou registrací na poslední místo (jedna projde).

## U10 Správa registrace účastníkem
**Cíl:** účastník si registraci najde, změní nebo zruší.

**Udělej:**
1. `/akce/[slug]/r/[token]`:
   - najde registraci podle `sha256(token)`;
   - ukáže souhrn s akcemi Změnit termín, Upravit údaje a Zrušit registraci;
   - akce jsou do `changeDeadlineMinutes` před začátkem prvního vybraného termínu, potom
     jen informace „Změny už nejsou možné, kontaktujte …“;
   - změna termínu probíhá v jedné transakci s kontrolou kapacity (vzor `switchEnrollment`).
2. Na stránce akce bude „Už jste registrovaní?“ s formulářem kód + e-mail:
   - rate limit 5 pokusů za 15 min na IP;
   - při shodě přesměruje na správu, a to přes **nový token** (starý se zneplatní; odkaz
     z e-mailu tím přestane platit, upozorni na to);
   - při neshodě obecná hláška bez rozlišení, co bylo špatně.
3. `modules/events/ics.ts`: `buildIcs(event, items)` (VCALENDAR / VEVENT, časová zóna
   Europe/Prague, UID podle id). Route `/akce/[slug]/r/[token]/kalendar.ics`.
4. E-mail `events.registration.changed` (změna nebo zrušení účastníkem) přes stávající
   systém a limity; jde vypnout.

**Hotovo když:** E2E pokryje změnu termínu, zrušení, uzávěrku, nalezení přes kód + e-mail,
špatný kód a stažení `.ics`.

## U11 Nástroje organizátora
**Cíl:** záložka Registrace a obsazenost.

**Udělej:**
1. Záložka Registrace:
   - souhrn (registrací, osob celkem, volných míst) a obsazenost termínů (`meter.tsx`);
   - tabulka (na mobilu karty): jméno, e-mail, telefon, termíny, osoby, poznámka, vytvořeno, stav;
   - hledání a filtr podle termínu.
2. Akce organizátora (bez uzávěrek, organizátor smí vždy):
   - Přidat registraci ručně (bez antibotu);
   - Upravit údaje;
   - **Přesunout** na jiný termín (s kontrolou kapacity a možností „přesto přesunout nad kapacitu“);
   - **Odebrat z termínu** nebo zrušit celou registraci.

   Každá akce má volbu „Poslat účastníkovi e-mail“ (výchozí zapnuto), e-maily
   `events.registration.moved` / `events.registration.removed`. Vše se zapisuje do auditu.
3. Export CSV (`lib/csv.ts`): všechna pole včetně vlastních.
4. Kopírování odkazu a **QR kód odkazu** ke stažení (PNG a SVG). Použij knihovnu `qrcode`
   a generuj na serveru.
5. Varování v detailu, když některý potvrzovací e-mail neodešel (z `EmailLog`).

**Hotovo když:** E2E pokryje ruční přidání, přesun (i nad kapacitu), odebrání, export
a oprávnění (cizí učitel nemá přístup).

## U12 E-maily modulu v Upozorněních, statistika, hromadný e-mail
**Cíl:** přehled a ovládání e-mailů. E-maily se nerozšiřují, jen se dají řídit.

**Udělej:**
1. V `/admin/notifications` jsou u každé e-mailové události:
   - přepínač zapnuto/vypnuto (už existuje),
   - **počet odeslaných za posledních 30 dní** a dnes (z `EmailLog`),
   - u modulu events skupina „Události“.
2. Nahoře na stránce je přehled čerpání denního a měsíčního limitu (pruh) s odhadem
   na nejbližší dny z `getEmailEstimates`. Modul events dodá odhad: počet registrací
   s termínem v příštích dnech, pokud bude zapnutá připomínka.
3. Hromadný e-mail z detailu události (všem / jednomu termínu) přes existující „manual.bulk“
   mechanismus. Před odesláním ukáže počet příjemců a zbývající limit. Když by limit nestačil,
   nabídne odeslat jen části nebo zrušit.

**Hotovo když:** statistika sedí s `EmailLog` v E2E. Vypnutý typ e-mailu se neodešle
a registrace přesto projde (kód je na obrazovce).

## U13 Denní úlohy, přehled, úkoly, ukázková data
**Udělej:**
1. `runDailyJob` modulu events:
   - připomínka den předem: e-mail `events.reminder`, ve výchozím stavu vypnutý;
   - **smazání osobních údajů 90 dní po konci akce** (konec posledního termínu nebo
     `registrationClosesAt`): u registrací vymaž `email`, `name`, `answers`, `phone` a nastav
     `purgedAt` na událost; počty zůstanou; zapiš audit;
   - úklid `EventRateLimit` starších než 2 dny;
   - smazání nepoužitých `EventImage` (starších než 1 den, na které neodkazuje událost ani popis).
     TODO z U4: obrázek se nahrává hned při výběru, takže po výměně nebo odebrání zůstává sirotek.
     Odkaz z popisu se hledá jako text `/api/events/images/<id>` v `Event.descriptionHtml`.
2. Karta na přehledu (`getDashboardCards`): moje nadcházející události s obsazeností.
   Úkol (`getAdminTodos`): událost začíná do 3 dnů a má neodeslané potvrzovací e-maily.
3. Ukázková data (`demoData.seed/clear`): událost „Den otevřených dveří“ s obrázkem
   (malý vložený WebP), 8 termíny, formulářem a 25 registracemi.
4. V `/events/settings` (admin) jde nastavit lhůtu pro smazání údajů (výchozí 90) a výchozí
   texty souhlasu a potvrzení.

**Hotovo když:** E2E přes `/api/cron/daily` s posunutým časem (vzor `e2e/09-cron.spec.ts`)
ověří smazání údajů a připomínku.

## U14 Čekací listina, prezence, duplikace
**Udělej:**
1. Čekací listina:
   - v nastavení události přepínač „Povolit čekací listinu“;
   - plný termín nabídne „Zapsat na čekací listinu“ (stav WAITLIST);
   - po uvolnění místa se v transakci posune nejstarší čekající, který se vejde
     (včetně doprovodu), a dostane e-mail `events.waitlist.promoted`.
2. Prezence:
   - v detailu termínu seznam se zaškrtáváním „Přišel/a“ (`attendedAt`), velké řádky pro telefon;
   - volitelně QR kód v potvrzení (obsahuje odkaz na správu); organizátor ho načte telefonem
     a stránka správy mu nabídne „Označit příchod“ (jen pro `canManageEvent`).
3. Duplikovat událost: zkopíruje nastavení, formulář a termíny posunuté o zvolený počet dní,
   bez registrací, ve stavu DRAFT, s novým slugem.

**Hotovo když:** E2E pokryje posun z čekací listiny po zrušení, prezenci a duplikaci.
