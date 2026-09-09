import { expect, test } from "@playwright/test";
import { createUser, expectStatus } from "./helpers";

test("a game system can be created and opened in the sheet builder", async ({
  browser,
}) => {
  const owner = await createUser("system-creation");
  const context = await browser.newContext({
    storageState: await owner.api.storageState(),
  });
  const page = await context.newPage();

  await page.goto("/dashboard");
  const emptyPanel = page
    .getByRole("heading", { name: "Здесь пока нет персонажей" })
    .locator("..");
  const section = emptyPanel.locator("..");
  const [panelWidth, sectionWidth] = await Promise.all([
    emptyPanel.evaluate((element) => element.clientWidth),
    section.evaluate((element) => element.clientWidth),
  ]);
  expect(panelWidth / sectionWidth).toBeGreaterThan(0.95);

  await page.goto("/dashboard/systems/new");
  const titleInput = page.locator("#system-title");
  const uploadButton = page.locator('button[type="submit"]');
  await expect(titleInput).toBeVisible();
  await expect(uploadButton).toBeDisabled();
  await titleInput.fill("Acceptance system");
  await expect(uploadButton).toBeEnabled();
  await uploadButton.click();

  await expect(page).toHaveURL(
    /\/dashboard\/systems\/[0-9a-f-]+\/(?:workspace|sheets\/[0-9a-f-]+\/builder)$/,
  );
  await expectStatus(await owner.api.get("/api/auth/session"), 200);

  await context.close();
  await owner.api.dispose();
});
