// Konstanty ukázkových dat bez závislostí na serveru (použije je i klientská komponenta).

/**
 * Klíč SystemSetting se společným heslem ukázkových účtů. Heslo se generuje náhodně při každém naplnění
 * (nesmí být v kódu – kdo zná kód, nesmí se přihlásit do produkce), zobrazuje se jen adminovi a při
 * smazání ukázkových dat se odstraní.
 */
export const DEMO_PASSWORD_SETTING = "demo.password";
export const DEMO_SEED_CONFIRM_WORD = "UKÁZKA";
export const DEMO_CLEAR_CONFIRM_WORD = "SMAZAT";

/** Učitel, který se v administraci nabízí k „Zobrazit jako“: učí matematiku, vede seminář a dozoruje dopisování (má co ukázat). */
export const DEMO_SHOWCASE_TEACHER_ID = "demo-teacher-06";
