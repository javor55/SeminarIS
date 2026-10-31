import type { DemoRandom } from "@/modules/server-types";

// Realistická česká jména pro ukázková data. Příjmení mají mužský a ženský tvar.

const MALE = [
  "Jan", "Jakub", "Tomáš", "Ondřej", "Matěj", "Adam", "Filip", "Vojtěch", "David", "Lukáš",
  "Martin", "Daniel", "Michal", "Petr", "Jiří", "Štěpán", "Marek", "Dominik", "Šimon", "Samuel",
  "Patrik", "Kryštof", "Dalibor", "Radek", "Viktor", "Matyáš", "Antonín", "Oskar", "Richard", "Robin",
];
const FEMALE = [
  "Tereza", "Eliška", "Anna", "Kateřina", "Adéla", "Natálie", "Karolína", "Veronika", "Barbora", "Kristýna",
  "Lucie", "Markéta", "Nikola", "Michaela", "Klára", "Aneta", "Sára", "Denisa", "Gabriela", "Petra",
  "Monika", "Magdaléna", "Hana", "Zuzana", "Simona", "Viktorie", "Julie", "Ivana", "Marie", "Alena",
];
// [mužský tvar, ženský tvar]
const SURNAMES: [string, string][] = [
  ["Novák", "Nováková"], ["Svoboda", "Svobodová"], ["Novotný", "Novotná"], ["Dvořák", "Dvořáková"], ["Černý", "Černá"],
  ["Procházka", "Procházková"], ["Kučera", "Kučerová"], ["Veselý", "Veselá"], ["Horák", "Horáková"], ["Němec", "Němcová"],
  ["Marek", "Marková"], ["Pospíšil", "Pospíšilová"], ["Pokorný", "Pokorná"], ["Hájek", "Hájková"], ["Král", "Králová"],
  ["Jelínek", "Jelínková"], ["Růžička", "Růžičková"], ["Beneš", "Benešová"], ["Fiala", "Fialová"], ["Sedláček", "Sedláčková"],
  ["Doležal", "Doležalová"], ["Zeman", "Zemanová"], ["Kolář", "Kolářová"], ["Navrátil", "Navrátilová"], ["Čermák", "Čermáková"],
  ["Urban", "Urbanová"], ["Vaněk", "Vaňková"], ["Blažek", "Blažková"], ["Kříž", "Křížová"], ["Kovář", "Kovářová"],
  ["Bartoš", "Bartošová"], ["Vlček", "Vlčková"], ["Polák", "Poláková"], ["Musil", "Musilová"], ["Šimek", "Šimková"],
  ["Konečný", "Konečná"], ["Malý", "Malá"], ["Holub", "Holubová"], ["Štěpánek", "Štěpánková"], ["Kratochvíl", "Kratochvílová"],
  ["Mareš", "Marešová"], ["Šíma", "Šímová"], ["Tichý", "Tichá"], ["Matoušek", "Matoušková"], ["Havlík", "Havlíková"],
  ["Bureš", "Burešová"], ["Hruška", "Hrušková"], ["Kopecký", "Kopecká"], ["Bartáček", "Bartáčková"], ["Vávra", "Vávrová"],
  ["Soukup", "Soukupová"], ["Šťastný", "Šťastná"], ["Říha", "Říhová"], ["Mach", "Machová"], ["Staněk", "Staňková"],
  ["Krejčí", "Krejčí"], ["Šebesta", "Šebestová"], ["Dušek", "Dušková"], ["Ševčík", "Ševčíková"], ["Hanák", "Hanáková"],
];

export type DemoName = { firstName: string; lastName: string };

/** "Šťastný Řehoř" → "stastny.rehor": bez diakritiky, malá písmena, jen a–z a 0–9. */
export function asciiSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Generátor jmen, který se nikdy nezopakuje (kombinace jméno + příjmení je jedinečná). */
export function createNamePicker(rng: DemoRandom) {
  const used = new Set<string>();
  return (): DemoName => {
    for (let i = 0; i < 1000; i++) {
      const female = rng.chance(0.5);
      const firstName = rng.pick(female ? FEMALE : MALE);
      const [m, f] = rng.pick(SURNAMES);
      const lastName = female ? f : m;
      const key = `${firstName} ${lastName}`;
      if (used.has(key)) continue;
      used.add(key);
      return { firstName, lastName };
    }
    throw new Error("Nepodařilo se vygenerovat jedinečné jméno.");
  };
}
