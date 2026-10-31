// Seznam e-mailových upozornění (událostí) s výchozími texty. Čistá data bez závislostí na DB,
// takže je použije server (odesílání, cron) i administrace (seznam, šablony).
//
// Povinná upozornění (mandatory) chodí vždy, když je událost zapnutá. Nepovinná (připomínky,
// souhrny) uživatel může vypnout v profilu („Dostávat nepovinná upozornění“).

export type EmailEventId =
  | "makeup.session.cancelled"
  | "makeup.session.changed"
  | "makeup.registration.removed"
  | "makeup.registration.moved"
  | "makeup.reminder"
  | "makeup.digest"
  | "account.approved"
  | "account.pending.digest"
  | "seminars.window.opened"
  | "seminars.window.reminder"
  | "manual.bulk"
  | "test";

export type EmailEventDef = {
  id: EmailEventId;
  // Modul, kterému událost patří (vypnutý modul nic neposílá)
  module: "core" | "makeup" | "seminars";
  group: string;
  label: string;
  // Komu a kdy se posílá
  description: string;
  defaultEnabled: boolean;
  mandatory: boolean;
  // Hromadná událost (odhad počtu příjemců v administraci)
  bulk: boolean;
  variables: { name: string; description: string }[];
  defaultSubject: string;
  defaultBody: string;
};

const JMENO = { name: "jmeno", description: "křestní jméno příjemce" };

export const EMAIL_EVENTS: readonly EmailEventDef[] = [
  {
    id: "makeup.session.cancelled",
    module: "makeup",
    group: "Dopisování",
    label: "Termín zrušen",
    description: "Zapsaným studentům, když dozor termín zruší.",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [
      JMENO,
      { name: "termin", description: "datum a čas termínu" },
      { name: "ucebna", description: "učebna" },
      { name: "dozor", description: "jméno dozoru" },
      { name: "predmety", description: "předměty, které student na termínu dopisoval" },
      { name: "duvod", description: "důvod zrušení" },
    ],
    defaultSubject: "Termín dopisování {{termin}} byl zrušen",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\ntermín dopisování {{termin}} (učebna {{ucebna}}, dozor {{dozor}}) byl zrušen.\nDůvod: {{duvod}}\n\nPřepište se prosím na jiný termín v sekci Dopisování.",
  },
  {
    id: "makeup.session.changed",
    module: "makeup",
    group: "Dopisování",
    label: "Termín změněn",
    description: "Zapsaným studentům, když dozor změní čas nebo učebnu termínu.",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [
      JMENO,
      { name: "termin", description: "nový datum a čas" },
      { name: "ucebna", description: "nová učebna" },
      { name: "puvodni_termin", description: "původní datum a čas" },
      { name: "puvodni_ucebna", description: "původní učebna" },
      { name: "dozor", description: "jméno dozoru" },
      { name: "predmety", description: "předměty, které student na termínu dopisuje" },
    ],
    defaultSubject: "Změna termínu dopisování: {{termin}}",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\ntermín dopisování, na který jste zapsaní, se změnil.\n\nPůvodně: {{puvodni_termin}}, učebna {{puvodni_ucebna}}\nNově: {{termin}}, učebna {{ucebna}}\nDozor: {{dozor}}\n\nPokud vám nový čas nevyhovuje, přepište se v sekci Dopisování na jiný termín.",
  },
  {
    id: "makeup.registration.removed",
    module: "makeup",
    group: "Dopisování",
    label: "Student odepsán z termínu",
    description: "Studentovi, kterého dozor odepsal z termínu.",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [
      JMENO,
      { name: "termin", description: "datum a čas termínu" },
      { name: "ucebna", description: "učebna" },
      { name: "dozor", description: "jméno dozoru" },
      { name: "predmety", description: "předměty zápisu" },
      { name: "kym", description: "kdo studenta odepsal" },
    ],
    defaultSubject: "Byli jste odepsáni z termínu dopisování {{termin}}",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\n{{kym}} vás odepsal(a) z termínu dopisování {{termin}} (učebna {{ucebna}}, předměty: {{predmety}}).\n\nPokud je to omyl, zapište se prosím znovu v sekci Dopisování.",
  },
  {
    id: "makeup.registration.moved",
    module: "makeup",
    group: "Dopisování",
    label: "Student přesunut na jiný termín",
    description: "Studentovi, kterého dozor přesunul na jiný termín.",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [
      JMENO,
      { name: "termin", description: "nový datum a čas" },
      { name: "ucebna", description: "nová učebna" },
      { name: "puvodni_termin", description: "původní datum a čas" },
      { name: "dozor", description: "jméno dozoru nového termínu" },
      { name: "predmety", description: "předměty zápisu" },
      { name: "kym", description: "kdo studenta přesunul" },
    ],
    defaultSubject: "Byli jste přesunuti na termín dopisování {{termin}}",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\n{{kym}} vás přesunul(a) z termínu {{puvodni_termin}} na nový termín dopisování.\n\nNový termín: {{termin}}\nUčebna: {{ucebna}}\nDozor: {{dozor}}\nPředměty: {{predmety}}",
  },
  {
    id: "makeup.reminder",
    module: "makeup",
    group: "Dopisování",
    label: "Připomínka den předem",
    description: "Zapsaným studentům den před termínem (denní úloha).",
    defaultEnabled: false,
    mandatory: false,
    bulk: true,
    variables: [
      JMENO,
      { name: "termin", description: "datum a čas termínu" },
      { name: "ucebna", description: "učebna" },
      { name: "dozor", description: "jméno dozoru" },
      { name: "predmety", description: "předměty zápisu" },
    ],
    defaultSubject: "Zítra dopisujete: {{termin}}",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\nzítra máte termín dopisování.\n\nKdy: {{termin}}\nUčebna: {{ucebna}}\nDozor: {{dozor}}\nPředměty: {{predmety}}",
  },
  {
    id: "makeup.digest",
    module: "makeup",
    group: "Dopisování",
    label: "Denní souhrn „zítra dopisují“",
    description: "Dozoru a vyučujícím předmětů: kdo zítra dopisuje (denní úloha).",
    defaultEnabled: false,
    mandatory: false,
    bulk: true,
    variables: [
      JMENO,
      { name: "datum", description: "zítřejší datum" },
      { name: "prehled", description: "seznam termínů a studentů" },
    ],
    defaultSubject: "Zítra dopisují ({{datum}})",
    defaultBody: "Dobrý den, {{jmeno}},\n\nzítra ({{datum}}) dopisují:\n\n{{prehled}}",
  },
  {
    id: "account.approved",
    module: "core",
    group: "Účty",
    label: "Účet schválen",
    description: "Uživateli po schválení jeho účtu administrátorem.",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [
      JMENO,
      { name: "role", description: "přidělená role (student, učitel)" },
      { name: "trida", description: "třída (u studenta)" },
      { name: "odkaz", description: "adresa aplikace" },
    ],
    defaultSubject: "Váš účet byl schválen",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\nváš účet byl schválen (role: {{role}}{{trida}}). Nyní se můžete naplno přihlásit a používat systém:\n{{odkaz}}",
  },
  {
    id: "account.pending.digest",
    module: "core",
    group: "Účty",
    label: "Souhrn účtů ke schválení",
    description: "Administrátorům, když nějaké účty čekají na schválení (denní úloha, jen když jich je alespoň jeden).",
    defaultEnabled: true,
    mandatory: false,
    bulk: true,
    variables: [
      JMENO,
      { name: "pocet", description: "počet čekajících účtů" },
      { name: "odkaz", description: "adresa stránky ke schválení" },
    ],
    defaultSubject: "Účty čekající na schválení: {{pocet}}",
    defaultBody: "Dobrý den, {{jmeno}},\n\nna schválení čeká účtů: {{pocet}}.\n\nSchválit je můžete zde: {{odkaz}}",
  },
  {
    id: "seminars.window.opened",
    module: "seminars",
    group: "Zápisy seminářů",
    label: "Zápis otevřen",
    description: "Studentům cílových ročníků, když se zápisové okno otevře (hodně e-mailů).",
    defaultEnabled: false,
    mandatory: false,
    bulk: true,
    variables: [
      JMENO,
      { name: "okno", description: "název zápisového okna" },
      { name: "zacatek", description: "začátek zápisu" },
      { name: "konec", description: "konec zápisu" },
      { name: "odkaz", description: "adresa aplikace" },
    ],
    defaultSubject: "Otevřel se zápis: {{okno}}",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\nzápis „{{okno}}“ je otevřen. Zapsat se můžete od {{zacatek}} do {{konec}}.\n\n{{odkaz}}",
  },
  {
    id: "seminars.window.reminder",
    module: "seminars",
    group: "Zápisy seminářů",
    label: "Připomínka nezapsaným",
    description:
      "Studentům, kteří nejsou zapsaní ve všech blocích. Ručně z detailu zápisového okna, nebo automaticky N dní před koncem (denní úloha).",
    defaultEnabled: false,
    mandatory: false,
    bulk: true,
    variables: [
      JMENO,
      { name: "okno", description: "název zápisového okna" },
      { name: "konec", description: "konec zápisu" },
      { name: "chybejici", description: "bloky, ve kterých student nemá zápis" },
      { name: "odkaz", description: "adresa aplikace" },
    ],
    defaultSubject: "Nezapomeňte se zapsat: {{okno}}",
    defaultBody:
      "Dobrý den, {{jmeno}},\n\nzápis „{{okno}}“ končí {{konec}} a vy ještě nemáte zapsáno: {{chybejici}}.\n\nZapsat se můžete zde: {{odkaz}}",
  },
  {
    id: "test",
    module: "core",
    group: "Ostatní",
    label: "Zkušební e-mail",
    description: "Zkušební e-mail z administrace (posílá se vždy, i když jsou upozornění vypnutá; počítá se do limitů).",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [JMENO],
    defaultSubject: "Zkušební e-mail",
    defaultBody: "Dobrý den, {{jmeno}},\n\ntoto je zkušební e-mail ze školního informačního systému. Odesílání funguje.",
  },
  {
    id: "manual.bulk",
    module: "core",
    group: "Ostatní",
    label: "Hromadný e-mail správce",
    description:
      "Ruční e-mail vybraným uživatelům ze seznamu uživatelů (předmět a text zadává správce). Při vypnutém hlavním vypínači e-mailových upozornění se neodešle; počítá se do denního a měsíčního limitu.",
    defaultEnabled: true,
    mandatory: true,
    bulk: false,
    variables: [JMENO],
    defaultSubject: "",
    defaultBody: "",
  },
];

export function getEmailEvent(id: string): EmailEventDef | undefined {
  return EMAIL_EVENTS.find((e) => e.id === id);
}

/**
 * Ruční události: nemají vlastní přepínač ani šablonu v administraci. Zkušební e-mail se posílá vždy,
 * hromadný e-mail správce respektuje hlavní vypínač e-mailů; limity platí u obou.
 * Text zadává ten, kdo je posílá (u zkušebního e-mailu je pevný).
 */
export const MANUAL_EMAIL_EVENTS: readonly EmailEventId[] = ["test", "manual.bulk"];

/** Události, které lze nastavovat v administraci (bez ručních). */
export const CONFIGURABLE_EMAIL_EVENTS = EMAIL_EVENTS.filter((e) => !MANUAL_EMAIL_EVENTS.includes(e.id));
