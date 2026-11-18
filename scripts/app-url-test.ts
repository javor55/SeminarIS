// Test výpočtu adresy aplikace (node --experimental-strip-types)
import path from "node:path";
import { pathToFileURL } from "node:url";

// Dynamický import s příponou .ts (node ji vyžaduje, tsc u statického importu ne)
const urlModule = path.resolve(import.meta.dirname, "..", "lib", "email", "url.ts");
const { appBaseUrl } = (await import(pathToFileURL(urlModule).href)) as { appBaseUrl: (env: NodeJS.ProcessEnv) => string };

let fail = 0;
function check(name: string, env: Record<string, string>, expected: string) {
  const got = appBaseUrl(env as NodeJS.ProcessEnv);
  if (got === expected) console.log(`ok: ${name}`);
  else { fail++; console.log(`FAIL: ${name} – čekáno ${expected}, dostal ${got}`); }
}

check("lokálně bez proměnných", {}, "http://localhost:3000");
check("lokálně NEXTAUTH_URL", { NEXTAUTH_URL: "http://localhost:3001/" }, "http://localhost:3001");
check("Vercel produkce bez NEXTAUTH_URL", { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "skola.cz", VERCEL_URL: "x-abc.vercel.app" }, "https://skola.cz");
check("Vercel produkce s NEXTAUTH_URL na localhost", { VERCEL: "1", VERCEL_ENV: "production", NEXTAUTH_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "skola.cz" }, "https://skola.cz");
check("Vercel produkce se skutečnou NEXTAUTH_URL", { VERCEL: "1", VERCEL_ENV: "production", NEXTAUTH_URL: "https://is.skola.cz", VERCEL_PROJECT_PRODUCTION_URL: "skola.vercel.app" }, "https://is.skola.cz");
check("Vercel náhled", { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "skola.cz", VERCEL_URL: "x-abc.vercel.app" }, "https://x-abc.vercel.app");
check("APP_URL má přednost", { VERCEL: "1", VERCEL_ENV: "production", APP_URL: "https://akce.skola.cz/", NEXTAUTH_URL: "https://is.skola.cz" }, "https://akce.skola.cz");

if (fail) { console.log(`${fail} FAIL`); process.exit(1); }
