 
import type { Role } from "@/lib/types";

// Položka hlavního menu. Zobrazí se jen uživateli s daným oprávněním.
export type NavItem = {
  label: string;
  href: string;
  permission: string;
  // Pořadí v menu napříč moduly (nižší = víc vlevo)
  order: number;
};

// Pravidlo pro middleware: cesty začínající `prefix` vyžadují `permission`.
export type RouteRule = {
  prefix: string;
  permission: string;
  // Pravidlo platí jen pro přesně tuto cestu, ne pro podstránky (např. přehled `/admin` bez `/admin/…`)
  exact?: boolean;
};

// Položka bočního menu administrace (F2). Zobrazí se jen uživateli s daným oprávněním
// a jen u zapnutého modulu. `href` leží pod `/admin/…` (nebo ve stránkách modulu).
export type AdminSection = {
  label: string;
  href: string;
  permission: string;
  // Pořadí v menu administrace (jádro používá 0–99, moduly 100+)
  order: number;
  // Další cesty, pod kterými je sekce v menu zvýrazněná (např. podstránka průvodce)
  match?: readonly string[];
};

/**
 * Deklarace nastavení (F2: jednotný registr nastavení, `lib/settings-registry.ts`). Čistá data,
 * aby šla načíst i mimo server. Hodnota se ukládá do `SystemSetting` pod klíčem `key`
 * (konvence nových nastavení: `<idModulu>.<název>`, např. `makeup.defaultCapacity`; jádro má
 * z historických důvodů i klíče bez prefixu – ty se nesmí přejmenovat, ztratila by se data).
 * Uložení: boolean "true"/"false", number jako text celého čísla, string a enum jako text.
 */
export type SettingDeclaration = {
  key: string;
  type: "boolean" | "string" | "number" | "enum";
  // Výchozí hodnota, dokud admin nic neuloží (u `enum` jedna z `options`)
  default: string | number | boolean;
  label: string;
  description?: string;
  // Oprávnění potřebné k zápisu (výchozí `core.admin`); u modulů oprávnění modulu
  permission?: string;
  // Spravuje ho vlastní obrazovka (šablony e-mailů, zapnutí modulů…); generický formulář ho vynechá
  hidden?: boolean;
  // Jen pro `enum`
  options?: readonly { value: string; label: string }[];
  // Jen pro `number` (celá čísla)
  min?: number;
  max?: number;
  // Jen pro `string`
  maxLength?: number;
  placeholder?: string;
  // Název akce v historii změn (výchozí `settings.value`) a společný popis pro více nastavení,
  // která se mají zapsat jedním záznamem (např. všechna e-mailová nastavení)
  audit?: { action: string; group?: string };
  // Volitelná dodatečná validace; vrací text chyby, nebo null, když je hodnota v pořádku
  validate?: (value: string | number | boolean) => string | null;
};

// === Data předávaná bodům rozšíření (serverové funkce jsou v server-types.ts) ===

/** Štítek předmětu (seznam i detail), např. „v zápisu: Zápis ZS 2026“. */
export type SubjectBadge = {
  // Jedinečné v rámci modulu a předmětu (klíč v Reactu)
  id: string;
  label: string;
  // Odkaz, kam štítek vede (jen když na to uživatel má právo)
  href?: string;
  // Štítky se stejným `filter.key` tvoří jeden filtr „má / nemá“ v seznamu předmětů
  filter?: { key: string; label: string; yesLabel: string; noLabel: string };
  // Student vidí i předmět mimo svůj ročník, pokud k němu má štítek s tímto příznakem
  // (např. předmět nabízený v jemu viditelném zápisu)
  grantsAccess?: boolean;
};

/** Jedno použití předmětu v modulu (pro archivaci/mazání předmětu). */
export type SubjectUsageItem = {
  // Jedinečné v rámci modulu
  id: string;
  // Lidsky čitelné, např. „Zápisová okna: 2“
  label: string;
  // Počet záznamů (0 se nezobrazuje)
  count: number;
  href?: string;
};

/** Položka přehledu „co udělat“ v administraci (F2). */
export type AdminTodo = {
  id: string;
  label: string;
  count: number;
  severity: "info" | "warning" | "critical";
  // Kde to vyřešit
  href: string;
  // Oprávnění, které uživatel musí mít, aby položku viděl (výchozí `core.admin`, tj. jen admin).
  // Přehled administrace vidí i učitel, proto každá položka říká, komu patří.
  permission?: string;
};

/**
 * Manifest modulu – čistá data bez importů DB/Reactu, aby šel načíst
 * v middleware (Edge), v klientských komponentách i na serveru.
 * Serverové části modulu (dashboard widget, úklid při mazání uživatele, …)
 * jsou v `modules/<id>/server.ts`.
 */
export type ModuleManifest = {
  id: string;
  name: string;
  description: string;
  // Jádro nelze vypnout
  core?: boolean;
  // Výchozí stav, dokud admin modul výslovně nezapne/nevypne
  enabledByDefault: boolean;
  // Oprávnění modulu a role, které je mají
  permissions: Record<string, readonly Role[]>;
  nav: readonly NavItem[];
  routes: readonly RouteRule[];
  // Sekce v bočním menu administrace (F2)
  adminSections?: readonly AdminSection[];
  // Deklarace nastavení modulu (F2)
  settings?: readonly SettingDeclaration[];
};
