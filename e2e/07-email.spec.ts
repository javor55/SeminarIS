import { test, expect } from "@playwright/test";
import { sql, resetDb, login, toastText } from "./helpers";

// Administrace → Upozornění: stav konfigurace a zkušební e-mail sobě. V CI je EMAIL_TRANSPORT=log
// (nic se neodesílá, jen zapisuje do EmailLogu); bez konfigurace stránka ukáže, co chybí.

test.beforeAll(() => {
  resetDb();
});

test("upozornění: zkušební e-mail sobě se zapíše do přehledu", async ({ browser }) => {
  const p = await login(browser, "admin@skola.cz");
  await p.goto("/admin");
  // z administrace se jde na Upozornění a Historii
  await expect(p.getByTestId("notifications-link")).toBeVisible();
  await p.getByTestId("notifications-link").getByRole("link").click();
  await p.waitForURL("**/admin/notifications");
  const card = p.getByTestId("email-card");
  await expect(card).toBeVisible();
  const send = card.getByTestId("email-send");

  if (!process.env.EMAIL_FROM) {
    await expect(p.getByTestId("email-missing")).toContainText("EMAIL_FROM");
    await expect(send).toBeDisabled();
    return;
  }

  await expect(p.getByTestId("email-status")).toContainText(process.env.EMAIL_FROM);
  await expect(p.getByTestId("email-usage")).toContainText("Dnes 0 / 90");
  await expect(p.getByTestId("email-usage")).toContainText("tento měsíc 0 / 2 900");

  await send.click();
  expect(await toastText(p)).toContain("Zkušební e-mail odeslán na admin@skola.cz");
  expect(sql(`select status||'|'||recipient||'|'||event from "EmailLog"`)).toBe("SENT|admin@skola.cz|test");
  // přehled odeslaných e-mailů ukazuje záznam a počítadlo se zvýšilo
  await p.reload();
  await expect(p.getByTestId("email-usage")).toContainText("Dnes 1 / 90");
  const row = p.getByTestId("email-log-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("admin@skola.cz");
  await expect(row).toContainText("Zkušební e-mail");
});
