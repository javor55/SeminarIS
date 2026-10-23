import { defineConfig } from "@playwright/test";

// End-to-end testy celé aplikace (prohlížeč + produkční build + PostgreSQL).
// Spuštění: npm run build && npm run test:e2e  (DATABASE_URL na testovací DB – testy ji mažou!)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Testy sdílí jednu databázi – běží postupně
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    timezoneId: "Europe/Prague",
    locale: "cs-CZ",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
