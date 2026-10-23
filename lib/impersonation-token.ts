// Podepsaný token „zobrazit jako uživatel“ (cookie). Čistá logika přes Web Crypto, takže
// běží i v middleware (Edge). Podpis je HMAC-SHA256 s NEXTAUTH_SECRET; bez platného podpisu
// a neprošlé platnosti se token ignoruje. Jestli je přihlášený skutečně aktivní ADMIN
// a cíl existuje, ověřuje server při každém požadavku (lib/impersonation.ts).

export const IMPERSONATION_COOKIE = "seminaris_impersonate";
export const IMPERSONATION_TTL_SECONDS = 60 * 60;

export type ImpersonationPayload = {
  // id admina, který náhled spustil (token patří jen jemu)
  a: string;
  // id zobrazovaného uživatele
  t: string;
  // role zobrazovaného uživatele v okamžiku spuštění (jen pro rozhodnutí v middleware;
  // server ji vždy znovu načte z databáze)
  r: string;
  // konec platnosti (epoch, sekundy)
  exp: number;
};

const enc = new TextEncoder();
const PREFIX = "impersonate.v1.";

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function key(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signImpersonation(payload: ImpersonationPayload, secret: string): Promise<string> {
  if (!secret) throw new Error("Chybí NEXTAUTH_SECRET.");
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret, "sign"), enc.encode(PREFIX + body));
  return `${body}.${toB64Url(new Uint8Array(sig))}`;
}

/** Vrátí obsah tokenu jen při platném podpisu a neprošlé platnosti, jinak null. */
export async function verifyImpersonation(
  token: string | undefined | null,
  secret: string | undefined,
  nowMs: number = Date.now()
): Promise<ImpersonationPayload | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const sigBytes = fromB64Url(sig);
  if (!sigBytes) return null;
  // crypto.subtle.verify porovnává podpis v konstantním čase
  const ok = await crypto.subtle.verify("HMAC", await key(secret, "verify"), sigBytes, enc.encode(PREFIX + body));
  if (!ok) return null;
  try {
    const raw = fromB64Url(body);
    if (!raw) return null;
    const p = JSON.parse(new TextDecoder().decode(raw)) as Partial<ImpersonationPayload>;
    if (typeof p.a !== "string" || typeof p.t !== "string" || typeof p.r !== "string" || typeof p.exp !== "number") return null;
    if (p.exp * 1000 <= nowMs) return null;
    return { a: p.a, t: p.t, r: p.r, exp: p.exp };
  } catch {
    return null;
  }
}
