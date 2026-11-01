"use client";

import { useSyncExternalStore } from "react";

/** Pod breakpointem `md` (Tailwind, 768 px) se místo tabulek zobrazují karty. */
const MOBILE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Je okno užší než `md`? Na serveru a při hydrataci vrací `false` (desktop), po hydrataci
 * se přepne podle skutečné šířky. Díky tomu se vykreslí vždy jen jedna varianta (tabulka
 * NEBO karty), takže v DOMu nejsou duplicitní ovládací prvky.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}
