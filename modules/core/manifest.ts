import type { ModuleManifest } from "@/modules/types";

export const coreModule = {
  id: "core",
  name: "Jádro systému",
  description: "Uživatelé a třídy, předměty, přihlášení, profil a administrace.",
  core: true,
  enabledByDefault: true,
  permissions: {
    "core.dashboard": ["STUDENT", "TEACHER", "ADMIN"],
    "core.profile": ["STUDENT", "TEACHER", "ADMIN"],
    // Seznam uživatelů (učitelé jen čtou)
    "core.users.view": ["TEACHER", "ADMIN"],
    // Úpravy, import, role, mazání uživatelů
    "core.users.manage": ["ADMIN"],
    // Administrační centrum a globální nastavení (zápis; sekce administrace jen pro admina)
    "core.admin": ["ADMIN"],
    // Administrace pro čtení: položka menu, přehled „co udělat“ (učitel vidí jen své položky)
    "core.admin.view": ["TEACHER", "ADMIN"],
    // Školní rok a seznam tříd se studenty (jen čtení; úpravy vyžadují core.users.manage / core.school.manage)
    "core.classes.view": ["TEACHER", "ADMIN"],
    // Zobrazit aplikaci jako jiný uživatel (jen pro čtení)
    "core.impersonate": ["ADMIN"],
    // Školní rok (uzavření roku) a úvazky učitelů
    "core.school.manage": ["ADMIN"],
    // Předměty: katalog, úpravy a archivace/smazání
    "core.subjects.view": ["STUDENT", "TEACHER", "ADMIN"],
    "core.subjects.edit": ["TEACHER", "ADMIN"],
    "core.subjects.archive": ["ADMIN"],
    // „Moje předměty“: co učím (učitel) / co mě čeká (student)
    "core.subjects.mine": ["STUDENT", "TEACHER"],
  },
  nav: [
    { label: "Dashboard", href: "/", permission: "core.dashboard", order: 0 },
    { label: "Předměty", href: "/subjects", permission: "core.subjects.view", order: 20 },
    { label: "Moje předměty", href: "/subjects/mine", permission: "core.subjects.mine", order: 25 },
    { label: "Uživatelé", href: "/users", permission: "core.users.view", order: 80 },
    { label: "Administrace", href: "/admin", permission: "core.admin.view", order: 90 },
    { label: "Můj profil", href: "/profile", permission: "core.profile", order: 100 },
  ],
  routes: [
    { prefix: "/users", permission: "core.users.view" },
    // Přehled a Školní rok a třídy vidí i učitel (jen čtení); vše ostatní pod /admin jen admin
    { prefix: "/admin", permission: "core.admin.view", exact: true },
    { prefix: "/admin/school-year", permission: "core.classes.view" },
    { prefix: "/admin", permission: "core.admin" },
    { prefix: "/subjects/mine", permission: "core.subjects.mine" },
    { prefix: "/subjects", permission: "core.subjects.view" },
  ],
  // Boční menu administrace (moduly přidávají vlastní přes `adminSections`)
  adminSections: [
    { label: "Přehled", href: "/admin", permission: "core.admin.view", order: 0 },
    { label: "Registrace a přihlášení", href: "/admin/registration", permission: "core.admin", order: 10 },
    { label: "Školní rok a třídy", href: "/admin/school-year", permission: "core.classes.view", order: 20, match: ["/admin/close-year"] },
    { label: "Moduly", href: "/admin/modules", permission: "core.admin", order: 30 },
    { label: "Upozornění", href: "/admin/notifications", permission: "core.admin", order: 40 },
    { label: "Historie", href: "/admin/history", permission: "core.admin", order: 50 },
    { label: "Diagnostika", href: "/admin/diagnostics", permission: "core.admin", order: 60 },
  ],
  // Nastavení jádra. Klíče jsou historické a nesmí se přejmenovat (uložené hodnoty v SystemSetting).
  settings: [
    {
      key: "registration_enabled",
      type: "boolean",
      default: true,
      label: "Registrace nových uživatelů",
      description: "Pokud je vypnuta, nikdo se nemůže registrovat.",
      audit: { action: "settings.registration" },
    },
    {
      key: "default_user_role",
      type: "enum",
      default: "GUEST",
      options: [
        { value: "GUEST", label: "Host" },
        { value: "STUDENT", label: "Student" },
      ],
      label: "Výchozí role nových uživatelů",
      description: "Role, která bude přiřazena po dokončení registrace.",
      audit: { action: "settings.defaultRole" },
    },
    {
      key: "registration_class_mode",
      type: "enum",
      default: "off",
      options: [
        { value: "off", label: "Vypnuto" },
        { value: "optional", label: "Volitelný" },
        { value: "required", label: "Povinný" },
      ],
      label: "Výběr třídy při registraci",
      description: "Nový uživatel uvede svou třídu; správce ji pak potvrdí při schválení.",
      audit: { action: "settings.classMode" },
    },
    {
      key: "auth.microsoft.enabled",
      type: "boolean",
      default: true,
      label: "Přihlášení přes Microsoft 365",
      description: "Tlačítko „Přihlásit přes Microsoft 365“ na přihlašovací stránce.",
      audit: { action: "settings.auth", group: "Nastavení přihlašování" },
    },
    {
      key: "auth.microsoft.autoCreate",
      type: "boolean",
      default: false,
      label: "Zakládat účty při prvním přihlášení",
      description:
        "Vypnuto: přes Microsoft se přihlásí jen uživatelé, kteří už v systému jsou (např. z importu). Zapnuto: komukoli ze školy se účet založí s výchozí rolí.",
      audit: { action: "settings.auth", group: "Nastavení přihlašování" },
    },
    {
      key: "auth.password.scope",
      type: "enum",
      default: "ALL",
      options: [
        { value: "ALL", label: "Všichni" },
        { value: "STAFF", label: "Jen učitelé a admini" },
        { value: "ADMIN", label: "Jen admini" },
      ],
      label: "Kdo se smí přihlásit heslem",
      description: "Platí jen při zapnutém Microsoft 365. Admin se heslem přihlásí vždy.",
      audit: { action: "settings.auth", group: "Nastavení přihlašování" },
    },
    // Uchovávání historie změn (vlastní karta v sekci Historie)
    {
      key: "audit.retentionYears",
      type: "number",
      default: 2,
      min: 1,
      max: 20,
      label: "Uchovávání historie změn (roky)",
      hidden: true,
      audit: { action: "settings.history" },
    },
    // E-mailová upozornění (vlastní obrazovka Upozornění)
    { key: "email.enabled", type: "boolean", default: true, label: "E-mailová upozornění", hidden: true, audit: { action: "settings.notifications", group: "Nastavení e-mailových upozornění" } },
    {
      key: "email.from",
      type: "string",
      default: "",
      label: "Odesílatel",
      hidden: true,
      maxLength: 300,
      audit: { action: "settings.notifications", group: "Nastavení e-mailových upozornění" },
      // „Jméno <adresa>“ nebo holá adresa
      validate: (v) =>
        v === "" || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((String(v).match(/<([^<>]+)>\s*$/)?.[1] ?? String(v)).trim())
          ? null
          : 'Odesílatel musí být e-mail, nebo "Jméno <e-mail>".',
    },
    {
      key: "email.replyTo",
      type: "string",
      default: "",
      label: "Reply-to",
      hidden: true,
      maxLength: 300,
      audit: { action: "settings.notifications", group: "Nastavení e-mailových upozornění" },
      validate: (v) =>
        v === "" || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((String(v).match(/<([^<>]+)>\s*$/)?.[1] ?? String(v)).trim())
          ? null
          : "Reply-to musí být platný e-mail.",
    },
    { key: "email.dailyLimit", type: "number", default: 90, min: 0, max: 100000, label: "Denní limit", hidden: true, audit: { action: "settings.notifications", group: "Nastavení e-mailových upozornění" } },
    { key: "email.monthlyLimit", type: "number", default: 2900, min: 0, max: 1000000, label: "Měsíční limit", hidden: true, audit: { action: "settings.notifications", group: "Nastavení e-mailových upozornění" } },
    // Měsíční limit se počítá z EmailLogu, proto se log nesmí mazat dřív než za 35 dní
    { key: "email.logRetentionDays", type: "number", default: 90, min: 35, max: 3650, label: "Uchovávání záznamů o e-mailech (dny)", hidden: true, audit: { action: "settings.notifications", group: "Nastavení e-mailových upozornění" } },
  ],
} as const satisfies ModuleManifest;
