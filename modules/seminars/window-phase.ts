// Stav zápisového okna. Čistá logika bez DB (používá server i UI), JEDINÝ zdroj pravdy o tom, zda je zápis otevřený.
//
// V databázi jsou jen tři údaje: `published` (zveřejněno studentům, jinak koncept), `startsAt` / `endsAt`
// a `closedEarlyAt` (správce okno předčasně uzavřel). Stav plánováno / otevřeno / uzavřeno se z nich vždy
// počítá, nikde se neukládá, takže se nemůže rozejít s časem a není co synchronizovat.

export type WindowPhase = "DRAFT" | "PLANNED" | "OPEN" | "CLOSED";

export type WindowPhaseInput = {
  published: boolean;
  closedEarlyAt?: Date | string | null;
  startsAt: Date | string;
  endsAt: Date | string;
};

export type WindowPhaseInfo = {
  phase: WindowPhase;
  /** Uzavřeno předčasně (správcem, před koncem podle dat). */
  closedEarly: boolean;
  /** Krátký český popisek stavu pro štítky. */
  label: string;
  /** Lze okno znovu otevřít (předčasně uzavřené, konec ještě neuplynul)? */
  canReopen: boolean;
  /** Lze okno předčasně uzavřít (zveřejněné a právě otevřené)? */
  canCloseEarly: boolean;
};

const LABELS: Record<WindowPhase, string> = { DRAFT: "Koncept", PLANNED: "Naplánováno", OPEN: "Otevřeno", CLOSED: "Uzavřeno" };

export function windowPhase(w: WindowPhaseInput, now: Date = new Date()): WindowPhaseInfo {
  const start = new Date(w.startsAt);
  const end = new Date(w.endsAt);
  const early = w.closedEarlyAt ? new Date(w.closedEarlyAt) : null;
  const closedEarly = !!early && early <= now && now <= end;
  let phase: WindowPhase;
  if (!w.published) phase = "DRAFT";
  else if (early && early <= now) phase = "CLOSED";
  else if (now < start) phase = "PLANNED";
  else if (now <= end) phase = "OPEN";
  else phase = "CLOSED";
  return {
    phase,
    closedEarly,
    label: closedEarly ? "Uzavřeno předčasně" : LABELS[phase],
    canReopen: w.published && closedEarly,
    canCloseEarly: phase === "OPEN",
  };
}

/** Je zápis právě otevřený (zveřejněno, v termínu, předčasně neuzavřeno)? Rozhoduje server při každém zápisu. */
export function isWindowOpen(w: WindowPhaseInput, now: Date = new Date()): boolean {
  return windowPhase(w, now).phase === "OPEN";
}

/** Prisma podmínky na `EnrollmentWindow` odpovídající `windowPhase` (pro dotazy, které stav nenačítají po řádcích). */
export function openWindowWhere(now: Date = new Date()) {
  return { published: true, closedEarlyAt: null, startsAt: { lte: now }, endsAt: { gte: now } };
}
/** Zveřejněná okna, která ještě neskončila (otevřená i naplánovaná), bez předčasně uzavřených. */
export function liveWindowWhere(now: Date = new Date()) {
  return { published: true, closedEarlyAt: null, endsAt: { gte: now } };
}
