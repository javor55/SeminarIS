import { isInAudience, type AudienceEntry, type AudienceStudent } from "@/modules/core/audience";

// Kdo se smí registrovat na událost s viditelností „jen pro přihlášené“ (čistá logika bez DB, používá ji veřejná stránka
// a později serverová akce registrace).

export type AudienceRole = "STUDENT" | "TEACHER" | "ADMIN";

export const AUDIENCE_ROLES: { value: AudienceRole; label: string }[] = [
  { value: "STUDENT", label: "Studenti" },
  { value: "TEACHER", label: "Učitelé" },
  { value: "ADMIN", label: "Administrátoři" },
];

export const DEFAULT_AUDIENCE_ROLES: AudienceRole[] = ["STUDENT"];

export type RegistrationAudience = {
  visibility: "PUBLIC" | "USERS";
  /** Role z nastavení události (hodnoty jiné než AudienceRole, např. GUEST, se nikdy neuplatní) */
  audienceRoles: readonly string[];
  /** Publikum (ročníky, třídy, jmenovitě, vynechaní); zužuje jen studenty */
  audience: readonly AudienceEntry[];
};

/**
 * Smí se uživatel registrovat? Veřejná událost: kdokoli (i nepřihlášený). Jen pro přihlášené: role uživatele musí být
 * zaškrtnutá a student navíc musí splňovat publikum. Učitelé a admini, jsou-li zaškrtnutí, smějí vždy. Neschválený
 * účet (host) se nesmí registrovat nikdy.
 * `student` = údaje studenta pro publikum (`null` = není aktivní student, pak se registrovat nesmí).
 */
export function canUserRegister(event: RegistrationAudience, user: { id: string; role: string } | null, student: AudienceStudent | null): boolean {
  if (event.visibility === "PUBLIC") return true;
  if (!user || user.role === "GUEST") return false;
  if (!event.audienceRoles.includes(user.role)) return false;
  if (user.role !== "STUDENT") return true;
  return !!student && isInAudience(event.audience, student);
}
