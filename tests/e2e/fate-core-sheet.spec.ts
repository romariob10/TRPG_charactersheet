import { expect, test } from "@playwright/test";
import {
  createGameSystemResponseSchema,
  sheetEditorDataResponseSchema,
  sheetTransferDocumentSchema,
} from "@mycharacter/contracts";
import { PDFDocument } from "pdf-lib";
import { Pool } from "pg";
import { createUser, e2eDatabaseUrl, expectStatus } from "./helpers";
test("Fate preset saves bindings, grows with text, adapts to mobile, and exports A4", async ({
  page,
}) => {
  const owner = await createUser("fate-sheet");
  const database = new Pool({ connectionString: e2eDatabaseUrl });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    const response = await owner.api.post("/api/game-systems", {
      data: { title: "Fate Core test", description: "", visibility: "private" },
    });
    await expectStatus(response, 201);
    const system = createGameSystemResponseSchema.parse(await response.json());
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/auth/sign-in");
    await page.getByRole("textbox", { name: /email|почт/i }).fill(owner.email);
    await page.getByLabel(/password|пароль/i).fill(owner.password);
    await page
      .getByRole("button", { name: /continue|продолжить/i, exact: true })
      .click();
    await page.waitForURL("**/dashboard/feed");
    await page.goto(
      `/dashboard/systems/${system.id}/sheets/${system.defaultSheetId}/builder`,
    );
    await page.getByRole("button", { name: "Вставить лист Fate Core" }).click();
    await expect
      .poll(async () => {
        const data = sheetEditorDataResponseSchema.parse(
          await (
            await owner.api.get(
              `/api/sheet-definitions/${system.defaultSheetId}/editor`,
            )
          ).json(),
        );
        return data.draft.fields.length;
      })
      .toBe(31);
    await expect(page.getByRole("button", { name: "Экспорт JSON", exact: true })).toBeEnabled();
    const exportedPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Экспорт JSON", exact: true }).click();
    const exported = await exportedPromise;
    const jsonStream = await exported.createReadStream();
    if (!jsonStream) throw new Error("Missing sheet JSON stream");
    const jsonChunks: Buffer[] = [];
    for await (const chunk of jsonStream) jsonChunks.push(Buffer.from(chunk));
    const jsonBytes = Buffer.concat(jsonChunks);
    const document = sheetTransferDocumentSchema.parse(JSON.parse(jsonBytes.toString("utf8")));
    expect(document.fields).toHaveLength(31);
    expect(document.fields.find((field) => field.key === "aspect_1")?.label).toBe("Концепция");
    expect(document.fields.find((field) => field.key === "consequence_1")?.label).toBe("Лёгкое последствие (2)");

    const copied = createGameSystemResponseSchema.parse(await (await owner.api.post("/api/game-systems", {
      data: { title: "Imported Fate", description: "", visibility: "private" },
    })).json());
    await page.goto(`/dashboard/systems/${copied.id}/sheets/${copied.defaultSheetId}/builder`);
    await page.getByLabel("Файл шаблона листа", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"formatVersion":99}') });
    await expect(page.getByRole("alert").filter({ hasText: "Не удалось прочитать" })).toContainText("Не удалось прочитать");
    await page.getByLabel("Файл шаблона листа", { exact: true }).setInputFiles({ name: "fate.mycharacter.json", mimeType: "application/json", buffer: jsonBytes });
    await expect(page.getByRole("dialog")).toContainText("полей: 31");
    await page.getByRole("button", { name: "Заменить черновик", exact: true }).click();
    const importedEditor = async () => sheetEditorDataResponseSchema.parse(await (await owner.api.get(`/api/sheet-definitions/${copied.defaultSheetId}/editor`)).json());
    await expect.poll(async () => (await importedEditor()).draft.fields.length).toBe(31);
    expect((await importedEditor()).draft.layouts).toEqual(document.layouts);
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect.poll(async () => (await importedEditor()).draft.fields.length).toBe(0);
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await expect.poll(async () => (await importedEditor()).draft.fields.length).toBe(31);
    const stale = await owner.api.post(`/api/sheet-definitions/${copied.defaultSheetId}/import`, { data: { expectedRevision: 0, document } });
    await expectStatus(stale, 409);
    const invalid = await owner.api.post(`/api/sheet-definitions/${copied.defaultSheetId}/import`, { data: { expectedRevision: (await importedEditor()).draft.revision, document: { ...document, formatVersion: 99 } } });
    await expectStatus(invalid, 400);
    const stranger = await createUser("fate-import-stranger");
    try {
      await expectStatus(await stranger.api.get(`/api/sheet-definitions/${copied.defaultSheetId}/export`), 403);
      await expectStatus(await stranger.api.post(`/api/sheet-definitions/${copied.defaultSheetId}/import`, { data: { expectedRevision: (await importedEditor()).draft.revision, document } }), 403);
    } finally {
      await stranger.api.dispose();
      await database.query("DELETE FROM users WHERE id = $1 AND email = $2", [stranger.id, stranger.email]);
    }
    const imported = await owner.api.post(`/api/sheet-definitions/${copied.defaultSheetId}/import`, { data: { expectedRevision: (await importedEditor()).draft.revision, document } });
    await expectStatus(imported, 200);

    const published = await owner.api.post(
      `/api/sheet-definitions/${copied.defaultSheetId}/publish`,
      { data: { changelog: "Fate test" } },
    );
    await expectStatus(published, 200);
    const version = (await published.json()) as {
      versionId: string;
    };
    const created = await owner.api.post("/api/characters", {
      data: { name: "Fate test", sheetVersionId: version.versionId },
    });
    await expectStatus(created, 201);
    const character = (await created.json()) as {
      id: string;
    };
    await page.goto(`/characters/${character.id}`);
    const root = page.locator("[data-sheet-page] > [data-node-id]");
    await expect(
      page.getByRole("textbox", { name: "Описание", exact: true }),
    ).toBeVisible();
    expect((await root.boundingBox())?.width).toBe(595);
    await page.evaluate(() => document.fonts.ready);
    const ornamentBounds = await page.getByText("жетоны судьбы", { exact: true }).evaluate((heading) => {
      const text = heading.getBoundingClientRect();
      const frame = heading.closest("[data-node-id]")!.getBoundingClientRect();
      return { left: text.left - frame.left, right: frame.right - text.right };
    });
    expect(ornamentBounds.left).toBeGreaterThanOrEqual(0);
    expect(ornamentBounds.right).toBeGreaterThanOrEqual(0);
    const cornerOffset = await page.getByText("описание", { exact: true }).evaluate((heading) => {
      const frame = heading.closest("[data-node-id]")!;
      const corner = frame.querySelector("svg")!.getBoundingClientRect();
      const bounds = frame.getBoundingClientRect();
      return { left: corner.left - bounds.left, top: corner.top - bounds.top };
    });
    expect(cornerOffset).toEqual({ left: 0, top: 0 });
    const initialHeight = (await root.boundingBox())!.height;
    const text =
      "Длинный аспект героя, который должен переноситься и увеличивать рамку. ".repeat(
        30,
      );
    const aspect = page.getByRole("textbox", {
      name: "Концепция",
      exact: true,
    });
    await aspect.fill(text);
    await aspect.press("Tab");
    await expect
      .poll(async () => (await root.boundingBox())!.height)
      .toBeGreaterThan(initialHeight + 200);
    await expect
      .poll(async () => {
        const values = await owner.api.get(
          `/api/characters/${character.id}/editor`,
        );
        return JSON.stringify(await values.json()).includes(text);
      })
      .toBe(true);
    await page.reload();
    await expect(aspect).toHaveValue(text);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-sheet-target="mobile"]')).toBeVisible();
    const overflowing = await page
      .locator("main textarea, main input[type=number]")
      .evaluateAll(
        (elements) =>
          elements.filter((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left < 0 || bounds.right > 390;
          }).length,
      );
    expect(overflowing).toBe(0);
    await page
      .getByRole("checkbox", { name: "Физический стресс 1", exact: true })
      .check();
    await page
      .getByRole("spinbutton", { name: "Жетоны судьбы", exact: true })
      .fill("3");
    await page
      .getByRole("spinbutton", { name: "Жетоны судьбы", exact: true })
      .press("Tab");
    await page.getByRole("button", { name: "Печать A4", exact: true }).click();
    await expect(page.locator('[data-sheet-target="print"]')).toBeVisible();
    expect((await root.boundingBox())?.height).toBe(842);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Экспорт векторного PDF", exact: true })
      .click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Missing PDF stream");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const pdf = await PDFDocument.load(Buffer.concat(chunks));
    expect(pdf.getPageCount()).toBe(1);
    expect(Math.round(pdf.getPage(0).getHeight())).toBe(842);
    expect(errors).toEqual([]);
  } finally {
    await database.query("DELETE FROM characters WHERE owner_id = $1", [
      owner.id,
    ]);
    await database.query("DELETE FROM game_systems WHERE owner_id = $1", [
      owner.id,
    ]);
    await database.query("DELETE FROM users WHERE id = $1 AND email = $2", [
      owner.id,
      owner.email,
    ]);
    await database.end();
    await owner.api.dispose();
  }
});
