/** Adresa aplikace pro odkazy v e-mailech (NEXTAUTH_URL, bez koncového lomítka). */
export function appUrl(path = ""): string {
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
