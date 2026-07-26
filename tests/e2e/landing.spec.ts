import { expect, test } from "@playwright/test";

test("landing page exposes the primary product actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Создать персонажа|Create a character/ })).toBeVisible();
  await expect(page.getByText(/Умный каталог полей|Smart field catalog/)).toBeVisible();
});
