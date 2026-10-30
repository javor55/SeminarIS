/** České skloňování podle počtu: plural(3, "termín", "termíny", "termínů") → „termíny“. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  if (abs >= 2 && abs <= 4) return few;
  return many;
}
