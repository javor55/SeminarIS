// Stav události: popisky, barvy a povolené přechody (čistá logika bez DB, použije server i UI).

export type EventStatusValue = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";

export const EVENT_STATUS_LABEL: Record<EventStatusValue, string> = {
  DRAFT: "Koncept",
  PUBLISHED: "Zveřejněno",
  CLOSED: "Registrace uzavřena",
  ARCHIVED: "Archiv",
};

export const EVENT_STATUS_FILTERS: EventStatusValue[] = ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"];

/** Tlačítko změny stavu: cílový stav a popisek podle výchozího stavu. */
export type StatusAction = { to: EventStatusValue; label: string; variant: "default" | "outline" | "destructive" };

export const STATUS_ACTIONS: Record<EventStatusValue, StatusAction[]> = {
  DRAFT: [
    { to: "PUBLISHED", label: "Zveřejnit", variant: "default" },
    { to: "ARCHIVED", label: "Archivovat", variant: "outline" },
  ],
  PUBLISHED: [
    { to: "CLOSED", label: "Uzavřít registraci", variant: "outline" },
    { to: "ARCHIVED", label: "Archivovat", variant: "outline" },
    { to: "DRAFT", label: "Vrátit do konceptu", variant: "outline" },
  ],
  CLOSED: [
    { to: "PUBLISHED", label: "Zveřejnit znovu", variant: "default" },
    { to: "ARCHIVED", label: "Archivovat", variant: "outline" },
    { to: "DRAFT", label: "Vrátit do konceptu", variant: "outline" },
  ],
  ARCHIVED: [{ to: "DRAFT", label: "Vrátit do konceptu", variant: "outline" }],
};

export function canChangeStatus(from: EventStatusValue, to: EventStatusValue): boolean {
  return STATUS_ACTIONS[from].some((a) => a.to === to);
}
