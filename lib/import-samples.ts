import { buildCsv } from "@/lib/csv";

// Vzorové soubory importů ke stažení (české i anglické hlavičky se při importu přijímají obě).

export const USERS_SAMPLE = buildCsv([
  ["firstName", "lastName", "email", "class", "role", "isActive", "password"],
  ["Jan", "Novák", "jan.novak@example.cz", "1.A", "STUDENT", "TRUE", "Heslo1234"],
  ["Eva", "Svobodová", "eva.svobodova@example.cz", "2.B", "STUDENT", "TRUE", ""],
  ["Petr", "Dvořák", "petr.dvorak@example.cz", "", "TEACHER", "TRUE", ""],
]);

export const ASSIGNMENTS_SAMPLE = buildCsv([
  ["email_ucitele", "kod_predmetu", "trida"],
  ["petr.dvorak@example.cz", "M", "2.A"],
  ["petr.dvorak@example.cz", "M", "2.B"],
  ["anna.kralova@example.cz", "ČJ", "1.A"],
]);

export const SUBJECTS_SAMPLE = buildCsv([
  ["nazev", "kod", "rocniky"],
  ["Matematika", "M", "1,2,3,4"],
  ["Seminář z dějepisu", "SDE", "3-4"],
  ["Deskriptivní geometrie", "DG", ""],
]);
