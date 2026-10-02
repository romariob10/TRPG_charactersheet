import { expect, test, type Page } from "@playwright/test";
import {
  defaultBoxProps,
  targetLayoutMapSchema,
  createGameSystemResponseSchema,
  sheetEditorDataResponseSchema,
  componentSummarySchema,
  publishComponentVersionResponseSchema,
  type FrameNode,
  type LayoutNode,
} from "@mycharacter/contracts";
import { Pool } from "pg";
import { createUser, e2eDatabaseUrl, expectStatus } from "./helpers";

function frame(
  name: string,
  direction: FrameNode["direction"],
  children: LayoutNode[],
  box: Partial<LayoutNode["box"]> = {},
): FrameNode {
  return {
    id: crypto.randomUUID(),
    name,
    kind: "frame",
    direction,
    gap: 10,
    align: "start",
    justify: "start",
    wrap: false,
    collapseAdjacentStrokes: false,
    ornamentStyle: "none",
    titleDock: { dock: "none", variant: "none" },
    footerDock: { dock: "none", variant: "none" },
    box: {
      ...structuredClone(defaultBoxProps),
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
      ...box,
    },
    children,
  };
}
function text(
  name: string,
  content: string,
  box: Partial<LayoutNode["box"]> = {},
): LayoutNode {
  return {
    id: crypto.randomUUID(),
    name,
    kind: "text",
    text: content,
    variant: "body",
    align: "left",
    weight: "normal",
    fontFamily: "Noto Sans",
    uppercase: false,
    color: "default",
    box: { ...structuredClone(defaultBoxProps), ...box },
  };
}
async function size(page: Page, node: LayoutNode) {
  return page.locator(`[data-node-id="${node.id}"]`).evaluate((element) => ({
    width: (element as HTMLElement).offsetWidth,
    height: (element as HTMLElement).offsetHeight,
  }));
}

test("Fill shares remaining space, nested frames stretch, and Hug stays intrinsic", async ({
  page,
}) => {
  const owner = await createUser("sheet-layout");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const database = new Pool({ connectionString: e2eDatabaseUrl });
  try {
    const response = await owner.api.post("/api/game-systems", {
      data: { title: "Synthetic auto layout", visibility: "private" },
    });
    await expectStatus(response, 201);
    const system = createGameSystemResponseSchema.parse(await response.json());
    const card = (name: string, content: string) =>
      frame(name, "vertical", [text(`${name}-text`, content)], {
        height: { mode: "fill" },
      });
    const left = card("left", "Short");
    const right = card("right", "Much longer content ".repeat(12));
    const fixed = text("fixed", "Fixed", {
      width: { mode: "fixed", value: 100 },
      height: { mode: "fill" },
    });
    const row = frame("row", "horizontal", [fixed, left, right], {
      height: { mode: "fixed", value: 200 },
    });
    const top = card("top", "Short");
    const bottom = card("bottom", "Long content ".repeat(20));
    const column = frame(
      "column",
      "vertical",
      [
        text("fixed-height", "Fixed", { height: { mode: "fixed", value: 40 } }),
        top,
        bottom,
      ],
      { height: { mode: "fill" } },
    );
    const hug = frame(
      "hug",
      "horizontal",
      [text("hug-text", "Hug", { width: { mode: "hug" } })],
      { width: { mode: "hug" } },
    );
    const limited = card("limited", "Limited");
    limited.box.maxWidth = 120;
    const remainder = card("remainder", "Remainder");
    const limits = frame("limits", "horizontal", [limited, remainder], {
      height: { mode: "fixed", value: 80 },
    });
    const template = frame(
      "component-template",
      "vertical",
      [text("component-label", "Reusable")],
      {
        width: { mode: "fixed", value: 100 },
        height: { mode: "fixed", value: 60 },
      },
    );
    const templateLayouts = targetLayoutMapSchema.parse({
      desktop: template,
      tablet: template,
      mobile: template,
      print: template,
    });
    const componentResponse = await owner.api.post("/api/components", {
      data: { name: "Synthetic fill component", layouts: templateLayouts },
    });
    await expectStatus(componentResponse, 201);
    const component = componentSummarySchema.parse(
      await componentResponse.json(),
    );
    const publishResponse = await owner.api.post(
      `/api/components/${component.id}/publish`,
      { data: {} },
    );
    await expectStatus(publishResponse, 200);
    const version = publishComponentVersionResponseSchema.parse(
      await publishResponse.json(),
    );
    const instance: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "component-instance",
      componentId: component.id,
      componentVersionId: version.versionId,
      propertyOverrides: {},
      box: {
        ...structuredClone(defaultBoxProps),
        height: { mode: "fixed", value: 90 },
      },
    };
    const root = frame(
      "root",
      "vertical",
      [row, column, hug, limits, instance],
      { height: { mode: "fixed", value: 800 } },
    );
    const layouts = targetLayoutMapSchema.parse({
      desktop: root,
      tablet: root,
      mobile: root,
      print: root,
    });
    const editorResponse = await owner.api.get(
      `/api/sheet-definitions/${system.defaultSheetId}/editor`,
    );
    await expectStatus(editorResponse, 200);
    const editor = sheetEditorDataResponseSchema.parse(
      await editorResponse.json(),
    );
    await expectStatus(
      await owner.api.put(
        `/api/sheet-definitions/${system.defaultSheetId}/draft`,
        {
          data: {
            expectedRevision: editor.draft.revision,
            layouts,
            fields: [],
          },
        },
      ),
      200,
    );
    sheetEditorDataResponseSchema.parse(
      await (
        await owner.api.get(
          `/api/sheet-definitions/${system.defaultSheetId}/editor`,
        )
      ).json(),
    );
    // Use the normal login flow; no authentication bypass is needed.
    await page.goto("/auth/sign-in");
    await page.getByRole("textbox", { name: /email|почт/i }).fill(owner.email);
    await page.getByLabel(/password|пароль/i).fill(owner.password);
    await page
      .getByRole("button", { name: /continue|продолжить/i, exact: true })
      .click();
    await page.waitForURL("**/dashboard/feed", { timeout: 15_000 });
    await page.goto(
      `/dashboard/systems/${system.id}/sheets/${system.defaultSheetId}/builder`,
    );
    await expect(page.locator(`[data-node-id="${root.id}"]`)).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .getByRole("button", {
          name: width === 390 ? "Мобильный" : "Десктоп",
          exact: true,
        })
        .click();
      await expect
        .poll(async () =>
          Math.abs(
            (await size(page, left)).width - (await size(page, right)).width,
          ),
        )
        .toBeLessThanOrEqual(1);
      expect((await size(page, fixed)).width).toBe(100);
      expect(
        Math.abs(
          (await size(page, left)).height -
            ((await size(page, row)).height - 22),
        ),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(
          (await size(page, top)).height - (await size(page, bottom)).height,
        ),
      ).toBeLessThanOrEqual(1);
      expect((await size(page, hug)).width).toBeLessThan(100);
      expect((await size(page, hug)).height).toBeGreaterThan(20);
      expect((await size(page, limited)).width).toBe(120);
      expect((await size(page, remainder)).width).toBeGreaterThan(120);
      expect((await size(page, template)).width).toBe(
        (await size(page, instance)).width,
      );
      expect((await size(page, template)).height).toBe(90);
    }
    // Change a child's mode through the inspector, then verify persistence.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Десктоп", exact: true }).click();
    await page
      .locator(`[data-node-id="${left.id}"]`)
      .click({ position: { x: 4, y: 4 } });
    await page
      .getByRole("combobox", { name: /width|ширина/i, exact: true })
      .selectOption("hug");
    await expect
      .poll(
        async () =>
          (await size(page, left)).width < (await size(page, right)).width,
      )
      .toBe(true);
    await page
      .getByRole("combobox", { name: /width|ширина/i, exact: true })
      .selectOption("fill");
    await expect
      .poll(async () =>
        Math.abs(
          (await size(page, left)).width - (await size(page, right)).width,
        ),
      )
      .toBeLessThanOrEqual(1);
    await expect
      .poll(
        async () =>
          sheetEditorDataResponseSchema.parse(
            await (
              await owner.api.get(
                `/api/sheet-definitions/${system.defaultSheetId}/editor`,
              )
            ).json(),
          ).draft.revision,
      )
      .toBeGreaterThan(editor.draft.revision + 1);
    await page.reload();
    await expect(page.locator(`[data-node-id="${left.id}"]`)).toBeVisible();
    expect(
      Math.abs(
        (await size(page, left)).width - (await size(page, right)).width,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  } finally {
    await database.query("DELETE FROM game_systems WHERE owner_id = $1", [
      owner.id,
    ]);
    await database.query(
      "DELETE FROM component_definitions WHERE author_id = $1",
      [owner.id],
    );
    await database.query("DELETE FROM users WHERE id = $1 AND email = $2", [
      owner.id,
      owner.email,
    ]);
    await database.end();
    await owner.api.dispose();
  }
});
