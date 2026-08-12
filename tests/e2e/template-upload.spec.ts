import { expect, test } from "@playwright/test";
import { createSyntheticAcroForm, createUser, expectStatus } from "./helpers";

test("a template PDF can be chosen, replaced by dropping, and uploaded", async ({
  browser,
}) => {
  const owner = await createUser("template-upload");
  const context = await browser.newContext({
    storageState: await owner.api.storageState(),
  });
  const page = await context.newPage();
  const pdf = Buffer.from(await createSyntheticAcroForm());

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

  const fileInput = page.locator('input[name="file"]');
  const uploadButton = page.locator('button[type="submit"]');
  await fileInput.setInputFiles({
    buffer: pdf,
    mimeType: "application/pdf",
    name: "chosen-sheet.pdf",
  });
  await expect(page.getByText("chosen-sheet.pdf")).toBeVisible();
  await expect(uploadButton).toBeEnabled();

  const dropZone = page.locator(
    `label[for="${await fileInput.getAttribute("id")}"]`,
  );
  await dropZone.evaluate((element, encodedPdf) => {
    const bytes = Uint8Array.from(atob(encodedPdf), (character) =>
      character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([bytes], "dropped-sheet.pdf", { type: "application/pdf" }),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, pdf.toString("base64"));
  await expect(page.getByText("dropped-sheet.pdf")).toBeVisible();

  await page.locator('input[name="gameSystem"]').fill("Upload acceptance");
  await page.locator('input[name="title"]').fill("Dropped PDF template");
  await page.locator('input[name="publishCommunity"]').uncheck();
  await uploadButton.click();

  await expect(page).toHaveURL(/\/dashboard\/systems\/[0-9a-f-]+$/);
  await expectStatus(await owner.api.get("/api/auth/session"), 200);

  await context.close();
  await owner.api.dispose();
});
