// Šablony e-mailů: proměnné ve tvaru {{jmeno}}. Čistá funkce, použitelná i v klientu.

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Dosadí proměnné; neznámá nebo chybějící proměnná se nahradí prázdným textem. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(VAR_RE, (_, name: string) => vars[name.toLowerCase()] ?? "");
}

/** Proměnné použité v šabloně, které událost nezná (kvůli překlepům při úpravě v administraci). */
export function unknownVariables(template: string, allowed: readonly string[]): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    const name = m[1].toLowerCase();
    if (!allowed.includes(name)) found.add(name);
  }
  return [...found];
}
