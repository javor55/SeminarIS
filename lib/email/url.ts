// Adresa aplikace pro absolutní odkazy (e-maily, potvrzení registrace, QR kódy, .ics).
//
// Pořadí:
// 1. APP_URL – ruční nastavení (např. vlastní doména), má vždy přednost,
// 2. NEXTAUTH_URL – pokud není nastavené na localhost při běhu na Vercelu,
// 3. na Vercelu produkční doména projektu (VERCEL_PROJECT_PRODUCTION_URL, včetně vlastní domény),
//    v náhledech adresa konkrétního nasazení (VERCEL_URL),
// 4. http://localhost:3000 pro lokální vývoj a testy.

function isLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

function withProtocol(host: string): string {
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const onVercel = !!env.VERCEL;
  const candidates: (string | undefined)[] = [env.APP_URL];
  const nextAuth = env.NEXTAUTH_URL;
  if (nextAuth && !(onVercel && isLocal(nextAuth))) candidates.push(nextAuth);
  if (onVercel) {
    if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
      candidates.push(withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL));
    }
    if (env.VERCEL_URL) candidates.push(withProtocol(env.VERCEL_URL));
  }
  candidates.push("http://localhost:3000");
  const base = candidates.find((c) => !!c && c.trim() !== "")!;
  return base.trim().replace(/\/+$/, "");
}

/** Absolutní adresa v aplikaci (bez koncového lomítka u základu). */
export function appUrl(path = ""): string {
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
