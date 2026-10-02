import { expect, test } from "@playwright/test";
import { createGameSystemResponseSchema, defaultBoxProps, layoutNodeSchema, sheetEditorDataResponseSchema, sheetFieldDefinitionSchema } from "@mycharacter/contracts";
import { PDFDocument } from "pdf-lib";
import { Pool } from "pg";
import { createUser, e2eDatabaseUrl, expectStatus } from "./helpers";

test("textarea lists save independent multiline items and player-selected counts", async ({ page }) => {
  const owner = await createUser("textarea-lists");
  const database = new Pool({ connectionString: e2eDatabaseUrl });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const created = await owner.api.post("/api/game-systems", { data: { title: "Text controls", visibility: "private" } });
    await expectStatus(created, 201);
    const system = createGameSystemResponseSchema.parse(await created.json());
    const editor = sheetEditorDataResponseSchema.parse(await (await owner.api.get(`/api/sheet-definitions/${system.defaultSheetId}/editor`)).json());
    const box = { ...defaultBoxProps, height: { mode: "fixed", value: 100 } };
    const keys = ["single", "plain", "bullets", "numbered", "ruled"];
    const fields = keys.map(key => sheetFieldDefinitionSchema.parse({ id: crypto.randomUUID(), key, label: key, kind: key === "single" ? "text" : "multiline" }));
    const root = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", direction: "vertical", gap: 8,
      box: { ...defaultBoxProps, width: { mode: "fixed", value: 595 } }, children: [
        { id: crypto.randomUUID(), kind: "field-input", name: "single", fieldBinding: "single", variant: "plain", box: { ...box, height: { mode: "fixed", value: 40 } } },
        { id: crypto.randomUUID(), kind: "textarea", name: "plain", fieldBinding: "plain", variant: "plain", box },
        ...(["bulleted", "numbered", "lined"] as const).map((listStyle, index) => ({
          id: crypto.randomUUID(), kind: "textarea", name: keys[index + 2], fieldBinding: keys[index + 2], listStyle,
          itemCount: index === 1 ? 3 : 2, allowItemCountChange: index === 0, variant: "plain", box,
        })),
      ] });
    await expectStatus(await owner.api.put(`/api/sheet-definitions/${system.defaultSheetId}/draft`, { data: {
      expectedRevision: editor.draft.revision, fields, layouts: { desktop: root, tablet: root,
        mobile: { ...root, box: { ...root.box, width: { mode: "fill" } } },
        print: { ...root, box: { ...root.box, height: { mode: "fixed", value: 842 } } } },
    } }), 200);
    const version = await (await owner.api.post(`/api/sheet-definitions/${system.defaultSheetId}/publish`, { data: { changelog: "Text controls" } })).json();
    const character = await (await owner.api.post("/api/characters", { data: { name: "Text controls", sheetVersionId: version.versionId } })).json();
    await page.goto("/auth/sign-in");
    await page.getByRole("textbox", { name: /email|почт/i }).fill(owner.email);
    await page.getByLabel(/password|пароль/i).fill(owner.password);
    await page.getByRole("button", { name: /continue|продолжить/i, exact: true }).click();
    await page.waitForURL("**/dashboard/feed");
    await page.goto(`/characters/${character.id}`);
    const single = page.getByRole("textbox", { name: "single", exact: true });
    await expect(single).toHaveCSS("font-size", "24px");
    expect(await single.evaluate(element => element.tagName)).toBe("INPUT");
    await single.fill("One line");
    const plain = page.getByRole("textbox", { name: "plain", exact: true });
    await plain.fill("Line one\nLine two");
    const font = page.getByRole("slider", { name: "Шрифт многострочного текста" });
    await font.press("ArrowLeft"); await font.press("ArrowLeft"); await font.press("Tab");
    await expect(plain).toHaveCSS("font-size", "10px");
    await expect(plain).toHaveCSS("line-height", "12.5px");
    await expect(single).toHaveCSS("font-size", "24px");
    const bullets = page.getByRole("list", { name: "bullets", exact: true });
    await bullets.getByRole("textbox").nth(0).fill("First bullet\ncontinued");
    await bullets.getByRole("textbox").nth(1).fill("Second bullet");
    await page.getByRole("button", { name: "Добавить пункт", exact: true }).click();
    await expect(bullets.getByRole("textbox")).toHaveCount(3);
    await bullets.getByRole("textbox").nth(2).fill("Third bullet");
    await bullets.getByRole("textbox").nth(2).press("Tab");
    const state = async () => (await (await owner.api.get(`/api/characters/${character.id}/sheet-state`)).json()).values;
    await expect.poll(async () => (await state()).bullets).toEqual(["First bullet\ncontinued", "Second bullet", "Third bullet"]);
    await page.reload();
    await expect(bullets.getByRole("textbox")).toHaveCount(3);
    await page.getByRole("button", { name: "Удалить пункт 3", exact: true }).click();
    await expect.poll(async () => (await state()).bullets).toEqual(["First bullet\ncontinued", "Second bullet"]);
    await expect(page.getByRole("list", { name: "numbered", exact: true }).getByRole("textbox")).toHaveCount(3);
    await expect(page.getByRole("list", { name: "ruled", exact: true }).getByRole("textbox")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(bullets.getByRole("textbox").nth(0)).toHaveValue("First bullet\ncontinued");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Экспорт векторного PDF", exact: true }).click();
    const stream = await (await downloadPromise).createReadStream();
    if (!stream) throw new Error("Missing PDF stream");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect((await PDFDocument.load(Buffer.concat(chunks))).getPageCount()).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await database.query("DELETE FROM characters WHERE owner_id = $1", [owner.id]);
    await database.query("DELETE FROM game_systems WHERE owner_id = $1", [owner.id]);
    await database.query("DELETE FROM users WHERE id = $1 AND email = $2", [owner.id, owner.email]);
    await database.end(); await owner.api.dispose();
  }
});
