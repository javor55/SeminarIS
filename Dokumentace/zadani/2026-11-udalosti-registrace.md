# Zadání: modul Události (registrace na akce pro veřejnost)

Stav: **odsouhlaseno** (rozhodnutí v sekci 14). Plán implementace po ticketech je v
`Dokumentace/zadani/2026-11-udalosti-plan.md`.

## 1. Cíl
Škola občas pořádá akce pro veřejnost, například den otevřených dveří, informační schůzku pro
uchazeče, workshop nebo přednášku. Cílem je univerzální nástroj na registraci na tyto akce:

- učitel nebo admin akci připraví a nastaví,
- pošle **unikátní odkaz**,
- účastník se přes odkaz zaregistruje, například na časový termín s kapacitou,
- e-mailem dostane odkaz a kód, přes které registraci později upraví nebo zruší.

## 2. Pojmy
| Pojem | Význam |
|---|---|
| **Událost** | Akce s názvem, obrázkem, popisem, nastavením a odkazem. |
| **Termín (slot)** | Položka, na kterou se účastník registruje. Má čas (od–do) a kapacitu. |
| **Registrace** | Údaje jednoho účastníka, vybrané termíny, stav a tajný odkaz na správu. |
| **Formulář** | Pole, která má účastník vyplnit. Každé pole je povinné, volitelné nebo skryté. |
| **Organizátor** | Učitel nebo admin, který událost spravuje. |

## 3. Role a oprávnění
- `events.manage.own`: učitel vytváří a spravuje svoje události. Může přidat spoluorganizátory, tedy další učitele.
- `events.manage.all`: admin spravuje všechny události.
- Účastník nepotřebuje účet, pokud je událost veřejná.
- Náhled „zobrazit jako“ je jen pro čtení, stejně jako jinde v aplikaci.

## 4. Nastavení události
1. **Základ:**
   - název a krátký podtitulek (zobrazí se v náhledu odkazu),
   - místo konání,
   - kontakt na organizátora.
2. **Odkaz:** `https://…/akce/<slug>`. Slug se vygeneruje z názvu a dá se změnit. Volitelně lze
   použít neuhodnutelný odkaz `…/akce/<náhodný-kód>` pro akce, které se nemají dát najít.
   Stránka má vždy `noindex`.
3. **Titulní obrázek:** nahrání, ořez na poměr 16:9 a alternativní text pro přístupnost.
4. **Popis:** rich text přes stávající editor TipTap. Umí nadpisy, tučné písmo, seznamy, odkazy,
   obrázky v textu a případně vložené video.
5. **Stav:**
   - Koncept: vidí jen organizátor, ale funguje náhled.
   - Zveřejněno.
   - Registrace uzavřena: stránka je dál vidět s textem „Registrace skončila“.
   - Archiv.
6. **Období registrace:** od–do. Před začátkem stránka ukáže „Registrace se otevře …“.
7. **Viditelnost:**
   - **Veřejná:** kdokoli s odkazem.
   - **Jen pro přihlášené:** uživatelé aplikace, volitelně omezení na role, ročníky nebo třídy.
     Využije se stávající „publikum“ ze zápisů. Jméno a e-mail se pak předvyplní z účtu.
8. **Pravidla:**
   - kolik termínů si jeden účastník smí vybrat (1 nebo víc),
   - zda smí přivést další osoby (pole „počet osob“; kapacita se pak počítá podle osob),
   - uzávěrka změn (například 24 h před termínem),
   - limit registrací na jeden e-mail.
9. **Texty:**
   - vlastní text potvrzovací stránky a potvrzovacího e-mailu,
   - text souhlasu se zpracováním osobních údajů (GDPR, povinné zaškrtnutí).

## 5. Typy registrace
**V1: časové termíny.** Organizátor přidá termíny ručně nebo generátorem: „každých 30 min od 9:00 do 15:00, kapacita 20“. U každého termínu jde upravit kapacitu, poznámku (například „prohlídka laboratoří“), skrýt ho nebo ho zrušit.

Datový model je obecný. „Termín“ je **položka**, která *může* mít čas. Bez dalších změn modelu tak půjdou i tyto typy:

| Typ | Příklad | Co navíc |
|---|---|---|
| Jednoduchá registrace | přednáška pro rodiče | jedna položka bez času, jen kapacita |
| Výběr z možností | workshopy na dni otevřených dveří | položky bez času, výběr 1–N (podobně jako bloky v zápisech) |
| Termíny podle dní | konzultace pro uchazeče během týdne | položky seskupené po dnech |
| Čekací listina | plný termín | po uvolnění místa se automaticky posune první z čekací listiny a dostane e-mail |

## 6. Formulář účastníka
- **E-mail je vždy povinný.** Posílá se na něj potvrzení a odkaz na úpravu.
- Pevná pole, každé lze přepnout na povinné / volitelné / skryté:
  - jméno a příjmení,
  - telefon,
  - počet osob,
  - poznámka,
  - současná škola (ZŠ),
  - ročník.
- **Vlastní pole:** krátký text, dlouhý text, výběr z možností, zaškrtávátko. U každého pole jde nastavit povinnost a pořadí.
- Souhlas se zpracováním osobních údajů je povinný a uloží se s časem udělení.

## 7. Ochrana proti robotům a zneužití
- **Doporučuji Cloudflare Turnstile.** Je zdarma, většinou bez hádanky a šetrnější k soukromí než reCAPTCHA.
  - Klíč webu je veřejný a nastaví se v administraci.
  - Tajný klíč patří do env proměnné `TURNSTILE_SECRET_KEY`.
  - Bez klíčů modul funguje jen s ochranami níže a administrace ukáže varování.
- **Další ochrany:**
  - skryté pole (honeypot),
  - minimální doba vyplnění,
  - limit počtu registrací z jedné IP za čas,
  - limit registrací na e-mail.
- **Volitelné ověření e-mailu:** registrace je „nepotvrzená“, dokud účastník neklikne na odkaz v e-mailu.
  Do té doby blokuje místo jen omezenou dobu (například 30 min). Chrání to kapacitu před smyšlenými e-maily.

## 8. Po registraci a správa registrace účastníkem
- Potvrzovací stránka a e-mail obsahují:
  - souhrn registrace,
  - **odkaz na správu** `…/akce/<slug>/r/<token>` (token má 128 bitů, v databázi je uložený jen jeho hash),
  - **krátký kód** (například `K7M-4QX`), ke kterému účastník napíše svůj e-mail, pokud odkaz ztratí. Na stránce akce bude „Už jste registrovaní? Zadejte kód a e-mail“.
- Na správě registrace účastník může:
  - změnit termín, pokud je volno,
  - upravit údaje,
  - registraci zrušit.
  Vše jen do uzávěrky změn.
- Další vymoženosti:
  - příloha `.ics` (přidat do kalendáře),
  - automatická připomínka den předem přes stávající denní cron,
  - e-mail při zrušení nebo změně termínu organizátorem.

## 9. Nástroje organizátora
- **Přehled událostí:** stav, počet registrací, obsazenost, kopírování odkazu a **QR kód** odkazu (na plakát).
- **Detail události:**
  - obsazenost termínů (pruhy jako u zápisů),
  - seznam registrací s hledáním,
  - ruční přidání, úprava, přesun mezi termíny a zrušení,
  - export CSV a Excel.
- **Hromadný e-mail** všem nebo jednomu termínu, s ohledem na denní limit e-mailů.
- **Prezence na místě:** seznam po termínech se zaškrtáváním „přišel“. Volitelně QR kód v potvrzovacím e-mailu, který se načte telefonem.
- **Duplikovat událost:** například loňský den otevřených dveří s posunutými daty.
- **Ochrana osobních údajů:** po archivaci se osobní údaje automaticky smažou nebo anonymizují po X dnech (nastavitelné, výchozí 90). Statistiky (počty) zůstanou.

## 10. Další nápady (mimo první verzi)
- dotazník spokojenosti po akci,
- vložení registrace na web školy (`iframe` / widget),
- statistiky (odkud lidé přišli, počty podle ZŠ),
- více jazyků,
- platby (spíš ne).

## 11. Technické řešení
- **Nový modul** `modules/events`:
  - manifest s oprávněními, navigací a sekcí administrace,
  - `server.tsx` napojený na stávající body rozšíření: karty přehledu, úkoly v administraci, ukázková data, `runDailyJob` (připomínky, mazání údajů), odhad e-mailů.
- **Prisma modely** (jedna migrace):
  - `Event`: název, slug, stav, období, viditelnost, publikum, pravidla, texty, obrázek, popis (HTML), autor.
  - `EventOrganizer`: spoluorganizátoři.
  - `EventItem` (termín/položka): čas od–do (volitelně), kapacita, pořadí, zrušeno.
  - `EventField`: definice pole formuláře (typ, popisek, povinnost, možnosti, pořadí).
  - `EventRegistration`: e-mail, jméno, počet osob, odpovědi (JSON), stav (nepotvrzená / potvrzená / zrušená / čekací listina), hash tokenu, kód, souhlas a čas jeho udělení, přítomnost, případně `userId`.
  - `EventRegistrationItem`: vazba registrace na vybrané termíny.
- **Veřejné stránky:** `app/akce/[slug]` a `app/akce/[slug]/r/[token]`.
  - Leží mimo přihlášení; v `middleware` se pro ně přidá výjimka.
  - Serverové akce pro veřejnost nepoužívají `requirePermission`. Ověřují Turnstile, limity a token.
- **Kapacita:** registrace probíhá v serializable transakci se stejným vzorem opakování jako `enrollStudent`, aby se poslední místo nepřidělilo dvakrát.
- **Bezpečnost popisu:** HTML z editoru se při uložení i při zobrazení **čistí** whitelistem (`sanitize-html`).
  Veřejná stránka nesmí vložit neošetřené HTML. Stejnou ochranu doporučuji doplnit i u sylabu předmětů, který se dnes zobrazuje bez čištění.
- **Obrázky:** doporučuji **Vercel Blob** (na Vercelu zdarma pro malé objemy). Potřebuje `BLOB_READ_WRITE_TOKEN`, který Vercel vytvoří sám po přidání úložiště k projektu.
  Alternativa bez další služby: obrázek zmenšený na serveru a uložený v databázi (jednodušší, ale databáze roste).
- **E-maily:** přes stávající `lib/email` (šablony, limity, EmailLog).
  **Pozor na limit Resend zdarma: 100 e-mailů denně a 3 000 měsíčně.** Den otevřených dveří se stovkami registrací a připomínkami ho snadno překročí. Modul proto ukáže odhad počtu e-mailů a varuje.
- **Ostatní:** audit všech změn, ukázková data (událost s termíny a registracemi), E2E testy (veřejná registrace, plno, změna přes odkaz, kód + e-mail, ochrana proti robotům v testovacím režimu) a mobil 390×844.

## 12. Návrh fází
1. **E1:** Model, správa událostí a termínů (generátor), formulář, náhled stránky.
2. **E2:** Veřejná stránka, registrace, Turnstile a limity, potvrzovací e-mail s odkazem a kódem.
3. **E3:** Správa registrace účastníkem (změna, zrušení, kód + e-mail, `.ics`). Nástroje organizátora (seznam, ruční úpravy, export, hromadný e-mail).
4. **E4:** Čekací listina, připomínky, prezence s QR, duplikace, mazání osobních údajů, ověření e-mailu.

## 13. Otázky k rozhodnutí
1. Smí události vytvářet každý učitel, nebo jen admin (případně učitel s právem, které mu admin přidělí)?
2. Má být e-mail vždy povinný? (Doporučuji ano.) A zapnout ověření e-mailu kliknutím jako výchozí?
3. Turnstile vyžaduje účet Cloudflare (zdarma). Je to v pořádku, nebo stačí jen honeypot a limity?
4. Obrázky ukládat do Vercel Blob, nebo do databáze?
5. Tvar odkazu: `/akce/den-otevrenych-dveri-2027`, nebo náhodný kód?
6. Jak dlouho držet osobní údaje po skončení akce?
7. Pro velké akce: je možné přejít na placený tarif Resend, nebo omezit e-maily jen na potvrzení?

## 14. Rozhodnutí majitele (17. 11. 2026)
1. Události smí vytvářet **i učitel** (svoje), admin všechny.
2. Organizátor může kdykoli cokoli měnit, včetně odebrání („vyhození“) účastníka z termínu
   a přesunu mezi termíny. Uzávěrky platí jen pro účastníka, ne pro organizátora.
3. **E-mail je vždy povinný.**
4. **Žádná externí captcha.** Ochrana proti robotům musí být součástí aplikace, bez účtu u třetí strany:
   - samostatná výpočetní zkouška (proof-of-work) ve stylu ALTCHA: prohlížeč na pozadí spočítá
     úlohu podepsanou serverem, uživatel nic neopisuje;
   - tajný klíč se vygeneruje sám a uloží do `SystemSetting`;
   - k tomu honeypot, minimální doba vyplnění a limity na IP adresu a e-mail.
5. **Obrázky ukládat do databáze, bez další služby.** Musí to být příjemné pro uživatele:
   - přetažení nebo výběr souboru, náhled, ořez 16:9;
   - prohlížeč obrázek zmenší (max. 1600 px, WebP, cíl do 300 kB) ještě před nahráním;
   - obrázek se uloží do vlastní tabulky a vydává se přes route s dlouhou cache.
6. **Osobní údaje se smažou nebo anonymizují 90 dní po skončení akce.**
7. **E-maily nerozšiřovat**, hlídání limitu zůstává:
   - Každý typ e-mailu z modulu (potvrzení, změna, připomínka, zrušení organizátorem, hromadný)
     jde zapnout nebo vypnout ve stávajících Upozorněních.
   - U každého typu je vidět, kolik e-mailů za posledních 30 dní odešlo.
   - Každá událost má nastavení **„Potvrzení registrace“**, které určuje, kde účastník dostane
     odkaz a kód:
     - e-mailem i na obrazovce (výchozí),
     - jen na obrazovce (bez e-mailu; účastník si odkaz a kód uloží, zkopíruje nebo stáhne),
     - jen e-mailem.
   - Když je denní limit vyčerpaný, registrace projde a účastník dostane odkaz a kód na obrazovce.
     Varování uvidí jen organizátor; účastníkovi se ukáže jen to, co potřebuje.
8. **Cookies:** cookie lišta s potvrzováním **není potřeba**. Souhlas v EU (ePrivacy/GDPR) se vyžaduje
   jen pro nepovinné cookies (analytika, reklama). Aplikace používá:
   - jen nezbytné cookies (přihlášení, režim „zobrazit jako“);
   - Vercel Analytics, které cookies nepoužívá (Google Analytics odstraněno, rozhodnutí 18. 11. 2026, cookie lišta tedy není potřeba);
   - písma, která jsou součástí aplikace.

   Potřeba je ale stránka **„Zpracování osobních údajů“** (kdo údaje zpracovává, k jakému účelu,
   jak dlouho a jaká má účastník práva). Odkaz na ni bude u souhlasu ve formuláři a v patičce
   veřejných stránek. **Pokud se později přidá cokoli, co cookies nebo sledování používá, lišta
   potřeba bude.**
