# Zadání: e-mailová upozornění (Resend), nezapsaní studenti, historie změn, náhled jako uživatel

Navazuje na zadání `2026-10-predmety-tridy-uzivatele.md` (musí být hotové dřív).

## A. E-mailová upozornění přes Resend

Cíl: upozornění nastavitelná z administrace tak, aby se nevyčerpal free limit Resendu
(3 000 e-mailů/měsíc, 100/den).

### Odesílání
- Resend přes REST API (`fetch`, bez SDK), klíč v env `RESEND_API_KEY`. Bez klíče se nic
  neposílá a administrace to ukáže. Doména je ověřená v Resendu, nic dalšího není potřeba.
- Odesílatel: env `EMAIL_FROM` (např. `Školní IS <noreply@domena.cz>`) a volitelně
  `EMAIL_REPLY_TO`; administrace je může přepsat (prázdné pole = hodnota z env).
- Vše přes jednu funkci (`lib/email/`): kontrola zapnutí, události, limitů a odhlášení
  příjemce → odeslání (u více příjemců batch API po max. 100) → zápis do `EmailLog`.
- Chyba odeslání nesmí shodit akci, která ho vyvolala (zaloguje se, akce proběhne).
- `EmailLog`: příjemce, událost, předmět, stav (SENT / FAILED / SKIPPED_LIMIT /
  SKIPPED_DISABLED), chyba, čas. Slouží i k počítání limitů.

### Administrace → „Upozornění“
- Hlavní vypínač, odesílatel a reply-to (přepíše env, prázdné = env).
- Limity: denní (výchozí 90) a měsíční (výchozí 2 900); při dosažení se další e-maily
  neposílají (SKIPPED_LIMIT) a admin to vidí. Ukazatel „dnes X / měsíc Y“.
- Seznam událostí, u každé: zapnuto/vypnuto, předmět a text šablony s proměnnými
  (`{{jmeno}}`, `{{termin}}`, `{{ucebna}}`, …, výchozí české texty), u hromadných odhad
  počtu příjemců.
- Tlačítko „Poslat zkušební e-mail sobě“.
- Přehled posledních odeslaných e-mailů (EmailLog) s filtrem.

### Události (výchozí stav v závorce)
Dopisování:
- termín zrušen → zapsaným studentům (zap.),
- termín změněn (čas, učebna) → zapsaným (zap.),
- učitel studenta přesunul / odepsal → studentovi (zap.),
- připomínka den předem → zapsaným (vyp.),
- denní souhrn pro dozor a vyučující „zítra dopisují…“ (vyp.).

Účty:
- účet schválen → studentovi (zap.),
- denní souhrn „N účtů čeká na schválení“ → adminům (zap., jen když N > 0).

Zápisy seminářů:
- zápis otevřen → studentům cílových ročníků (vyp. – hodně e-mailů),
- připomínka nezapsaným (viz B) (vyp.).

### Plánované úlohy
- Jeden endpoint `/api/cron/daily` chráněný `CRON_SECRET`, `vercel.json` s denním
  spuštěním (Vercel Hobby umí cron jen 1× denně), např. 6:00 Praha.
- Dělá: připomínky na zítřek, denní souhrny, automatické připomínky nezapsaným, mazání
  starého audit logu a EmailLogu podle nastavení.

### Uživatel
- V profilu: „Dostávat nepovinná upozornění“ (připomínky, souhrny). Povinné (zrušení
  a změna termínu, schválení účtu) chodí vždy, když je událost zapnutá.

## B. Přehled nezapsaných studentů (zápis seminářů)
- V detailu zápisového okna záložka „Nezapsaní“: aktivní studenti cílových ročníků, kteří
  nemají zápis ve všech blocích; u každého chybějící bloky. Filtr třídy, export CSV.
- Ručně: tlačítko „Poslat připomínku nezapsaným (N e-mailů)“ s potvrzením.
- Automaticky: u okna nastavení „připomenout N dní před koncem“ (prázdné = ne); provede
  denní cron, jednou za okno a den.
- Dashboard admina/učitele: u otevřeného okna počet nezapsaných.

## C. Historie změn (audit log)
Dnes se ukládá jen kdo záznam vytvořil/upravil/smazal u seminářů a zápisů. Role, mazání
uživatelů, nastavení, dopisování ani uzavření roku se nelogují.
- `AuditLog`: `actorId`, `impersonatorId?`, `action` (např. `makeup.registration.remove`),
  `entityType`, `entityId`, `summary` (česky, čitelné), `data` (JSON před/po), čas.
- Helper `audit(tx, {...})` volaný ve stejné transakci jako změna. Logovat: uživatelé (role,
  aktivace, schválení, třída, ukončení studia, reset hesla, smazání, import – souhrnně),
  uzavření roku, nastavení a moduly, předměty a úvazky, zápisová okna a jejich stav, zápis
  a odepsání v seminářích (sám / jiným), termíny dopisování, zápisy, přesuny, docházka.
- Administrace → „Historie“: tabulka s filtrem (kdo, oblast, období, hledání), u uživatele
  odkaz „Historie“ (co dělal on a co se dělo s ním).
- Retence nastavitelná v administraci (výchozí 2 roky), maže denní cron.

## D. Zobrazit jako uživatel (admin)
- V seznamu uživatelů akce „Zobrazit jako“ (jen ADMIN, ne na jiného admina).
- Podepsaná httpOnly cookie (HMAC s `NEXTAUTH_SECRET`, platnost 1 h) s id cílového
  uživatele. `getCurrentUser()` v `lib/session.ts` vrátí cílového uživatele s příznakem
  `impersonatedBy`; všechna oprávnění se tak vyhodnotí jako u něj.
- **Jen pro čtení:** `safeAction` (a přímé zápisy mimo ni) v režimu náhledu odmítne každou
  změnu hláškou „V režimu náhledu nelze nic měnit.“ Žádné e-maily.
- Výrazný pruh nahoře „Prohlížíte jako Jan Novák (student 2.A) – Ukončit náhled“.
- Začátek a konec náhledu se zapíše do audit logu.

## Obecně
- Konvence z `Dokumentace/architektura-moduly.md`, jedna nová migrace, dokumentace
  (nový oddíl Upozornění, Historie, Náhled; env `RESEND_API_KEY`, `CRON_SECRET`).
- Testy: jednotkové/E2E pro limity a vypnuté události (Resend v testech nahradit – např.
  env `EMAIL_TRANSPORT=log`, který jen zapíše EmailLog), nezapsaní + ruční připomínka,
  audit záznam u odepsání, náhled jako student (vidí jeho data, změna je odmítnuta).
- Hotovo = typecheck, lint, build a E2E projdou.
