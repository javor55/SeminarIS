import { test, expect } from "@playwright/test";
import { resetDb, login, toastText } from "./helpers";

// Zkušební e-mail z administrace. V CI je EMAIL_TRANSPORT=log (nic se neodesílá);
// bez konfigurace karta ukáže, co chybí, a odeslání je vypnuté.

test.beforeAll(() => {
  resetDb();
});

test("administrace: zkušební e-mail", async ({ browser }) => {
  const p = await login(browser, "admin@skola.cz");
  await p.goto("/admin");
  const card = p.getByTestId("email-card");
  await expect(card).toBeVisible();
  const send = card.getByTestId("email-send");

  if (!process.env.EMAIL_FROM) {
    await expect(card).toContainText("EMAIL_FROM");
    await expect(send).toBeDisabled();
    return;
  }

  await expect(card).toContainText(process.env.EMAIL_FROM);
  // neplatný adresát
  await p.fill("#email-to", "neplatna-adresa");
  await send.click();
  expect(await toastText(p)).toContain("platnou e-mailovou adresu");
  // platný
  await p.fill("#email-to", "nekdo@example.com");
  await p.fill("#email-subject", "Test");
  await p.fill("#email-text", "Ahoj,\n\ntoto je test.");
  await send.click();
  expect(await toastText(p)).toContain("E-mail odeslán na nekdo@example.com");
});
