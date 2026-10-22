# Modulární architektura

Od 10/2026 je SeminarIS rozdělený na **jádro** a **moduly**. Pořád je to jedna Next.js
aplikace s jednou databází (modulární monolit), ale každá funkční oblast má svůj kód
pohromadě a do systému se zapojuje přes manifest. Prvním modulem je zápis seminářů,
dalším bude zápis na dopisovací písemky.

## Struktura

```
modules/
  types.ts              typ ModuleManifest (čistá data)
  server-types.ts       typ ModuleServer (serverové háčky)
  registry.ts           seznam modulů, can(), menu, oprávnění k cestám  ← i pro middleware a klienta
  server-registry.ts    serverové části modulů                           ← jen server
  core/                 jádro: uživatelé, profil, administrace
    manifest.ts
    server.ts           statistiky do administrace
    settings.ts         globální nastavení (ročník, registrace, výchozí role)
    actions/            server actions: users.ts, admin.ts, profile.ts
    components/         users/, admin/
  seminars/             zápis seminářů
    manifest.ts
    server.tsx          widget na dashboard, statistiky, úklid při mazání uživatele
    window-status.ts    synchronizace stavu zápisového okna s časem
    actions/            subjects.ts, windows.ts, enrollment.ts
    components/         blocks/, enrollment/, occurrences/, subjects/
lib/
  session.ts            getCurrentUser, requireAuth, requireModule, requirePermission
  modules.ts            zapnuté moduly (SystemSetting `module.<id>.enabled`), ensureModulePage
  settings.ts           getSetting / setSetting
  prisma.ts             Prisma klient (passwordHash se nikdy nevrací bez výslovného omit: false)
  auth.ts               NextAuth; role a aktivita se při každém ověření načtou z DB
app/                    stránky (URL zůstaly beze změny)
components/             sdílené UI (shadcn/ui, editor, topbar)
```

## Manifest modulu

`modules/<id>/manifest.ts` obsahuje jen data, takže ho může načíst middleware (Edge),
klient i server:

- `permissions`: oprávnění modulu (`"<modul>.<akce>"`) a role, které je mají,
- `nav`: položky menu včetně oprávnění a pořadí,
- `routes`: prefixy cest, které hlídá middleware,
- `enabledByDefault` / `core`: výchozí stav; jádro nejde vypnout.

## Serverová část modulu

`modules/<id>/server.ts(x)` implementuje `ModuleServer`. Všechny části jsou volitelné:

- `getDashboardWidget(user)` vrací obsah na dashboard, nebo `null`,
- `getAdminStats()` vrací karty se statistikami v administraci,
- `onUserDelete(tx, userId, replacementUserId)` uklidí data modulu v transakci před
  trvalým smazáním uživatele. Běží i u vypnutého modulu.

## Oprávnění

Kód se neptá na role (`role === "TEACHER"`), ale na oprávnění:

```ts
// server action: přihlášení + zapnutý modul + oprávnění, jinak vyhodí chybu
const user = await requirePermission("seminars.windows.manage");

// podmínka v kódu (server i klient)
if (can(user.role, "seminars.enroll.others")) { … }
```

Mapování oprávnění na role je jen v manifestech. Novou roli nebo jiné rozdělení práv
stačí upravit tam.

> Zbývá doladit: klientské komponenty seminářů a uživatelů ještě místy porovnávají
> role přímo (jen schovávají tlačítka). Server oprávnění vynucuje vždy.

## Zapnutí a vypnutí modulu

Administrace → karta **Moduly**. Vypnutý modul:

- zmizí z menu (seznam zapnutých modulů je v session, `useAuth().enabledModules`),
- má stránky vracející 404 (layout volá `ensureModulePage("<id>")`),
- má server actions, které vyhodí chybu (`requirePermission` / `requireModule`),
- nepřispívá na dashboard ani do statistik.

Data zůstávají v databázi.

## Jak přidat nový modul (např. dopisovací písemky)

1. `modules/makeup-exams/manifest.ts`: id, název, oprávnění, menu, chráněné cesty.
2. Přidat manifest do `MODULES` v `modules/registry.ts`.
3. Modely do `prisma/schema.prisma` (do vlastní sekce) a vytvořit migraci
   (`npx prisma migrate dev --name makeup_exams`, viz níže).
4. Server actions do `modules/makeup-exams/actions/*.ts` (`"use server"`), každá začíná
   `requirePermission(...)`.
5. Stránky do `app/<cesta>/` a `layout.tsx` s `ensureModulePage("makeup-exams")`.
6. Podle potřeby `modules/makeup-exams/server.tsx` (widget, statistiky, `onUserDelete`
   pro tabulky odkazující na uživatele) a jeho registrace v `modules/server-registry.ts`.

## Databáze a migrace

Dřív se schéma měnilo přes `prisma db push`. **Build na Vercelu databázi nemění**: spouští
jen `prisma generate` a `next build`. Od teď se schéma mění výhradně migracemi:

| Příkaz | Kdy |
|---|---|
| `npx prisma migrate dev --name <popis>` | lokálně/na vývojové DB: vytvoří a aplikuje novou migraci |
| `npm run db:status` | stav migrací na DB z `DATABASE_URL` |
| `npm run db:migrate` | aplikuje čekající migrace (`prisma migrate deploy`) na DB z `DATABASE_URL` |
| `npm run db:seed` | naplní prázdnou DB testovacími daty |

Migrace se do produkce aplikují **ručně** příkazem `npm run db:migrate` s produkčním
`DATABASE_URL`, a to před nasazením kódu, který je potřebuje. Do buildu se záměrně nedávají:
preview nasazení větví na Vercelu obvykle sdílejí produkční databázi a migrovala by ji každá
větev.

### Jednorázový přechod produkce na migrace (baseline)

Migrace `20261022120000_sync_db_push_drift` dorovnává historii migrací se stavem, který
na produkci vznikl přes `db push`. Na produkci se **nesmí spustit**, jen se označí jako
aplikovaná:

```bash
# 1) Ověřit, že produkce odpovídá schématu (výstup musí být „No difference detected.“)
DATABASE_URL="<produkční URL>" npx prisma migrate diff \
  --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma

# 2) Zjistit stav migrací
DATABASE_URL="<produkční URL>" npm run db:status

# 3) Označit jako aplikované ty, které status hlásí jako neaplikované
#    (pokud produkce vznikla celá přes db push, týká se to i init migrace)
DATABASE_URL="<produkční URL>" npx prisma migrate resolve --applied 20251108190324_init
DATABASE_URL="<produkční URL>" npx prisma migrate resolve --applied 20261022120000_sync_db_push_drift

# 4) Kontrola: „Database schema is up to date!“
DATABASE_URL="<produkční URL>" npm run db:status
```

Pokud krok 1 ukáže rozdíly, produkce se od schématu v repozitáři liší. Nic neoznačujte a
rozdíl nejdřív vyřešte. Před krokem 3 doporučujeme zálohu nebo branch databáze v Neonu.

Tento přechod není potřeba pro nasazení aktuální verze: ta schéma nemění. Je potřeba
před první další změnou schématu (modul dopisovacích písemek).

## Bezpečnostní opravy provedené při refaktoringu

- Hash hesla se už neposílá do prohlížeče. Dřív ho obsahovaly objekty učitelů u výskytů
  seminářů (vidět i pro studenty) a seznam uživatelů. Nově ho Prisma globálně vynechává.
- Odstraněna nepoužívaná akce `getUserByEmail`, kterou mohl kterýkoli přihlášený uživatel
  získat cizí účet včetně hashe hesla.
- Akce pro čtení zápisových oken vyžadují přihlášení. Student už nedostane skryté okno
  ani koncept, ani když akci zavolá s jinými parametry.
- `getUsersForFilters` vrací studentům jen učitele a adminy, ne seznam všech uživatelů.
- Změna role a deaktivace účtu platí hned, ne až po novém přihlášení.
- Role při změně role a importu uživatelů se validuje.
- Pomocné autorizační funkce už nejsou v `"use server"` souboru, takže nejsou
  zavolatelné z klienta.
